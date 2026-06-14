/**
 * UserActivity component
 *
 * Displays the complete activity picture for a given user across multiple domains:
 * - Social Media connections and account details per platform
 * - Content creation overview and statistics
 * - Activity sessions (total sessions, avg duration, time today/this week)
 * - Workspace listing with per-workspace account and credit details
 *
 * This component consolidates the SocialTab, ContentTab, ActivityTab and
 * WorkspaceTab sections from the original UserDetailPage.tsx.
 */

import React from 'react';
import {
  Globe,
  CheckCircle,
  Activity,
  Clock,
  Calendar,
  BarChart3,
  Image,
  Video,
  FileText,
  Hash,
  Settings,
} from 'lucide-react';

/** Props accepted by the UserActivity component */
export interface UserActivityProps {
  /** Full user detail object returned by the /user-detail API */
  user: any;
}

// ---------------------------------------------------------------------------
// Social Media section
// ---------------------------------------------------------------------------

/**
 * SocialSection renders connected social media account cards grouped by
 * platform, showing followers, following, posts and connection status.
 */
const SocialSection: React.FC<{ user: any }> = ({ user }) => {
  const socialMedia = user.socialMedia || {};
  const instagramAccounts = socialMedia.instagramAccounts || [];
  const twitterAccounts = socialMedia.twitterAccounts || [];
  const linkedinAccounts = socialMedia.linkedinAccounts || [];
  const tiktokAccounts = socialMedia.tiktokAccounts || [];
  const youtubeAccounts = socialMedia.youtubeAccounts || [];

  // Combine all social accounts with a platform label
  const allSocialAccounts = [
    ...instagramAccounts.map((a: any) => ({ ...a, platform: 'instagram' })),
    ...twitterAccounts.map((a: any) => ({ ...a, platform: 'twitter' })),
    ...linkedinAccounts.map((a: any) => ({ ...a, platform: 'linkedin' })),
    ...tiktokAccounts.map((a: any) => ({ ...a, platform: 'tiktok' })),
    ...youtubeAccounts.map((a: any) => ({ ...a, platform: 'youtube' })),
  ];

  /** Platform colour map used for icon background and text colour */
  const platformStyles: Record<string, { bg: string; text: string }> = {
    instagram: { bg: 'bg-pink-100', text: 'text-pink-600' },
    twitter: { bg: 'bg-blue-100', text: 'text-blue-600' },
    linkedin: { bg: 'bg-blue-200', text: 'text-blue-700' },
    tiktok: { bg: 'bg-black', text: 'text-white' },
    youtube: { bg: 'bg-red-100', text: 'text-red-600' },
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Social Media Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {socialMedia.totalConnections || 0}
            </div>
            <div className="text-sm text-gray-600">Total Connections</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {socialMedia.totalWorkspaces || 0}
            </div>
            <div className="text-sm text-gray-600">Workspaces</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-gray-600">
              {socialMedia.summary || 'No connections'}
            </div>
          </div>
        </div>
      </div>

      {/* All Social Media Accounts */}
      {allSocialAccounts.length > 0 ? (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            All Social Media Accounts
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allSocialAccounts.map((account: any, index: number) => {
              const styles = platformStyles[account.platform] || {
                bg: 'bg-gray-100',
                text: 'text-gray-600',
              };
              return (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className={`p-2 rounded-lg ${styles.bg}`}>
                        <Globe className={`h-5 w-5 ${styles.text}`} />
                      </div>
                      <span className="font-semibold capitalize">{account.platform}</span>
                    </div>
                    {account.verified && (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Handle:</span>
                      <span className="text-sm font-medium">@{account.username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Followers:</span>
                      <span className="text-sm font-medium">
                        {account.followers.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Following:</span>
                      <span className="text-sm font-medium">
                        {account.following.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Posts:</span>
                      <span className="text-sm font-medium">
                        {account.posts.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Connected:</span>
                      <span
                        className={`text-sm font-medium ${
                          account.connected ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {account.connected ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {account.workspace && (
                      <div className="mt-3 p-2 bg-gray-50 rounded">
                        <div className="text-xs text-gray-600">Workspace:</div>
                        <div className="text-sm font-medium">{account.workspace.name}</div>
                        <div className="text-xs text-gray-500">ID: {account.workspace.id}</div>
                      </div>
                    )}
                    {account.connectedAt && (
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Connected:</span>
                        <span className="text-sm font-medium">
                          {new Date(account.connectedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            No Social Media Connections
          </h4>
          <p className="text-gray-500">
            This user hasn't connected any social media accounts yet.
          </p>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Content section
// ---------------------------------------------------------------------------

/**
 * ContentSection renders the content creation overview, per-type counts and
 * AI vs manual content ratio.
 */
const ContentSection: React.FC<{ user: any }> = ({ user }) => {
  const analytics = user.analytics || {};
  const contentAnalytics = analytics.contentAnalytics || {};

  const totalAiGenerated =
    (contentAnalytics.images?.aiGenerated || 0) +
    (contentAnalytics.videos?.aiGenerated || 0) +
    (contentAnalytics.captions?.aiGenerated || 0) +
    (contentAnalytics.hashtags?.aiGenerated || 0);

  const totalCreated = contentAnalytics.totalCreated || 0;
  const aiUsageRate =
    totalCreated > 0 ? Math.round((totalAiGenerated / totalCreated) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Content Overview */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Content Creation Overview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center p-4 border rounded-lg">
            <Image className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-600">
              {contentAnalytics.images?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Images</div>
            <div className="text-xs text-gray-500 mt-1">
              {contentAnalytics.images?.aiGenerated || 0} AI generated
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Video className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-purple-600">
              {contentAnalytics.videos?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Videos</div>
            <div className="text-xs text-gray-500 mt-1">
              {contentAnalytics.videos?.aiGenerated || 0} AI generated
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <FileText className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">
              {contentAnalytics.captions?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Captions</div>
            <div className="text-xs text-gray-500 mt-1">
              {contentAnalytics.captions?.aiGenerated || 0} AI generated
            </div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Hash className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-600">
              {contentAnalytics.hashtags?.count || 0}
            </div>
            <div className="text-sm text-gray-600">Hashtags</div>
            <div className="text-xs text-gray-500 mt-1">
              {contentAnalytics.hashtags?.aiGenerated || 0} AI generated
            </div>
          </div>
        </div>
      </div>

      {/* Content Statistics */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Content Created</span>
              <span className="text-lg font-semibold">{totalCreated}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">AI Generated Content</span>
              <span className="text-lg font-semibold">{totalAiGenerated}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Manual Content</span>
              <span className="text-lg font-semibold">{totalCreated - totalAiGenerated}</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Last Content Created</span>
              <span className="text-sm font-medium">
                {contentAnalytics.lastCreated
                  ? new Date(contentAnalytics.lastCreated).toLocaleDateString()
                  : 'Never'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">AI Usage Rate</span>
              <span className="text-sm font-medium">{aiUsageRate}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Activity (Sessions) section
// ---------------------------------------------------------------------------

/**
 * ActivitySection renders session-level activity metrics and an activity
 * timeline for the user.
 */
const ActivitySection: React.FC<{ user: any }> = ({ user }) => {
  const activityAnalytics = user.analytics?.activityAnalytics || {};

  return (
    <div className="space-y-6">
      {/* Activity Overview */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center p-4 border rounded-lg">
            <Activity className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-600">
              {activityAnalytics.totalSessions || 0}
            </div>
            <div className="text-sm text-gray-600">Total Sessions</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Clock className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">
              {Math.round((activityAnalytics.averageSessionDuration || 0) / 60)}
            </div>
            <div className="text-sm text-gray-600">Avg Session (min)</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Calendar className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-purple-600">
              {Math.round((activityAnalytics.timeSpentToday || 0) / 60)}
            </div>
            <div className="text-sm text-gray-600">Time Today (min)</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <BarChart3 className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-600">
              {Math.round((activityAnalytics.timeSpentThisWeek || 0) / 60)}
            </div>
            <div className="text-sm text-gray-600">Time This Week (min)</div>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h3>
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Last Active</p>
              <p className="text-xs text-gray-500">
                {activityAnalytics.lastActiveAt
                  ? new Date(activityAnalytics.lastActiveAt).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Time This Month</p>
              <p className="text-xs text-gray-500">
                {Math.round((activityAnalytics.timeSpentThisMonth || 0) / 60)} minutes
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Workspace section
// ---------------------------------------------------------------------------

/**
 * WorkspaceSection renders details for all workspaces the user owns, including
 * the primary workspace and a grid of all workspace cards.
 */
const WorkspaceSection: React.FC<{ user: any }> = ({ user }) => {
  const socialMedia = user.socialMedia || {};
  const workspaces = socialMedia.workspaces || [];
  const primaryWorkspace = user.workspace || {};

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Workspace Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{workspaces.length}</div>
            <div className="text-sm text-gray-600">Total Workspaces</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {workspaces.reduce(
                (sum: number, ws: any) => sum + (ws.socialAccountsCount || 0),
                0
              )}
            </div>
            <div className="text-sm text-gray-600">Total Social Accounts</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {
                workspaces.filter((ws: any) => (ws.socialAccountsCount || 0) > 0)
                  .length
              }
            </div>
            <div className="text-sm text-gray-600">Active Workspaces</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {workspaces.reduce(
                (sum: number, ws: any) => sum + (ws.credits || 0),
                0
              )}
            </div>
            <div className="text-sm text-gray-600">Total Credits</div>
          </div>
        </div>
      </div>

      {/* Primary Workspace Details */}
      {primaryWorkspace && primaryWorkspace.id && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Primary Workspace</h3>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              Main
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Workspace Name</span>
                <span className="text-lg font-semibold">
                  {primaryWorkspace.name || 'Default Workspace'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Workspace ID</span>
                <span className="text-sm font-medium font-mono bg-gray-100 px-2 py-1 rounded">
                  {primaryWorkspace.id || user.workspaceId || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Theme</span>
                <span className="text-sm font-medium capitalize">
                  {primaryWorkspace.theme || 'light'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">AI Personality</span>
                <span className="text-sm font-medium capitalize">
                  {primaryWorkspace.aiPersonality || 'professional'}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Credits</span>
                <span className="text-lg font-semibold">{primaryWorkspace.credits || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Social Accounts</span>
                <span className="text-sm font-medium">
                  {primaryWorkspace.socialAccountsCount || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Connected Platforms</span>
                <span className="text-sm font-medium">
                  {primaryWorkspace.connectedPlatforms?.join(', ') || 'None'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Max Team Members</span>
                <span className="text-sm font-medium">
                  {primaryWorkspace.maxTeamMembers || 1}
                </span>
              </div>
            </div>
          </div>
          {primaryWorkspace.description && (
            <div className="mt-6">
              <span className="text-sm text-gray-600">Description</span>
              <p className="mt-2 text-sm text-gray-900">{primaryWorkspace.description}</p>
            </div>
          )}
        </div>
      )}

      {/* All Workspaces */}
      {workspaces.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">All Workspaces</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((workspace: any, index: number) => (
              <div
                key={index}
                className="border rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 text-lg">{workspace.name}</h4>
                  <div className="flex space-x-2">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {workspace.socialAccountsCount || 0} accounts
                    </span>
                    {workspace.isDefault && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">ID:</span>
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                      {workspace.id}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Credits:</span>
                    <span className="text-sm font-medium">{workspace.credits || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Theme:</span>
                    <span className="text-sm font-medium capitalize">
                      {workspace.theme || 'light'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">AI Personality:</span>
                    <span className="text-sm font-medium capitalize">
                      {workspace.aiPersonality || 'professional'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Max Members:</span>
                    <span className="text-sm font-medium">
                      {workspace.maxTeamMembers || 1}
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-sm text-gray-600">Connected Platforms:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {workspace.connectedPlatforms &&
                      workspace.connectedPlatforms.length > 0 ? (
                        workspace.connectedPlatforms.map(
                          (platform: string, idx: number) => (
                            <span
                              key={idx}
                              className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded"
                            >
                              {platform}
                            </span>
                          )
                        )
                      ) : (
                        <span className="text-xs text-gray-500">None</span>
                      )}
                    </div>
                  </div>
                  {workspace.description && (
                    <div className="mt-3">
                      <span className="text-sm text-gray-600">Description:</span>
                      <p className="mt-1 text-sm text-gray-700">{workspace.description}</p>
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs text-gray-500">
                      <div>
                        Created:{' '}
                        {workspace.createdAt
                          ? new Date(workspace.createdAt).toLocaleDateString()
                          : 'Unknown'}
                      </div>
                      <div>
                        Updated:{' '}
                        {workspace.updatedAt
                          ? new Date(workspace.updatedAt).toLocaleDateString()
                          : 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab selector constants
// ---------------------------------------------------------------------------

/** Available sub-tabs inside the UserActivity component */
export type ActivitySubTab = 'social' | 'content' | 'activity' | 'workspace';

/** Icon map for each sub-tab */
const subTabConfig: Array<{
  id: ActivitySubTab;
  name: string;
  icon: React.ElementType;
}> = [
  { id: 'social', name: 'Social Media', icon: Globe },
  { id: 'content', name: 'Content', icon: FileText },
  { id: 'activity', name: 'Activity', icon: Activity },
  { id: 'workspace', name: 'Workspace', icon: Settings },
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * UserActivity is the main export for this module.
 * It provides a sub-tab navigation across Social, Content, Activity and
 * Workspace sections so admins can drill into specific activity data.
 */
const UserActivity: React.FC<UserActivityProps> = ({ user }) => {
  const [activeSubTab, setActiveSubTab] = React.useState<ActivitySubTab>('social');

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="bg-white border rounded-lg">
        <nav className="flex space-x-1 p-1">
          {subTabConfig.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeSubTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'social' && <SocialSection user={user} />}
      {activeSubTab === 'content' && <ContentSection user={user} />}
      {activeSubTab === 'activity' && <ActivitySection user={user} />}
      {activeSubTab === 'workspace' && <WorkspaceSection user={user} />}
    </div>
  );
};

export default UserActivity;
