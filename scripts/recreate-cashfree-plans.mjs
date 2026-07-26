/**
 * Deactivates old Cashfree plans and creates new ones with plan_max_cycles set.
 * Run: node scripts/recreate-cashfree-plans.mjs
 */

const BASE_URL = process.env.CASHFREE_BASE_URL || 'https://sandbox.cashfree.com/pg';
const CLIENT_ID = process.env.CASHFREE_CLIENT_ID;
const CLIENT_SECRET = process.env.CASHFREE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET environment variables are required.');
  process.exit(1);
}

const headers = {
  'x-client-id': CLIENT_ID,
  'x-client-secret': CLIENT_SECRET,
  'x-api-version': '2023-08-01',
  'Content-Type': 'application/json',
};

const OLD_PLAN_IDS = [
  'CREATOR_MONTHLY', 'CREATOR_YEARLY',
  'PRO_MONTHLY', 'PRO_YEARLY',
  'BUSINESS_MONTHLY', 'BUSINESS_YEARLY',
];

// New plan IDs — suffixed with _V2 so they don't conflict with old ones
// Update plan-config.ts to use these after running this script
const NEW_PLANS = [
  {
    plan_id: 'CREATOR_MONTHLY_V2',
    plan_name: 'Creator Monthly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 799,
    plan_max_amount: 799,
    plan_max_cycles: 120,
    plan_intervals: 1,
    plan_interval_type: 'MONTH',
    plan_currency: 'INR',
    plan_note: 'Veefore Creator Plan - Monthly',
  },
  {
    plan_id: 'CREATOR_YEARLY_V2',
    plan_name: 'Creator Yearly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 7999,
    plan_max_amount: 7999,
    plan_max_cycles: 10,
    plan_intervals: 1,
    plan_interval_type: 'YEAR',
    plan_currency: 'INR',
    plan_note: 'Veefore Creator Plan - Yearly',
  },
  {
    plan_id: 'PRO_MONTHLY_V2',
    plan_name: 'Pro Monthly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 1999,
    plan_max_amount: 1999,
    plan_max_cycles: 120,
    plan_intervals: 1,
    plan_interval_type: 'MONTH',
    plan_currency: 'INR',
    plan_note: 'Veefore Pro Plan - Monthly',
  },
  {
    plan_id: 'PRO_YEARLY_V2',
    plan_name: 'Pro Yearly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 19999,
    plan_max_amount: 19999,
    plan_max_cycles: 10,
    plan_intervals: 1,
    plan_interval_type: 'YEAR',
    plan_currency: 'INR',
    plan_note: 'Veefore Pro Plan - Yearly',
  },
  {
    plan_id: 'BUSINESS_MONTHLY_V2',
    plan_name: 'Business Monthly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 4999,
    plan_max_amount: 4999,
    plan_max_cycles: 120,
    plan_intervals: 1,
    plan_interval_type: 'MONTH',
    plan_currency: 'INR',
    plan_note: 'Veefore Business Plan - Monthly',
  },
  {
    plan_id: 'BUSINESS_YEARLY_V2',
    plan_name: 'Business Yearly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 49999,
    plan_max_amount: 49999,
    plan_max_cycles: 10,
    plan_intervals: 1,
    plan_interval_type: 'YEAR',
    plan_currency: 'INR',
    plan_note: 'Veefore Business Plan - Yearly',
  },
];

async function deactivatePlan(planId) {
  const res = await fetch(`${BASE_URL}/plans/${planId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ plan_status: 'INACTIVE' }),
  });
  const body = await res.json();
  if (res.ok) {
    console.log(`⏸  Deactivated: ${planId}`);
  } else {
    console.warn(`⚠️  Could not deactivate ${planId}: ${body.message || JSON.stringify(body)}`);
  }
}

async function createPlan(plan) {
  const res = await fetch(`${BASE_URL}/plans`, {
    method: 'POST',
    headers,
    body: JSON.stringify(plan),
  });
  const body = await res.json();
  if (res.ok) {
    console.log(`✅ Created: ${plan.plan_id} (${plan.plan_recurring_amount} INR, max_cycles: ${plan.plan_max_cycles})`);
  } else {
    console.error(`❌ Failed: ${plan.plan_id} → ${body.message || JSON.stringify(body)}`);
  }
}

console.log('=== Step 1: Deactivating old plans ===\n');
for (const id of OLD_PLAN_IDS) {
  await deactivatePlan(id);
}

console.log('\n=== Step 2: Creating new plans with max_cycles ===\n');
for (const plan of NEW_PLANS) {
  await createPlan(plan);
}

console.log('\n✅ Done!');
console.log('\nIMPORTANT: Update toCashfreePlanId() in CashfreeService.ts to append _V2 to plan IDs.');
console.log('Or update plan-config.ts to use the new plan IDs.');
