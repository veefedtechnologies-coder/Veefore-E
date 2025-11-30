#!/usr/bin/env node

console.log('🔍 DEBUGGING POLLING STATUS ISSUE');
console.log('==================================\n');

// Test the countdown logic with different nextPollIn values
function testCountdownScenarios() {
  console.log('📊 TESTING COUNTDOWN SCENARIOS:');
  console.log('===============================\n');
  
  const now = Date.now();
  
  // Scenario 1: nextPollIn is 0 (should show "Polling now...")
  console.log('1. nextPollIn = 0:');
  const timeRemaining1 = Math.max(0, 0 - now);
  console.log(`   timeRemaining: ${timeRemaining1}ms`);
  console.log(`   Should show: "Polling now..." (${timeRemaining1 <= 1000 ? 'YES' : 'NO'})`);
  console.log();
  
  // Scenario 2: nextPollIn is very small (should show "Polling now...")
  console.log('2. nextPollIn = 500ms from now:');
  const nextPollIn2 = now + 500;
  const timeRemaining2 = Math.max(0, nextPollIn2 - now);
  console.log(`   timeRemaining: ${timeRemaining2}ms`);
  console.log(`   Should show: "Polling now..." (${timeRemaining2 <= 1000 ? 'YES' : 'NO'})`);
  console.log();
  
  // Scenario 3: nextPollIn is normal (should show countdown)
  console.log('3. nextPollIn = 5 minutes from now:');
  const nextPollIn3 = now + (5 * 60 * 1000);
  const timeRemaining3 = Math.max(0, nextPollIn3 - now);
  console.log(`   timeRemaining: ${timeRemaining3}ms (${Math.round(timeRemaining3 / 1000 / 60)} minutes)`);
  console.log(`   Should show: "Polling now..." (${timeRemaining3 <= 1000 ? 'YES' : 'NO'})`);
  console.log();
  
  // Scenario 4: nextPollIn is in the past (should show "Polling now...")
  console.log('4. nextPollIn = 1 second ago:');
  const nextPollIn4 = now - 1000;
  const timeRemaining4 = Math.max(0, nextPollIn4 - now);
  console.log(`   timeRemaining: ${timeRemaining4}ms`);
  console.log(`   Should show: "Polling now..." (${timeRemaining4 <= 1000 ? 'YES' : 'NO'})`);
  console.log();
  
  console.log('🎯 CONCLUSION:');
  console.log('If nextPollIn is always 0 or very small, the issue is in the backend calculation.');
  console.log('If nextPollIn is normal but still shows "Polling now...", the issue is in the frontend logic.');
}

testCountdownScenarios();

console.log('\n🔍 LIKELY ISSUES:');
console.log('1. Smart polling system not running (no accounts found)');
console.log('2. nextPollIn always calculated as 0 or very small');
console.log('3. calculatePollingInterval returning wrong values');
console.log('4. No Instagram accounts in database for polling');
console.log('5. Smart polling initialization failing silently');

console.log('\n✅ DEBUG TEST COMPLETED');




