/**
 * Creates Veefore subscription plans in Cashfree sandbox.
 * Run: node scripts/create-cashfree-plans.mjs
 *
 * Plans must have plan_max_cycles set so Cashfree generates an authorization_link.
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

const PLANS = [
  {
    plan_id: 'CREATOR_MONTHLY',
    plan_name: 'Creator Monthly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 799,
    plan_max_amount: 799,
    plan_max_cycles: 120,       // 10 years of monthly billing
    plan_intervals: 1,
    plan_interval_type: 'MONTH',
    plan_currency: 'INR',
    plan_note: 'Veefore Creator Plan - Monthly',
  },
  {
    plan_id: 'CREATOR_YEARLY',
    plan_name: 'Creator Yearly',
    plan_type: 'PERIODIC',
    plan_recurring_amount: 7999,
    plan_max_amount: 7999,
    plan_max_cycles: 10,        // 10 years of yearly billing
    plan_intervals: 1,
    plan_interval_type: 'YEAR',
    plan_currency: 'INR',
    plan_note: 'Veefore Creator Plan - Yearly',
  },
  {
    plan_id: 'PRO_MONTHLY',
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
    plan_id: 'PRO_YEARLY',
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
    plan_id: 'BUSINESS_MONTHLY',
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
    plan_id: 'BUSINESS_YEARLY',
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

async function createPlan(plan) {
  const res = await fetch(`${BASE_URL}/plans`, {
    method: 'POST',
    headers,
    body: JSON.stringify(plan),
  });
  const body = await res.json();
  if (res.ok) {
    console.log(`✅ Created: ${plan.plan_id} → status: ${body.plan_status}`);
  } else {
    console.error(`❌ Failed: ${plan.plan_id} → ${body.message || JSON.stringify(body)}`);
  }
  return body;
}

console.log('Creating Cashfree plans in sandbox...\n');
for (const plan of PLANS) {
  await createPlan(plan);
}
console.log('\nDone. Check the Cashfree dashboard to verify all plans are ACTIVE.');
