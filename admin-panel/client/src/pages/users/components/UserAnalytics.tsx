/**
 * UserAnalytics component
 *
 * Displays comprehensive analytics for a given user, including:
 * - Growth metrics (followers, engagement rate, impressions)
 * - Content performance breakdown (images, videos, captions, hashtags)
 * - AI usage analytics with per-feature credit consumption
 */

import React from 'react';
import {
  Image,
  Video,
  FileText,
  Hash,
  Brain,
  Settings,
  Clock,
} from 'lucide-react';

/** Props accepted by the UserAnalytics component */
export interface UserAnalyticsProps {
  /** Full user detail object returned by the /user-detail API */
  user: any;
}

/**
 * UserAnalytics renders the Analytics tab for the admin user detail page.
 * It surfaces growth KPIs, content creation stats and AI credit usage.
 */
const UserAnalytics: React.FC<UserAnalyticsProps> = ({ user }) => {
  // Safely access analytics data with fallbacks
  const analytics = user.analytics || {};
  const growthAnalytics = analytics.growthAnalytics || {};
  const contentAnalytics = analytics.contentAnalytics || {};
  const aiAnalytics = analytics.aiAnalytics || {};

  return (
    <div className="space-y-6">
      {/* Growth Metrics */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Growth Analytics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {growthAnalytics.totalFollowers || 0}
            </div>
            <div className="text-sm text-gray-600">Total Followers</div>
            <div className="text-xs text-green-500 mt-1">
              +{growthAnalytics.followerGrowth?.monthly || 0} this month
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">
              {growthAnalytics.engagementRate || 0}%
            </div>
            <div className="text-sm text-gray-600">Engagement Rate</div>
            <div className="text-xs text-blue-500 mt-1">{growthAnalytics.reach || 0} reach</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">
              {growthAnalytics.impressions || 0}
            </div>
            <div className="text-sm text-gray-600">Impressions</div>
            <div className="text-xs text-gray-500 mt-1">
              Last calculated:{' '}
              {growthAnalytics.lastCalculated
                ? new Date(growthAnalytics.lastCalculated).toLocaleDateString()
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content Performance */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Performance</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Content Created</span>
              <span className="text-lg font-semibold">{contentAnalytics.totalCreated || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Images Generated</span>
              <span className="text-lg font-semibold">
                {contentAnalytics.images?.count || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Videos Created</span>
              <span className="text-lg font-semibold">
                {contentAnalytics.videos?.count || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Captions Written</span>
              <span className="text-lg font-semibold">
                {contentAnalytics.captions?.count || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Hashtags Generated</span>
              <span className="text-lg font-semibold">
                {contentAnalytics.hashtags?.count || 0}
              </span>
            </div>
          </div>
        </div>

        {/* AI Usage Analytics */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Usage Analytics</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Credits Used</span>
              <span className="text-lg font-semibold">
                {aiAnalytics.totalCreditsUsed || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Image Generation</span>
              <span className="text-lg font-semibold">
                {aiAnalytics.imageGeneration?.count || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Video Generation</span>
              <span className="text-lg font-semibold">
                {aiAnalytics.videoGeneration?.count || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Caption Generation</span>
              <span className="text-lg font-semibold">
                {aiAnalytics.captionGeneration?.count || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Hashtag Generation</span>
              <span className="text-lg font-semibold">
                {aiAnalytics.hashtagGeneration?.count || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed AI Usage Breakdown */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Usage Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="text-center p-4 border rounded-lg">
            <Image className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-600">
              {aiAnalytics.imageGeneration?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Images Generated</div>
            <div className="text-xs text-gray-500 mt-1">
              {aiAnalytics.imageGeneration?.creditsUsed || 0} credits used
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Video className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-purple-600">
              {aiAnalytics.videoGeneration?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Videos Generated</div>
            <div className="text-xs text-gray-500 mt-1">
              {aiAnalytics.videoGeneration?.creditsUsed || 0} credits used
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <FileText className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">
              {aiAnalytics.captionGeneration?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Captions Generated</div>
            <div className="text-xs text-gray-500 mt-1">
              {aiAnalytics.captionGeneration?.creditsUsed || 0} credits used
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Hash className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-600">
              {aiAnalytics.hashtagGeneration?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Hashtags Generated</div>
            <div className="text-xs text-gray-500 mt-1">
              {aiAnalytics.hashtagGeneration?.creditsUsed || 0} credits used
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Settings className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-indigo-600">
              {aiAnalytics.contentOptimization?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Content Optimized</div>
            <div className="text-xs text-gray-500 mt-1">
              {aiAnalytics.contentOptimization?.creditsUsed || 0} credits used
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Brain className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-red-600">
              {aiAnalytics.totalCreditsUsed || 0}
            </div>
            <div className="text-sm text-gray-600">Total Credits Used</div>
            <div className="text-xs text-gray-500 mt-1">All AI features</div>
          </div>
        </div>
      </div>

      {/* AI Usage Timeline */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Usage Timeline</h3>
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            Last AI usage:{' '}
            {aiAnalytics.lastUsed
              ? new Date(aiAnalytics.lastUsed).toLocaleString()
              : 'Never'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default UserAnalytics;
