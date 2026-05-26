/**
 * P9-3: DATABASE BACKUP & RECOVERY SERVICE
 * Enterprise-grade backup and disaster recovery
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';

const execAsync = promisify(exec);

interface BackupConfig {
  backupPath: string;
  retentionDays: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  maxBackupSize: number; // in MB
  schedule: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly';
    time?: string; // HH:MM format for daily/weekly
  };
}

interface BackupMetadata {
  id: string;
  timestamp: string;
  size: number;
  collections: string[];
  documentCount: number;
  status: 'success' | 'failed' | 'in_progress';
  duration: number; // in milliseconds
  error?: string;
}

// Enterprise backup configuration
const BACKUP_CONFIG: BackupConfig = {
  backupPath: process.env.BACKUP_PATH || '/home/runner/workspace/backups',
  retentionDays: 30,
  compressionEnabled: true,
  encryptionEnabled: false, // Would need encryption keys in production
  maxBackupSize: 1024, // 1GB
  schedule: {
    enabled: process.env.NODE_ENV === 'production',
    frequency: 'daily',
    time: '02:00' // 2 AM
  }
};

export class BackupRecoveryService {
  private static instance: BackupRecoveryService;
  private backupHistory: BackupMetadata[] = [];
  private isBackupInProgress = false;

  private constructor() {
    this.initializeBackupDirectory();
    if (BACKUP_CONFIG.schedule.enabled) {
      this.scheduleBackups();
    }
  }

  public static getInstance(): BackupRecoveryService {
    if (!BackupRecoveryService.instance) {
      BackupRecoveryService.instance = new BackupRecoveryService();
    }
    return BackupRecoveryService.instance;
  }

  /**
   * Initialize backup directory structure
   */
  private async initializeBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(BACKUP_CONFIG.backupPath, { recursive: true });
      await fs.mkdir(path.join(BACKUP_CONFIG.backupPath, 'daily'), { recursive: true });
      await fs.mkdir(path.join(BACKUP_CONFIG.backupPath, 'weekly'), { recursive: true });
      await fs.mkdir(path.join(BACKUP_CONFIG.backupPath, 'monthly'), { recursive: true });
      
      console.log('📁 P9: Backup directory structure initialized');
      await this.loadBackupHistory();
    } catch (error) {
      console.error('❌ P9: Error initializing backup directory:', error);
    }
  }

  /**
   * Create a database backup
   */
  public async createBackup(type: 'manual' | 'scheduled' = 'manual'): Promise<BackupMetadata> {
    if (this.isBackupInProgress) {
      throw new Error('Backup already in progress');
    }

    this.isBackupInProgress = true;
    const startTime = Date.now();
    const backupId = `backup_${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    console.log(`🔄 P9: Starting ${type} database backup: ${backupId}`);

    try {
      // Check database connection
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }

      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database instance not available');
      }

      // Get collections info
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      // Count total documents
      let totalDocuments = 0;
      for (const collectionName of collectionNames) {
        const count = await db.collection(collectionName).countDocuments();
        totalDocuments += count;
      }

      // Create backup using mongodump (if available) or custom export
      const backupPath = path.join(
        BACKUP_CONFIG.backupPath, 
        type === 'scheduled' ? 'daily' : 'manual',
        `${backupId}.json`
      );

      await this.exportDatabase(db, backupPath, collectionNames);

      // Get backup file size
      const stats = await fs.stat(backupPath);
      const backupSizeMB = stats.size / (1024 * 1024);

      // Check size limit
      if (backupSizeMB > BACKUP_CONFIG.maxBackupSize) {
        console.warn(`⚠️ P9: Backup size (${backupSizeMB.toFixed(2)}MB) exceeds limit (${BACKUP_CONFIG.maxBackupSize}MB)`);
      }

      // Compress if enabled
      if (BACKUP_CONFIG.compressionEnabled) {
        await this.compressBackup(backupPath);
      }

      const duration = Date.now() - startTime;
      const backup: BackupMetadata = {
        id: backupId,
        timestamp,
        size: stats.size,
        collections: collectionNames,
        documentCount: totalDocuments,
        status: 'success',
        duration
      };

      this.backupHistory.push(backup);
      await this.saveBackupHistory();
      
      console.log(`✅ P9: Backup completed successfully: ${backupId} (${backupSizeMB.toFixed(2)}MB, ${duration}ms)`);
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      return backup;

    } catch (error) {
      const duration = Date.now() - startTime;
      const failedBackup: BackupMetadata = {
        id: backupId,
        timestamp,
        size: 0,
        collections: [],
        documentCount: 0,
        status: 'failed',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.backupHistory.push(failedBackup);
      console.error(`❌ P9: Backup failed: ${backupId}`, error);
      throw error;

    } finally {
      this.isBackupInProgress = false;
    }
  }

  /**
   * Export database collections to JSON
   */
  private async exportDatabase(db: any, backupPath: string, collectionNames: string[]): Promise<void> {
    const backupData: any = {
      metadata: {
        created: new Date().toISOString(),
        database: db.databaseName,
        collections: collectionNames.length
      },
      collections: {}
    };

    for (const collectionName of collectionNames) {
      console.log(`📊 P9: Exporting collection: ${collectionName}`);
      
      try {
        const documents = await db.collection(collectionName).find({}).toArray();
        backupData.collections[collectionName] = documents;
        
        console.log(`✅ P9: Exported ${documents.length} documents from ${collectionName}`);
      } catch (error) {
        console.error(`❌ P9: Error exporting ${collectionName}:`, error);
        backupData.collections[collectionName] = { error: error.message };
      }
    }

    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  }

  /**
   * Compress backup file
   */
  private async compressBackup(backupPath: string): Promise<string> {
    const compressedPath = `${backupPath}.gz`;
    
    try {
      await execAsync(`gzip -c "${backupPath}" > "${compressedPath}"`);
      await fs.unlink(backupPath); // Remove uncompressed file
      
      console.log(`🗜️ P9: Backup compressed: ${path.basename(compressedPath)}`);
      return compressedPath;
    } catch (error) {
      console.error('❌ P9: Compression failed:', error);
      return backupPath; // Return original if compression fails
    }
  }

  /**
   * Restore database from backup
   */
  public async restoreFromBackup(backupId: string): Promise<void> {
    console.log(`🔄 P9: Starting database restoration from backup: ${backupId}`);
    
    try {
      const backup = this.backupHistory.find(b => b.id === backupId);
      if (!backup || backup.status !== 'success') {
        throw new Error(`Backup ${backupId} not found or failed`);
      }

      // Find backup file
      const possiblePaths = [
        path.join(BACKUP_CONFIG.backupPath, 'daily', `${backupId}.json`),
        path.join(BACKUP_CONFIG.backupPath, 'manual', `${backupId}.json`),
        path.join(BACKUP_CONFIG.backupPath, 'daily', `${backupId}.json.gz`),
        path.join(BACKUP_CONFIG.backupPath, 'manual', `${backupId}.json.gz`)
      ];

      let backupPath: string | null = null;
      for (const possiblePath of possiblePaths) {
        try {
          await fs.access(possiblePath);
          backupPath = possiblePath;
          break;
        } catch {
          // File doesn't exist, continue
        }
      }

      if (!backupPath) {
        throw new Error(`Backup file not found for ${backupId}`);
      }

      // Decompress if needed
      if (backupPath.endsWith('.gz')) {
        const decompressedPath = backupPath.replace('.gz', '');
        await execAsync(`gunzip -c "${backupPath}" > "${decompressedPath}"`);
        backupPath = decompressedPath;
      }

      // Load backup data
      const backupContent = await fs.readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);

      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database not connected');
      }

      // Restore collections
      for (const [collectionName, documents] of Object.entries(backupData.collections)) {
        if (Array.isArray(documents)) {
          console.log(`📊 P9: Restoring collection: ${collectionName} (${documents.length} documents)`);
          
          // Clear existing collection
          await db.collection(collectionName).deleteMany({});
          
          // Insert backed up documents
          if (documents.length > 0) {
            await db.collection(collectionName).insertMany(documents);
          }
          
          console.log(`✅ P9: Restored ${documents.length} documents to ${collectionName}`);
        }
      }

      console.log(`🎉 P9: Database restoration completed successfully from backup: ${backupId}`);

    } catch (error) {
      console.error(`❌ P9: Database restoration failed for backup: ${backupId}`, error);
      throw error;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  private async cleanupOldBackups(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - BACKUP_CONFIG.retentionDays);

    const oldBackups = this.backupHistory.filter(backup => 
      new Date(backup.timestamp) < cutoffDate
    );

    for (const backup of oldBackups) {
      try {
        const backupPaths = [
          path.join(BACKUP_CONFIG.backupPath, 'daily', `${backup.id}.json`),
          path.join(BACKUP_CONFIG.backupPath, 'manual', `${backup.id}.json`),
          path.join(BACKUP_CONFIG.backupPath, 'daily', `${backup.id}.json.gz`),
          path.join(BACKUP_CONFIG.backupPath, 'manual', `${backup.id}.json.gz`)
        ];

        for (const backupPath of backupPaths) {
          try {
            await fs.unlink(backupPath);
            console.log(`🗑️ P9: Deleted old backup: ${backup.id}`);
          } catch {
            // File doesn't exist, continue
          }
        }

        // Remove from history
        this.backupHistory = this.backupHistory.filter(b => b.id !== backup.id);
      } catch (error) {
        console.error(`❌ P9: Error cleaning up backup ${backup.id}:`, error);
      }
    }

    await this.saveBackupHistory();
  }

  /**
   * Schedule automatic backups
   */
  private scheduleBackups(): void {
    const { frequency, time } = BACKUP_CONFIG.schedule;
    
    console.log(`📅 P9: Scheduling ${frequency} backups at ${time || 'default time'}`);
    
    // Simplified scheduling - in production, use a proper job scheduler like node-cron
    const intervalMs = frequency === 'hourly' ? 60 * 60 * 1000 : 
                      frequency === 'daily' ? 24 * 60 * 60 * 1000 :
                      7 * 24 * 60 * 60 * 1000; // weekly

    setInterval(async () => {
      try {
        console.log('📅 P9: Starting scheduled backup...');
        await this.createBackup('scheduled');
      } catch (error) {
        console.error('❌ P9: Scheduled backup failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Load backup history from disk
   */
  private async loadBackupHistory(): Promise<void> {
    const historyPath = path.join(BACKUP_CONFIG.backupPath, 'backup_history.json');
    
    try {
      const historyData = await fs.readFile(historyPath, 'utf8');
      this.backupHistory = JSON.parse(historyData);
      console.log(`📚 P9: Loaded ${this.backupHistory.length} backup records`);
    } catch {
      console.log('📚 P9: No existing backup history found, starting fresh');
      this.backupHistory = [];
    }
  }

  /**
   * Save backup history to disk
   */
  private async saveBackupHistory(): Promise<void> {
    const historyPath = path.join(BACKUP_CONFIG.backupPath, 'backup_history.json');
    
    try {
      await fs.writeFile(historyPath, JSON.stringify(this.backupHistory, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ P9: Error saving backup history:', error);
    }
  }

  /**
   * Get backup statistics and health
   */
  public getBackupHealth(): {
    enabled: boolean;
    lastBackupTime?: string;
    totalBackups: number;
    failedBackups: number;
    totalStorageUsed: number;
    oldestBackup?: string;
    nextScheduledBackup?: string;
  } {
    const successfulBackups = this.backupHistory.filter(b => b.status === 'success');
    const failedBackups = this.backupHistory.filter(b => b.status === 'failed');
    const totalStorage = this.backupHistory.reduce((sum, backup) => sum + backup.size, 0);
    
    const lastBackup = successfulBackups.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
    
    const oldestBackup = successfulBackups.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )[0];

    return {
      enabled: BACKUP_CONFIG.schedule.enabled,
      lastBackupTime: lastBackup?.timestamp,
      totalBackups: this.backupHistory.length,
      failedBackups: failedBackups.length,
      totalStorageUsed: totalStorage,
      oldestBackup: oldestBackup?.timestamp,
      nextScheduledBackup: BACKUP_CONFIG.schedule.enabled ? 'Next scheduled backup time calculation needed' : undefined
    };
  }

  /**
   * Get backup history
   */
  public getBackupHistory(): BackupMetadata[] {
    return [...this.backupHistory].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}

// Singleton instance export
export const backupService = BackupRecoveryService.getInstance();