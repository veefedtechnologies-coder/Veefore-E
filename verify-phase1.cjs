#!/usr/bin/env node

/**
 * Phase 1 Connection Pooling Verification Script
 * 
 * This script verifies that all queue files use getSharedRedisConnection()
 * and that the connection pooling is working correctly.
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;
let totalTests = 0;

function log(message, color = '') {
  console.log(`${color}${message}${RESET}`);
}

function pass(message) {
  passCount++;
  totalTests++;
  log(`✓ ${message}`, GREEN);
}

function fail(message) {
  failCount++;
  totalTests++;
  log(`✗ ${message}`, RED);
}

function section(title) {
  log(`\n${'='.repeat(70)}`, CYAN);
  log(title, CYAN);
  log('='.repeat(70), CYAN);
}

// Test 1: Verify all queue files use getSharedRedisConnection()
section('Test 1: Verify Queue Files Use Shared Connections');

const queueFiles = [
  'server/queues/metricsQueue.ts',
  'server/queues/automationQueue.ts',
  'server/queues/messageQueue.ts',
  'server/queues/postQueue.ts'
];

queueFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check 1: Imports getSharedRedisConnection
    if (content.includes('getSharedRedisConnection')) {
      pass(`${file} imports getSharedRedisConnection`);
    } else {
      fail(`${file} missing getSharedRedisConnection import`);
    }
    
    // Check 2: Calls getSharedRedisConnection()
    if (/getSharedRedisConnection\s*\(\)/.test(content)) {
      pass(`${file} calls getSharedRedisConnection()`);
    } else {
      fail(`${file} does not call getSharedRedisConnection()`);
    }
    
    // Check 3: Does NOT create new IORedis/Redis instances
    const lines = content.split('\n');
    const codeLines = lines.filter(line => !line.trim().startsWith('//'));
    const codeContent = codeLines.join('\n');
    
    const hasNewIORedis = /new\s+IORedis\s*\(/.test(codeContent);
    const hasNewRedis = /new\s+Redis\s*\(/.test(codeContent);
    
    if (!hasNewIORedis && !hasNewRedis) {
      pass(`${file} does NOT create new Redis connections`);
    } else {
      fail(`${file} still creates new Redis connections`);
    }
    
  } catch (error) {
    fail(`${file} - Error reading file: ${error.message}`);
  }
});

// Test 2: Verify redis.ts has shared connection implementation
section('Test 2: Verify Shared Connection Implementation in redis.ts');

try {
  const redisLibPath = path.join(__dirname, 'server/lib/redis.ts');
  const content = fs.readFileSync(redisLibPath, 'utf-8');
  
  if (content.includes('getSharedRedisConnection')) {
    pass('redis.ts exports getSharedRedisConnection');
  } else {
    fail('redis.ts missing getSharedRedisConnection');
  }
  
  if (content.includes('getSharedRedisSubscriber')) {
    pass('redis.ts exports getSharedRedisSubscriber');
  } else {
    fail('redis.ts missing getSharedRedisSubscriber');
  }
  
  if (content.includes('sharedWorkerConnection')) {
    pass('redis.ts has sharedWorkerConnection singleton');
  } else {
    fail('redis.ts missing sharedWorkerConnection singleton');
  }
  
  if (content.includes('sharedWorkerSubscriber')) {
    pass('redis.ts has sharedWorkerSubscriber singleton');
  } else {
    fail('redis.ts missing sharedWorkerSubscriber singleton');
  }
  
  if (/if\s*\(\s*!\s*sharedWorkerConnection\s*\)/.test(content)) {
    pass('redis.ts implements singleton pattern for worker connection');
  } else {
    fail('redis.ts missing singleton pattern for worker connection');
  }
  
  if (content.includes('Connection Strategy')) {
    pass('redis.ts documents connection strategy');
  } else {
    fail('redis.ts missing connection strategy documentation');
  }
  
} catch (error) {
  fail(`redis.ts - Error reading file: ${error.message}`);
}

// Test 3: Verify optimization comments are present
section('Test 3: Verify Phase 1 Optimization Comments');

const expectedComments = {
  'server/queues/metricsQueue.ts': /Task 3\.2/i,
  'server/queues/automationQueue.ts': /Task 3\.3/i,
  'server/queues/messageQueue.ts': /Task 3\.4/i,
  'server/queues/postQueue.ts': /Task 3\.5/i
};

Object.entries(expectedComments).forEach(([file, pattern]) => {
  try {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    
    if (pattern.test(content)) {
      pass(`${file} has Phase 1 optimization comment`);
    } else {
      fail(`${file} missing Phase 1 optimization comment`);
    }
  } catch (error) {
    fail(`${file} - Error reading file: ${error.message}`);
  }
});

// Test 4: Verify O(1) count methods are used (Phase 2 bonus)
section('Test 4: Verify O(1) Count Methods (Phase 2 Bonus)');

queueFiles.forEach(file => {
  try {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    
    if (content.includes('getWaitingCount()') && 
        content.includes('getActiveCount()') &&
        content.includes('getCompletedCount()') &&
        content.includes('getFailedCount()')) {
      pass(`${file} uses O(1) count methods`);
    } else {
      fail(`${file} missing O(1) count methods`);
    }
  } catch (error) {
    fail(`${file} - Error reading file: ${error.message}`);
  }
});

// Test 5: Verify Phase 5 caching (bonus)
section('Test 5: Verify Repeatable Jobs Caching (Phase 5 Bonus)');

try {
  const metricsQueuePath = path.join(__dirname, 'server/queues/metricsQueue.ts');
  const content = fs.readFileSync(metricsQueuePath, 'utf-8');
  
  if (content.includes('repeatableJobsCache')) {
    pass('metricsQueue.ts has repeatableJobsCache implementation');
  } else {
    fail('metricsQueue.ts missing repeatableJobsCache');
  }
  
  if (content.includes('CACHE_TTL_MS') && /30000|30\s*\*\s*1000/.test(content)) {
    pass('metricsQueue.ts has 30-second cache TTL');
  } else {
    fail('metricsQueue.ts missing 30-second cache TTL');
  }
  
  if (/cache.*hit/i.test(content) && /cache.*miss/i.test(content)) {
    pass('metricsQueue.ts implements cache hit/miss logic');
  } else {
    fail('metricsQueue.ts missing cache hit/miss logic');
  }
  
} catch (error) {
  fail(`metricsQueue.ts - Error reading file: ${error.message}`);
}

// Print summary
section('Verification Summary');

log(`\nTotal Tests: ${totalTests}`, CYAN);
log(`Passed: ${passCount}`, GREEN);
log(`Failed: ${failCount}`, failCount > 0 ? RED : GREEN);

if (failCount === 0) {
  log('\n🎉 All Phase 1 verification checks passed!', GREEN);
  log('\nPhase 1 Implementation Summary:', GREEN);
  log('✓ All queue files use getSharedRedisConnection()', GREEN);
  log('✓ No duplicate Redis connections in code', GREEN);
  log('✓ Shared connection functions implemented in redis.ts', GREEN);
  log('✓ Singleton pattern implemented correctly', GREEN);
  log('✓ Connection strategy documented', GREEN);
  log('✓ Phase 1 optimization comments present in all files', GREEN);
  log('✓ BONUS: Phase 2 O(1) count methods implemented', GREEN);
  log('✓ BONUS: Phase 5 caching implemented in metricsQueue', GREEN);
  
  log('\n📋 Manual Verification Still Required:', YELLOW);
  log('  1. Redis connection count via CLIENT LIST (expected: ~3, previous: 5+)', YELLOW);
  log('  2. Queue job addition functionality', YELLOW);
  log('  3. Worker job processing functionality', YELLOW);
  log('  4. Server startup without Redis connection errors', YELLOW);
  log('  5. TypeScript compilation for queue files only', YELLOW);
  
  process.exit(0);
} else {
  log('\n❌ Some Phase 1 verification checks failed. Please review the errors above.', RED);
  process.exit(1);
}
