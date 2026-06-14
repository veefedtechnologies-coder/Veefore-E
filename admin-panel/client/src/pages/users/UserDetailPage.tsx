/**
 * UserDetailPage
 *
 * Orchestrator page component for the Admin Panel user detail view.
 * Fetches user data via the /user-detail API and renders the correct
 * tab component based on the selected navigation item.
 *
 * Extracted sub-components (each in their own file):
 *  - UserProfile     – Overview, onboarding journey, quick admin actions
 *  - UserAnalytics   – Growth, content performance, AI usage analytics
 *  - UserActivity    – Social media, content, sessions, workspaces
 *  - UserSubscription – Revenue, subscription and payment history
 *
 * Requirements: 10.1, 10.4
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api';
import {
  User,
  Activity,
  TrendingUp,
  DollarSign,
  Brain,
  FileText,
  Globe,
  Settings,
  AlertCircle,
  ArrowLeft,
  BarChart3,
} from 'lucide-react';

// Extracted sub-components
import UserProfile from './components/UserProfile';
import UserAnalytics from './components/UserAnalytics';
import UserActivity from './components/UserActivity';
import UserSubscription from './components/UserSubscription';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Full user detail object returned by the /user-detail/:userId endpoint.
 * Fields are typed broadly as `any` for the nested analytics sub-objects
 * because the shape varies by what data has been collected for each user.
 */
interface UserDetail {
  _id: string;
  email: string;
  username: string;
  displayName: string;
  avatar: string;
  plan: string;
  status: string;
  credits: {
    total: number;
    used: number;
    remaining: number;
  };
  isEmailVerified: boolean;
  isOnboarded: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin: string;
  loginCount: number;
  dailyLoginStreak: number;
  referralCode: string;
  totalReferrals: number;
  totalEarned: number;
  preferences: any;
  notes: Array<{
    text: string;
    addedAt: string;
    addedBy: string;
  }>;
  suspensionReason: string | null;
  suspendedAt: string | null;
  analytics: {
    socialAnalytics: any;
    aiAnalytics: any;
    contentAnalytics: any;
    growthAnalytics: any;
    revenueAnalytics: any;
    activityAnalytics: any;
    workspaceAnalytics: any;
  };
}

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

/** Identifies the currently active tab */
type TabId =
  | 'overview'
  | 'analytics'
  | 'social'
  | 'ai'
  | 'content'
  | 'revenue'
  | 'activity'
  | 'workspace';

interface TabConfig {
  id: TabId;
  name: string;
  icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: 'overview', name: 'Overview', icon: User },
  { id: 'analytics', name: 'Analytics', icon: BarChart3 },
  { id: 'social', name: 'Social Media', icon: Globe },
  { id: 'ai', name: 'AI Usage', icon: Brain },
  { id: 'content', name: 'Content', icon: FileText },
  { id: 'revenue', name: 'Revenue', icon: DollarSign },
  { id: 'activity', name: 'Activity', icon: Activity },
  { id: 'workspace', name: 'Workspace', icon: Settings },
];

/** Maps tab IDs that live inside UserActivity to its sub-tab label */
const ACTIVITY_TABS = new Set<TabId>(['social', 'ai', 'content', 'activity', 'workspace']);

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

/** Returns Tailwind CSS classes for a user status badge */
const getStatusClasses = (status: string): string => {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    dormant: 'bg-orange-100 text-orange-800',
    trial: 'bg-blue-100 text-blue-800',
    banned: 'bg-red-100 text-red-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-800';
};

/** Returns a human-readable label for a user status */
const getStatusLabel = (status: string): string => {
  const map: Record<string, string> = {
    active: 'Active',
    pending: 'Pending',
    dormant: 'Dormant',
    trial: 'Trial',
    banned: 'Banned',
  };
  return map[status] ?? 'Inactive';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * UserDetailPage is the route-level component for `/users/:userId`.
 * It owns data fetching and exposes action callbacks (status update, credit
 * management, note creation) to child components that need them.
 */
const UserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  /** Fetches (or re-fetches) user details from the API. */
  const fetchUserDetails = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/user-detail/${userId}`);
      console.log('🔍 Frontend received user data:', response.data.data);
      console.log('🔍 Social media data:', response.data.data.socialMedia);
      console.log('🔍 Workspace data:', response.data.data.workspace);
      setUser(response.data.data);
    } catch (err) {
      console.error('Error fetching user details:', err);
      setError('Failed to fetch user details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);

  // -------------------------------------------------------------------------
  // Action callbacks passed down to sub-components
  // -------------------------------------------------------------------------

  /**
   * Updates the user's account status.
   * @param status - New status value (e.g. 'active', 'suspended')
   * @param reason - Optional human-readable reason
   */
  const handleStatusUpdate = async (status: string, reason?: string): Promise<void> => {
    try {
      await apiClient.patch(`/user-detail/${userId}/status`, { status, reason });
      await fetchUserDetails();
    } catch (err) {
      console.error('Error updating user status:', err);
    }
  };

  /**
   * Adds or subtracts credits from the user's account.
   * @param credits - Number of credits to modify
   * @param action  - 'add' | 'subtract'
   * @param reason  - Optional human-readable reason for the change
   */
  const handleCreditsUpdate = async (
    credits: number,
    action: string,
    reason?: string
  ): Promise<void> => {
    try {
      await apiClient.patch(`/user-detail/${userId}/credits`, { credits, action, reason });
      await fetchUserDetails();
    } catch (err) {
      console.error('Error updating user credits:', err);
    }
  };

  /**
   * Appends an admin note to the user's record.
   * @param note - Plain-text note content
   */
  const handleAddNote = async (note: string): Promise<void> => {
    try {
      await apiClient.post(`/user-detail/${userId}/notes`, { note });
      await fetchUserDetails();
    } catch (err) {
      console.error('Error adding note:', err);
    }
  };

  // -------------------------------------------------------------------------
  // Render: loading / error states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error || 'User not found'}</p>
          <button
            onClick={() => navigate('/users')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: main page
  // -------------------------------------------------------------------------

  /**
   * Determines which component to render for the currently active tab.
   * Tabs that belong to UserActivity are passed through as the 'social',
   * 'ai', 'content', 'activity' or 'workspace' sub-tabs inside that component.
   */
  const renderTabContent = (): React.ReactNode => {
    switch (activeTab) {
      case 'overview':
        return (
          <UserProfile
            user={user}
            onStatusUpdate={handleStatusUpdate}
            onCreditsUpdate={handleCreditsUpdate}
            onAddNote={handleAddNote}
          />
        );

      case 'analytics':
        return <UserAnalytics user={user} />;

      case 'revenue':
        return <UserSubscription user={user} />;

      // Social, AI, Content, Activity and Workspace are all handled inside
      // UserActivity via its own internal sub-tab navigation.
      case 'social':
      case 'ai':
      case 'content':
      case 'activity':
      case 'workspace':
        return <UserActivity user={user} />;

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ------------------------------------------------------------------ */}
      {/* Page header                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            {/* Back + user identity */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/users')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Back to users list"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <div className="flex items-center space-x-4">
                <img
                  src={
                    user.avatar ||
                    `https://ui-avatars.com/api/?name=${user.displayName}&background=6366f1&color=fff`
                  }
                  alt={user.displayName}
                  className="h-12 w-12 rounded-full"
                />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{user.displayName}</h1>
                  <p className="text-gray-600">
                    @{user.username} • {user.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Status + plan badges */}
            <div className="flex items-center space-x-3">
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusClasses(
                  user.status
                )}`}
              >
                {getStatusLabel(user.status)}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  user.plan === 'Free'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {user.plan} Plan
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Navigation tabs                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" role="tablist" aria-label="User detail sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default UserDetailPage;
