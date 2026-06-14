/**
 * UserProfile component
 *
 * Displays and manages core user information including:
 * - Key metrics (credits, login streak, social connections, lifetime value)
 * - Account information (email verification, onboarding status, referrals)
 * - Activity status timeline
 * - App usage insights
 * - Referral information
 * - Complete onboarding journey (delegated to UserOnboardingJourney)
 * - Recent activity summary
 * - Quick admin actions (suspend/activate, credit management, notes)
 * - Admin notes log
 *
 * Requirements: 10.1, 10.4
 */

import React from 'react';
import {
  Users,
  Activity,
  TrendingUp,
  DollarSign,
  Brain,
  FileText,
  Globe,
  CreditCard,
  Target,
  Clock,
} from 'lucide-react';
import UserOnboardingJourney from './UserOnboardingJourney';

/** Props accepted by the UserProfile component */
export interface UserProfileProps {
  /** Full user detail object returned by the /user-detail API */
  user: any;
  /** Callback to update the user's account status */
  onStatusUpdate: (status: string, reason?: string) => void;
  /** Callback to add or subtract credits from the user's account */
  onCreditsUpdate: (credits: number, action: string, reason?: string) => void;
  /** Callback to append an admin note to the user's record */
  onAddNote: (note: string) => void;
}

/**
 * UserProfile renders the Overview tab for the admin user detail page.
 * It provides a comprehensive view of user account info, onboarding journey,
 * recent activity, and admin quick-action buttons.
 */
const UserProfile: React.FC<UserProfileProps> = ({
  user,
  onStatusUpdate,
  onCreditsUpdate,
  onAddNote,
}) => {
  // Safely access analytics data with fallbacks
  const analytics = user.analytics || {};
  const aiAnalytics = analytics.aiAnalytics || {};
  const contentAnalytics = analytics.contentAnalytics || {};
  const growthAnalytics = analytics.growthAnalytics || {};
  const revenueAnalytics = analytics.revenueAnalytics || {};

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CreditCard className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Credits</p>
              <p className="text-2xl font-bold text-gray-900">{user.credits.remaining}</p>
              <p className="text-sm text-gray-500">of {user.credits.total} total</p>
              <p className="text-xs text-red-500">Used: {user.credits.used}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Login Streak</p>
              <p className="text-2xl font-bold text-gray-900">{user.dailyLoginStreak}</p>
              <p className="text-sm text-gray-500">days</p>
              <p className="text-xs text-blue-500">Total logins: {user.loginCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Globe className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Social Connections</p>
              <p className="text-2xl font-bold text-gray-900">
                {user.socialMedia?.totalConnections || 0}
              </p>
              <p className="text-sm text-gray-500">platforms</p>
              <p className="text-xs text-purple-500">
                {(() => {
                  const socialMedia = user.socialMedia || {};
                  const accounts = [
                    ...(socialMedia.instagramAccounts || []),
                    ...(socialMedia.twitterAccounts || []),
                    ...(socialMedia.linkedinAccounts || []),
                    ...(socialMedia.tiktokAccounts || []),
                    ...(socialMedia.youtubeAccounts || []),
                  ];
                  const totalFollowers = accounts.reduce(
                    (sum, a) => sum + (a.followers || 0),
                    0
                  );
                  return `${totalFollowers} followers`;
                })()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Lifetime Value</p>
              <p className="text-2xl font-bold text-gray-900">
                ${revenueAnalytics.lifetimeValue || 0}
              </p>
              <p className="text-sm text-gray-500">revenue</p>
              <p className="text-xs text-green-500">
                Spent: ${revenueAnalytics.totalSpent || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Information Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {/* Account Information */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Email Verified:</span>
              <span
                className={`text-sm font-medium ${
                  user.isEmailVerified ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {user.isEmailVerified ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Onboarded:</span>
              <span
                className={`text-sm font-medium ${
                  user.isOnboarded ? 'text-green-600' : 'text-yellow-600'
                }`}
              >
                {user.isOnboarded ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Member Since:</span>
              <span className="text-sm font-medium">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Last Login:</span>
              <span className="text-sm font-medium">
                {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Status Reason:</span>
              <span className="text-sm font-medium text-gray-900">
                {user.statusReason || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Referral Code:</span>
              <span className="text-sm font-medium font-mono">
                {user.referralCode || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Referrals:</span>
              <span className="text-sm font-medium">{user.totalReferrals || 0}</span>
            </div>
          </div>
        </div>

        {/* Activity Status */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Status</h3>
          <div className="space-y-4">
            {/* Last Activity Time */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Last Activity</p>
                  <p className="text-xs text-gray-500">
                    {user.lastActivityAt
                      ? new Date(user.lastActivityAt).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900">
                  {user.daysSinceLastActivity !== undefined
                    ? user.daysSinceLastActivity
                    : 'N/A'}
                </p>
                <p className="text-xs text-gray-500">days ago</p>
              </div>
            </div>

            {/* Activity Status Badge */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Activity className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Activity Status</p>
                  <p className="text-xs text-gray-500">Based on last interaction</p>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    user.daysSinceLastActivity <= 7
                      ? 'bg-green-100 text-green-800'
                      : user.daysSinceLastActivity <= 30
                      ? 'bg-yellow-100 text-yellow-800'
                      : user.daysSinceLastActivity <= 60
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {user.daysSinceLastActivity <= 7
                    ? 'Very Active'
                    : user.daysSinceLastActivity <= 30
                    ? 'Active'
                    : user.daysSinceLastActivity <= 60
                    ? 'Inactive'
                    : 'Very Inactive'}
                </span>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Activity Timeline</p>
              <div className="space-y-1">
                {[7, 30, 60, 90].map((days) => (
                  <div key={days} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Last {days} days</span>
                    <span
                      className={`px-2 py-1 rounded ${
                        user.daysSinceLastActivity <= days
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {user.daysSinceLastActivity <= days ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* App Usage Insights */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">App Usage Insights</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Daily Usage Time</p>
                  <p className="text-xs text-gray-500">Average time spent per day</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-blue-600">
                  {user.dailyUsageTime ? `${user.dailyUsageTime} min/day` : 'N/A'}
                </p>
                <p className="text-xs text-gray-500">
                  {user.dailyUsageTime
                    ? `${Math.round(user.dailyUsageTime / 60)} hours`
                    : 'No data'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Activity className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Avg Session Duration</p>
                  <p className="text-xs text-gray-500">Average time per session</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-green-600">
                  {user.avgSessionDuration ? `${user.avgSessionDuration} min` : 'N/A'}
                </p>
                <p className="text-xs text-gray-500">
                  {user.totalSessions ? `${user.totalSessions} sessions` : 'No data'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Usage Frequency</p>
                  <p className="text-xs text-gray-500">How often they use the app</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-purple-600">
                  {user.usageFrequency || 'N/A'}
                </p>
                <p className="text-xs text-gray-500">
                  {user.daysSinceLastActivity
                    ? `${user.daysSinceLastActivity} days ago`
                    : 'No data'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Referral Information */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Referral Information</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Users className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Referred By</p>
                  <p className="text-xs text-gray-500">Who referred this user</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-yellow-600">
                  {user.referredBy ? user.referredBy : 'Direct Signup'}
                </p>
                <p className="text-xs text-gray-500">
                  {user.referredBy ? 'Via referral' : 'No referral'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Target className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Referral Performance</p>
                  <p className="text-xs text-gray-500">How many people they referred</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-indigo-600">
                  {user.totalReferrals || 0}
                </p>
                <p className="text-xs text-gray-500">
                  {user.totalEarned ? `$${user.totalEarned} earned` : 'No earnings'}
                </p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Referral Code</p>
                  <p className="text-xs text-gray-500">Their unique referral code</p>
                </div>
                <div className="text-right">
                  <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                    {user.referralCode || 'N/A'}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Onboarding Journey – delegated to dedicated sub-component */}
        <UserOnboardingJourney user={user} />

        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Brain className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">AI Credits Used</p>
                <p className="text-xs text-gray-500">
                  {aiAnalytics.totalCreditsUsed || 0} credits
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileText className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Content Created</p>
                <p className="text-xs text-gray-500">
                  {contentAnalytics.totalCreated || 0} items
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Globe className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Social Growth</p>
                <p className="text-xs text-gray-500">
                  +{growthAnalytics.followerGrowth?.monthly || 0} followers this month
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Revenue Generated</p>
                <p className="text-xs text-gray-500">
                  ${revenueAnalytics.totalSpent || 0} total spent
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              onStatusUpdate(user.status === 'active' ? 'suspended' : 'active')
            }
            className={`px-4 py-2 rounded-lg font-medium ${
              user.status === 'active'
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {user.status === 'active' ? 'Suspend User' : 'Activate User'}
          </button>
          <button
            onClick={() => onCreditsUpdate(100, 'add', 'Admin credit addition')}
            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg font-medium hover:bg-blue-200"
          >
            Add 100 Credits
          </button>
          <button
            onClick={() => onCreditsUpdate(50, 'subtract', 'Admin credit deduction')}
            className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg font-medium hover:bg-yellow-200"
          >
            Remove 50 Credits
          </button>
          <button
            onClick={() => onAddNote('')}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
          >
            Add Note
          </button>
        </div>
      </div>

      {/* Admin Notes */}
      {user.notes && user.notes.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Notes</h3>
          <div className="space-y-3">
            {user.notes.map((note: any, index: number) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                <p className="text-sm text-gray-700">{note.text}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Added by {note.addedBy} on {new Date(note.addedAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
