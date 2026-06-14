/**
 * UserSubscription component
 *
 * Displays subscription and revenue details for a user, including:
 * - Revenue overview (lifetime value, total spent, subscription revenue, credit purchases)
 * - Payment history with last payment date
 *
 * Maps to the RevenueTab section from the original UserDetailPage.tsx.
 */

import React from 'react';
import { DollarSign, CreditCard, Target, Plus } from 'lucide-react';

/** Props accepted by the UserSubscription component */
export interface UserSubscriptionProps {
  /** Full user detail object returned by the /user-detail API */
  user: any;
}

/**
 * UserSubscription renders the Revenue / Subscription tab for the admin
 * user detail page.  It surfaces lifetime value, spend totals and the last
 * recorded payment date.
 */
const UserSubscription: React.FC<UserSubscriptionProps> = ({ user }) => {
  const analytics = user.analytics || {};
  const revenueAnalytics = analytics.revenueAnalytics || {};

  return (
    <div className="space-y-6">
      {/* Revenue Overview */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Lifetime Value */}
          <div className="text-center p-4 border rounded-lg">
            <DollarSign className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">
              ${revenueAnalytics.lifetimeValue || 0}
            </div>
            <div className="text-sm text-gray-600">Lifetime Value</div>
          </div>

          {/* Total Spent */}
          <div className="text-center p-4 border rounded-lg">
            <CreditCard className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-600">
              ${revenueAnalytics.totalSpent || 0}
            </div>
            <div className="text-sm text-gray-600">Total Spent</div>
          </div>

          {/* Subscription Revenue */}
          <div className="text-center p-4 border rounded-lg">
            <Target className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-purple-600">
              ${revenueAnalytics.subscriptionRevenue || 0}
            </div>
            <div className="text-sm text-gray-600">Subscription Revenue</div>
          </div>

          {/* Credit Purchases */}
          <div className="text-center p-4 border rounded-lg">
            <Plus className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-600">
              ${revenueAnalytics.creditPurchases || 0}
            </div>
            <div className="text-sm text-gray-600">Credit Purchases</div>
          </div>
        </div>
      </div>

      {/* Subscription Details */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-sm text-gray-600">Current Plan</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  user.plan === 'Free'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {user.plan || 'Free'} Plan
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-sm text-gray-600">Account Status</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  user.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : user.status === 'trial'
                    ? 'bg-blue-100 text-blue-800'
                    : user.status === 'suspended'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {user.status
                  ? user.status.charAt(0).toUpperCase() + user.status.slice(1)
                  : 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-sm text-gray-600">Credits Remaining</span>
              <span className="text-sm font-semibold text-gray-900">
                {user.credits?.remaining || 0}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-sm text-gray-600">Credits Used</span>
              <span className="text-sm font-semibold text-gray-900">
                {user.credits?.used || 0}
              </span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-sm text-gray-600">Total Credits Allocated</span>
              <span className="text-sm font-semibold text-gray-900">
                {user.credits?.total || 0}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b">
              <span className="text-sm text-gray-600">Member Since</span>
              <span className="text-sm font-medium">
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
            {revenueAnalytics.subscriptionStartDate && (
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-sm text-gray-600">Subscription Started</span>
                <span className="text-sm font-medium">
                  {new Date(revenueAnalytics.subscriptionStartDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {revenueAnalytics.subscriptionEndDate && (
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-sm text-gray-600">Subscription Ends</span>
                <span className="text-sm font-medium">
                  {new Date(revenueAnalytics.subscriptionEndDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {revenueAnalytics.nextBillingDate && (
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-sm text-gray-600">Next Billing Date</span>
                <span className="text-sm font-medium">
                  {new Date(revenueAnalytics.nextBillingDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
        <div className="text-center py-8">
          <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            Last Payment:{' '}
            {revenueAnalytics.lastPayment
              ? new Date(revenueAnalytics.lastPayment).toLocaleString()
              : 'No payments recorded'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserSubscription;
