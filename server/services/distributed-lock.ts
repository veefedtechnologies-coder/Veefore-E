import mongoose from 'mongoose';

interface LockDocument {
  _id: string;
  instanceId: string;
  acquiredAt: Date;
  expiresAt: Date;
  renewedAt: Date;
}

interface LockOptions {
  ttlMs?: number;
  renewIntervalMs?: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_RENEW_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

class DistributedLockService {
  private instanceId: string;
  private renewalIntervals: Map<string, NodeJS.Timeout> = new Map();
  private acquiredLocks: Set<string> = new Set();

  constructor() {
    this.instanceId = this.generateInstanceId();
    console.log(`[DISTRIBUTED LOCK] Instance ID: ${this.instanceId}`);
  }

  private generateInstanceId(): string {
    return process.env.REPL_ID || 
           process.env.INSTANCE_ID || 
           `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private async getLockCollection(): Promise<mongoose.mongo.Collection<LockDocument> | null> {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.log('[DISTRIBUTED LOCK] MongoDB not connected yet');
        return null;
      }
      return mongoose.connection.db.collection<LockDocument>('instance_locks');
    } catch (error) {
      console.error('[DISTRIBUTED LOCK] Failed to get lock collection:', error);
      return null;
    }
  }

  async acquireLock(lockName: string, options: LockOptions = {}): Promise<boolean> {
    const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    const renewIntervalMs = options.renewIntervalMs || DEFAULT_RENEW_INTERVAL_MS;

    try {
      const collection = await this.getLockCollection();
      if (!collection) {
        console.log(`[DISTRIBUTED LOCK] Cannot acquire lock '${lockName}': MongoDB not ready`);
        return false;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);

      const existingLock = await collection.findOne({ _id: lockName as any });

      if (existingLock) {
        if (existingLock.instanceId === this.instanceId) {
          console.log(`[DISTRIBUTED LOCK] ✅ Lock '${lockName}' already owned by this instance`);
          return true;
        }

        if (existingLock.expiresAt > now) {
          console.log(`[DISTRIBUTED LOCK] ❌ Lock '${lockName}' held by another instance: ${existingLock.instanceId}`);
          return false;
        }

        console.log(`[DISTRIBUTED LOCK] 🔓 Lock '${lockName}' expired, attempting to acquire...`);
      }

      const result = await collection.updateOne(
        { 
          _id: lockName as any,
          $or: [
            { expiresAt: { $lt: now } },
            { instanceId: { $exists: false } }
          ]
        },
        { 
          $set: { 
            instanceId: this.instanceId, 
            acquiredAt: now,
            expiresAt: expiresAt,
            renewedAt: now
          }
        },
        { upsert: true }
      );

      if (result.modifiedCount > 0 || result.upsertedCount > 0) {
        console.log(`[DISTRIBUTED LOCK] ✅ Successfully acquired lock '${lockName}'`);
        this.acquiredLocks.add(lockName);
        this.startRenewal(lockName, ttlMs, renewIntervalMs);
        return true;
      }

      const verifyLock = await collection.findOne({ _id: lockName as any });
      if (verifyLock?.instanceId === this.instanceId) {
        console.log(`[DISTRIBUTED LOCK] ✅ Lock '${lockName}' acquired by this instance`);
        this.acquiredLocks.add(lockName);
        this.startRenewal(lockName, ttlMs, renewIntervalMs);
        return true;
      }

      console.log(`[DISTRIBUTED LOCK] ❌ Failed to acquire lock '${lockName}'`);
      return false;

    } catch (error) {
      console.error(`[DISTRIBUTED LOCK] Error acquiring lock '${lockName}':`, error);
      return false;
    }
  }

  private startRenewal(lockName: string, ttlMs: number, renewIntervalMs: number): void {
    if (this.renewalIntervals.has(lockName)) {
      clearInterval(this.renewalIntervals.get(lockName)!);
    }

    const renewalInterval = setInterval(async () => {
      try {
        await this.renewLock(lockName, ttlMs);
      } catch (error) {
        console.error(`[DISTRIBUTED LOCK] Failed to renew lock '${lockName}':`, error);
      }
    }, renewIntervalMs);

    this.renewalIntervals.set(lockName, renewalInterval);
    console.log(`[DISTRIBUTED LOCK] Started renewal timer for '${lockName}' (every ${renewIntervalMs / 1000}s)`);
  }

  async renewLock(lockName: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    try {
      const collection = await this.getLockCollection();
      if (!collection) return false;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);

      const result = await collection.updateOne(
        { _id: lockName as any, instanceId: this.instanceId },
        { $set: { expiresAt, renewedAt: now } }
      );

      if (result.modifiedCount > 0) {
        console.log(`[DISTRIBUTED LOCK] 🔄 Renewed lock '${lockName}'`);
        return true;
      }

      console.log(`[DISTRIBUTED LOCK] ⚠️ Failed to renew lock '${lockName}' - may have been lost`);
      this.acquiredLocks.delete(lockName);
      return false;

    } catch (error) {
      console.error(`[DISTRIBUTED LOCK] Error renewing lock '${lockName}':`, error);
      return false;
    }
  }

  async releaseLock(lockName: string): Promise<void> {
    try {
      if (this.renewalIntervals.has(lockName)) {
        clearInterval(this.renewalIntervals.get(lockName)!);
        this.renewalIntervals.delete(lockName);
      }

      const collection = await this.getLockCollection();
      if (!collection) return;

      await collection.deleteOne({ _id: lockName as any, instanceId: this.instanceId });
      this.acquiredLocks.delete(lockName);
      console.log(`[DISTRIBUTED LOCK] 🔓 Released lock '${lockName}'`);

    } catch (error) {
      console.error(`[DISTRIBUTED LOCK] Error releasing lock '${lockName}':`, error);
    }
  }

  async releaseAllLocks(): Promise<void> {
    console.log(`[DISTRIBUTED LOCK] Releasing all locks for instance ${this.instanceId}...`);
    
    for (const lockName of this.acquiredLocks) {
      await this.releaseLock(lockName);
    }
  }

  isLockOwner(lockName: string): boolean {
    return this.acquiredLocks.has(lockName);
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  async cleanupExpiredLocks(): Promise<number> {
    try {
      const collection = await this.getLockCollection();
      if (!collection) return 0;

      const result = await collection.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      if (result.deletedCount > 0) {
        console.log(`[DISTRIBUTED LOCK] 🧹 Cleaned up ${result.deletedCount} expired locks`);
      }

      return result.deletedCount;
    } catch (error) {
      console.error('[DISTRIBUTED LOCK] Error cleaning up expired locks:', error);
      return 0;
    }
  }
}

export const distributedLock = new DistributedLockService();

export const LOCK_NAMES = {
  INSTAGRAM_POLLING: 'instagram_polling',
  INSTAGRAM_ACCOUNT_MONITOR: 'instagram_account_monitor',
  SCHEDULER_SERVICE: 'scheduler_service'
};

export async function acquireInstagramPollingLock(): Promise<boolean> {
  return distributedLock.acquireLock(LOCK_NAMES.INSTAGRAM_POLLING, {
    ttlMs: 5 * 60 * 1000,
    renewIntervalMs: 2 * 60 * 1000
  });
}

export async function acquireAccountMonitorLock(): Promise<boolean> {
  return distributedLock.acquireLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR, {
    ttlMs: 5 * 60 * 1000,
    renewIntervalMs: 2 * 60 * 1000
  });
}

export async function releaseInstagramPollingLocks(): Promise<void> {
  await distributedLock.releaseLock(LOCK_NAMES.INSTAGRAM_POLLING);
  await distributedLock.releaseLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);
}

export async function waitForMongoDBAndAcquireLock(
  lockName: string, 
  maxRetries: number = 30,
  retryInterval: number = 2000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (mongoose.connection.readyState !== 1) {
      console.log(`[DISTRIBUTED LOCK] Waiting for MongoDB connection... (attempt ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      continue;
    }
    
    const acquired = await distributedLock.acquireLock(lockName, {
      ttlMs: 5 * 60 * 1000,
      renewIntervalMs: 2 * 60 * 1000
    });
    
    if (acquired) {
      console.log(`[DISTRIBUTED LOCK] ✅ This instance is the LEADER for '${lockName}'`);
      return true;
    }
    
    console.log(`[DISTRIBUTED LOCK] Lock '${lockName}' held by another instance - this instance is a FOLLOWER`);
    return false;
  }
  
  console.warn('[DISTRIBUTED LOCK] MongoDB connection timeout - this instance will be a FOLLOWER (no polling)');
  return false;
}
