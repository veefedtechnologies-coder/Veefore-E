import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api';
import { 
  User, 
  Users, 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Brain, 
  Image, 
  Video, 
  FileText, 
  Hash,
  Settings,
  Ban,
  CheckCircle,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  ArrowLeft,
  Calendar,
  Clock,
  Globe,
  CreditCard,
  BarChart3,
  PieChart,
  Target
} from 'lucide-react';

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

const UserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
    }
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/user-detail/${userId}`);
      console.log('🔍 Frontend received user data:', response.data.data);
      console.log('🔍 Social media data:', response.data.data.socialMedia);
      console.log('🔍 Workspace data:', response.data.data.workspace);
      setUser(response.data.data);
    } catch (error) {
      console.error('Error fetching user details:', error);
      setError('Failed to fetch user details');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (status: string, reason?: string) => {
    try {
      await apiClient.patch(`/user-detail/${userId}/status`, {
        status,
        reason
      });
      await fetchUserDetails();
      setShowStatusModal(false);
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

  const handleCreditsUpdate = async (credits: number, action: string, reason?: string) => {
    try {
      await apiClient.patch(`/user-detail/${userId}/credits`, {
        credits,
        action,
        reason
      });
      await fetchUserDetails();
      setShowCreditsModal(false);
    } catch (error) {
      console.error('Error updating user credits:', error);
    }
  };

  const handleAddNote = async (note: string) => {
    try {
      await apiClient.post(`/user-detail/${userId}/notes`, { note });
      await fetchUserDetails();
      setShowNoteModal(false);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/users')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <div className="flex items-center space-x-4">
                <img
                  src={user.avatar || `https://ui-avatars.com/api/?name=${user.displayName}&background=6366f1&color=fff`}
                  alt={user.displayName}
                  className="h-12 w-12 rounded-full"
                />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{user.displayName}</h1>
                  <p className="text-gray-600">@{user.username} • {user.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                user.status === 'active' 
                  ? 'bg-green-100 text-green-800' 
                  : user.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-800'
                  : user.status === 'dormant'
                  ? 'bg-orange-100 text-orange-800'
                  : user.status === 'trial'
                  ? 'bg-blue-100 text-blue-800'
                  : user.status === 'banned'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {user.status === 'active' ? 'Active' : 
                 user.status === 'pending' ? 'Pending' :
                 user.status === 'dormant' ? 'Dormant' :
                 user.status === 'trial' ? 'Trial' :
                 user.status === 'banned' ? 'Banned' : 'Inactive'}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                user.plan === 'Free' 
                  ? 'bg-gray-100 text-gray-800' 
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {user.plan} Plan
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', name: 'Overview', icon: User },
              { id: 'analytics', name: 'Analytics', icon: BarChart3 },
              { id: 'social', name: 'Social Media', icon: Globe },
              { id: 'ai', name: 'AI Usage', icon: Brain },
              { id: 'content', name: 'Content', icon: FileText },
              { id: 'revenue', name: 'Revenue', icon: DollarSign },
              { id: 'activity', name: 'Activity', icon: Activity },
              { id: 'workspace', name: 'Workspace', icon: Settings }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && <OverviewTab user={user} onStatusUpdate={handleStatusUpdate} onCreditsUpdate={handleCreditsUpdate} onAddNote={handleAddNote} />}
        {activeTab === 'analytics' && <AnalyticsTab user={user} />}
        {activeTab === 'social' && <SocialTab user={user} />}
        {activeTab === 'ai' && <AITab user={user} />}
        {activeTab === 'content' && <ContentTab user={user} />}
        {activeTab === 'revenue' && <RevenueTab user={user} />}
        {activeTab === 'activity' && <ActivityTab user={user} />}
        {activeTab === 'workspace' && <WorkspaceTab user={user} />}
      </div>
    </div>
  );
};

// Enhanced Overview Tab with detailed information
const OverviewTab = ({ user, onStatusUpdate, onCreditsUpdate, onAddNote }: any) => {
  // Safely access analytics data with fallbacks
  const analytics = user.analytics || {};
  const socialAnalytics = analytics.socialAnalytics || {};
  const aiAnalytics = analytics.aiAnalytics || {};
  const contentAnalytics = analytics.contentAnalytics || {};
  const growthAnalytics = analytics.growthAnalytics || {};
  const revenueAnalytics = analytics.revenueAnalytics || {};
  const activityAnalytics = analytics.activityAnalytics || {};

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
            <p className="text-2xl font-bold text-gray-900">{user.socialMedia?.totalConnections || 0}</p>
            <p className="text-sm text-gray-500">platforms</p>
            <p className="text-xs text-purple-500">
              {(() => {
                const socialMedia = user.socialMedia || {};
                const instagramAccounts = socialMedia.instagramAccounts || [];
                const twitterAccounts = socialMedia.twitterAccounts || [];
                const linkedinAccounts = socialMedia.linkedinAccounts || [];
                const tiktokAccounts = socialMedia.tiktokAccounts || [];
                const youtubeAccounts = socialMedia.youtubeAccounts || [];
                
                const totalFollowers = [
                  ...instagramAccounts,
                  ...twitterAccounts,
                  ...linkedinAccounts,
                  ...tiktokAccounts,
                  ...youtubeAccounts
                ].reduce((sum, account) => sum + (account.followers || 0), 0);
                
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
            <p className="text-2xl font-bold text-gray-900">${revenueAnalytics.lifetimeValue || 0}</p>
            <p className="text-sm text-gray-500">revenue</p>
            <p className="text-xs text-green-500">Spent: ${revenueAnalytics.totalSpent || 0}</p>
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
            <span className={`text-sm font-medium ${user.isEmailVerified ? 'text-green-600' : 'text-red-600'}`}>
              {user.isEmailVerified ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Onboarded:</span>
            <span className={`text-sm font-medium ${user.isOnboarded ? 'text-green-600' : 'text-yellow-600'}`}>
              {user.isOnboarded ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Member Since:</span>
            <span className="text-sm font-medium">{new Date(user.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Last Login:</span>
            <span className="text-sm font-medium">{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Status Reason:</span>
            <span className="text-sm font-medium text-gray-900">{user.statusReason || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Referral Code:</span>
            <span className="text-sm font-medium font-mono">{user.referralCode || 'N/A'}</span>
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
                  {user.lastActivityAt ? new Date(user.lastActivityAt).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">
                {user.daysSinceLastActivity !== undefined ? user.daysSinceLastActivity : 'N/A'}
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
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                user.daysSinceLastActivity <= 7 
                  ? 'bg-green-100 text-green-800' 
                  : user.daysSinceLastActivity <= 30
                  ? 'bg-yellow-100 text-yellow-800'
                  : user.daysSinceLastActivity <= 60
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-red-100 text-red-800'
              }`}>
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
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Last 7 days</span>
                <span className={`px-2 py-1 rounded ${
                  user.daysSinceLastActivity <= 7 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}>
                  {user.daysSinceLastActivity <= 7 ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Last 30 days</span>
                <span className={`px-2 py-1 rounded ${
                  user.daysSinceLastActivity <= 30 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}>
                  {user.daysSinceLastActivity <= 30 ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Last 60 days</span>
                <span className={`px-2 py-1 rounded ${
                  user.daysSinceLastActivity <= 60 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}>
                  {user.daysSinceLastActivity <= 60 ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Last 90 days</span>
                <span className={`px-2 py-1 rounded ${
                  user.daysSinceLastActivity <= 90 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}>
                  {user.daysSinceLastActivity <= 90 ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* App Usage Insights */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">App Usage Insights</h3>
        <div className="space-y-4">
          {/* Daily Usage Time */}
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
                {user.dailyUsageTime ? `${Math.round(user.dailyUsageTime / 60)} hours` : 'No data'}
              </p>
            </div>
          </div>

          {/* Session Duration */}
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

          {/* Usage Frequency */}
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
                {user.daysSinceLastActivity ? `${user.daysSinceLastActivity} days ago` : 'No data'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Referral Information */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Referral Information</h3>
        <div className="space-y-4">
          {/* Referred By */}
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

          {/* Referral Performance */}
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

          {/* Referral Code */}
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

      {/* Onboarding Journey */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Complete Onboarding Journey</h3>
        
        {/* Onboarding Summary */}
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Overall Onboarding Status</h4>
              <p className="text-xs text-gray-600">Complete journey from waitlist to app usage</p>
            </div>
            <div className="flex space-x-4">
              <div className="text-center">
                <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                  user.waitlistStatus === 'active' || user.waitlistStatus === 'approved' ? 'bg-green-500' : 'bg-yellow-500'
                }`}></div>
                <p className="text-xs text-gray-600">Waitlist</p>
              </div>
              <div className="text-center">
                <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                  user.isOnboarded ? 'bg-green-500' : 'bg-gray-300'
                }`}></div>
                <p className="text-xs text-gray-600">Signup</p>
              </div>
              <div className="text-center">
                <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                  user.onboardingStep >= 5 ? 'bg-green-500' : user.onboardingStep > 0 ? 'bg-yellow-500' : 'bg-gray-300'
                }`}></div>
                <p className="text-xs text-gray-600">Complete</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Phase 1: Waitlist Onboarding */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Phase 1: Waitlist Onboarding</h4>
              <p className="text-xs text-gray-500">Questionnaire completed when joining waitlist</p>
            </div>
          </div>
          
          {/* Waitlist Information */}
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Joined Waitlist</p>
                <p className="text-sm font-medium text-gray-900">
                  {user.waitlistJoinedAt ? new Date(user.waitlistJoinedAt).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Status</p>
                <p className={`text-sm font-medium ${
                  user.waitlistStatus === 'active' ? 'text-green-600' : 
                  user.waitlistStatus === 'waitlisted' ? 'text-yellow-600' : 
                  user.waitlistStatus === 'approved' ? 'text-green-600' : 'text-gray-600'
                }`}>
                  {user.waitlistStatus || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Waitlist Questionnaire */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-gray-900">Waitlist Questionnaire</h5>
                <p className="text-xs text-gray-500">Questions answered when joining waitlist</p>
              </div>
            </div>

          {/* Question 1: What describes you best? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">What describes you best?</h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.businessType === 'creator' ? '🎨' : 
                 user.businessType === 'business' ? '🏢' : 
                 user.businessType === 'agency' ? '📈' : 
                 user.businessType === 'freelancer' ? '💼' : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.businessType === 'creator' ? 'Content Creator' : 
                 user.businessType === 'business' ? 'Business Owner' : 
                 user.businessType === 'agency' ? 'Marketing Agency' : 
                 user.businessType === 'freelancer' ? 'Freelancer' : 
                 user.businessType || 'Not answered'}
              </span>
            </div>
          </div>

          {/* Question 2: How big is your team? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">How big is your team?</h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.teamSize === 'solo' ? '👤' : 
                 user.teamSize === 'small' ? '👥' : 
                 user.teamSize === 'medium' ? '👨‍👩‍👧‍👦' : 
                 user.teamSize === 'large' ? '🏘️' : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.teamSize === 'solo' ? 'Just Me' : 
                 user.teamSize === 'small' ? '2-5 People' : 
                 user.teamSize === 'medium' ? '6-20 People' : 
                 user.teamSize === 'large' ? '20+ People' : 
                 user.teamSize || 'Not answered'}
              </span>
            </div>
          </div>

          {/* Question 3: What tools do you currently use? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">What tools do you currently use?</h5>
            <div className="flex flex-wrap gap-2">
              {user.currentTools && user.currentTools.length > 0 ? (
                user.currentTools.map((tool: string, index: number) => (
                  <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {tool === 'canva' ? '🎨 Canva' :
                     tool === 'hootsuite' ? '📅 Hootsuite' :
                     tool === 'buffer' ? '⏰ Buffer' :
                     tool === 'later' ? '📱 Later' :
                     tool === 'photoshop' ? '🖼️ Photoshop' :
                     tool === 'figma' ? '✨ Figma' :
                     tool === 'none' ? '✋ None / Manual' : tool}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">Not answered</span>
              )}
            </div>
          </div>

          {/* Question 4: What's your primary goal? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">What's your primary goal?</h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.primaryGoal === 'growth' ? '📈' : 
                 user.primaryGoal === 'engagement' ? '❤️' : 
                 user.primaryGoal === 'sales' ? '💰' : 
                 user.primaryGoal === 'efficiency' ? '⏱️' : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.primaryGoal === 'growth' ? 'Grow Followers' : 
                 user.primaryGoal === 'engagement' ? 'Boost Engagement' : 
                 user.primaryGoal === 'sales' ? 'Drive Sales' : 
                 user.primaryGoal === 'efficiency' ? 'Save Time' : 
                 user.primaryGoal || 'Not answered'}
              </span>
            </div>
          </div>

          {/* Question 5: What content do you create? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">What content do you create?</h5>
            <div className="flex flex-wrap gap-2">
              {user.contentTypes && user.contentTypes.length > 0 ? (
                user.contentTypes.map((type: string, index: number) => (
                  <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {type === 'posts' ? '📝 Social Posts' :
                     type === 'stories' ? '📸 Stories' :
                     type === 'videos' ? '🎥 Videos' :
                     type === 'reels' ? '🎬 Reels/Shorts' :
                     type === 'graphics' ? '🖌️ Graphics' :
                     type === 'blogs' ? '📄 Blog Content' : type}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">Not answered</span>
              )}
            </div>
          </div>

          {/* Question 6: When do you need this solution? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">When do you need this solution?</h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.urgency === 'asap' ? '🚀' : 
                 user.urgency === 'month' ? '📅' : 
                 user.urgency === 'quarter' ? '🗓️' : 
                 user.urgency === 'exploring' ? '🔍' : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.urgency === 'asap' ? 'Right Now' : 
                 user.urgency === 'month' ? 'Within a Month' : 
                 user.urgency === 'quarter' ? 'Next Quarter' : 
                 user.urgency === 'exploring' ? 'Just Exploring' : 
                 user.urgency || 'Not answered'}
              </span>
            </div>
          </div>
          </div>
        </div>

        {/* Phase 2: Post-Signup Onboarding */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Phase 2: Post-Signup Onboarding</h4>
              <p className="text-xs text-gray-500">Profile setup after getting access to the app</p>
            </div>
          </div>

          {/* Onboarding Progress */}
          <div className="mb-4 p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-gray-900">Onboarding Progress</h5>
                <p className="text-xs text-gray-500">How far they've progressed in the app</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Current Step:</span>
                <span className="font-medium">{user.onboardingStep || 0} / 5</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${((user.onboardingStep || 0) / 5) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Completed At:</span>
                <span className="font-medium">
                  {user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt).toLocaleDateString() : 'Not completed'}
                </span>
              </div>
            </div>
          </div>

          {/* Additional Profile Information from OnboardingFlow */}
          {(user.fullName || user.role || user.companyName || user.companySize || user.primaryGoals || user.currentChallenges || user.monthlyBudget || user.platforms || user.postingFrequency) && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <h5 className="text-sm font-semibold text-gray-900 mb-3">Profile Information</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {user.fullName && (
                  <div>
                    <p className="text-xs text-gray-600">Full Name</p>
                    <p className="text-sm font-medium text-gray-900">{user.fullName}</p>
                  </div>
                )}
                {user.role && (
                  <div>
                    <p className="text-xs text-gray-600">Role</p>
                    <p className="text-sm font-medium text-gray-900">{user.role}</p>
                  </div>
                )}
                {user.companyName && (
                  <div>
                    <p className="text-xs text-gray-600">Company Name</p>
                    <p className="text-sm font-medium text-gray-900">{user.companyName}</p>
                  </div>
                )}
                {user.companySize && (
                  <div>
                    <p className="text-xs text-gray-600">Company Size</p>
                    <p className="text-sm font-medium text-gray-900">{user.companySize}</p>
                  </div>
                )}
                {user.currentChallenges && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-600">Current Challenges</p>
                    <p className="text-sm font-medium text-gray-900">{user.currentChallenges}</p>
                  </div>
                )}
                {user.monthlyBudget && (
                  <div>
                    <p className="text-xs text-gray-600">Monthly Budget</p>
                    <p className="text-sm font-medium text-gray-900">{user.monthlyBudget}</p>
                  </div>
                )}
                {user.onboardingPostingFrequency && (
                  <div>
                    <p className="text-xs text-gray-600">Posting Frequency</p>
                    <p className="text-sm font-medium text-gray-900">{user.onboardingPostingFrequency}</p>
                  </div>
                )}
                {user.primaryGoals && user.primaryGoals.length > 0 && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-600 mb-1">Primary Goals</p>
                    <div className="flex flex-wrap gap-1">
                      {user.primaryGoals.map((goal: string, index: number) => (
                        <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {goal}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {user.platforms && user.platforms.length > 0 && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-600 mb-1">Social Media Platforms</p>
                    <div className="flex flex-wrap gap-1">
                      {user.platforms.map((platform: string, index: number) => (
                        <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
              <p className="text-xs text-gray-500">{aiAnalytics.totalCreditsUsed || 0} credits</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Content Created</p>
              <p className="text-xs text-gray-500">{contentAnalytics.totalCreated || 0} items</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Globe className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Social Growth</p>
              <p className="text-xs text-gray-500">+{growthAnalytics.followerGrowth?.monthly || 0} followers this month</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Revenue Generated</p>
              <p className="text-xs text-gray-500">${revenueAnalytics.totalSpent || 0} total spent</p>
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
          onClick={() => onStatusUpdate(user.status === 'active' ? 'suspended' : 'active')}
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

// Comprehensive Analytics Tab
const AnalyticsTab = ({ user }: any) => {
  // Safely access analytics data with fallbacks
  const analytics = user.analytics || {};
  const growthAnalytics = analytics.growthAnalytics || {};
  const socialAnalytics = analytics.socialAnalytics || {};
  const aiAnalytics = analytics.aiAnalytics || {};
  const contentAnalytics = analytics.contentAnalytics || {};
  const revenueAnalytics = analytics.revenueAnalytics || {};
  const activityAnalytics = analytics.activityAnalytics || {};

  return (
    <div className="space-y-6">
      {/* Growth Metrics */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Growth Analytics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{growthAnalytics.totalFollowers || 0}</div>
            <div className="text-sm text-gray-600">Total Followers</div>
            <div className="text-xs text-green-500 mt-1">
              +{growthAnalytics.followerGrowth?.monthly || 0} this month
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{growthAnalytics.engagementRate || 0}%</div>
            <div className="text-sm text-gray-600">Engagement Rate</div>
            <div className="text-xs text-blue-500 mt-1">
              {growthAnalytics.reach || 0} reach
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">{growthAnalytics.impressions || 0}</div>
            <div className="text-sm text-gray-600">Impressions</div>
            <div className="text-xs text-gray-500 mt-1">
              Last calculated: {growthAnalytics.lastCalculated ? new Date(growthAnalytics.lastCalculated).toLocaleDateString() : 'N/A'}
            </div>
          </div>
      </div>
    </div>

    {/* Performance Metrics */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Performance</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Total Content Created</span>
            <span className="text-lg font-semibold">{contentAnalytics.totalCreated}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Images Generated</span>
            <span className="text-lg font-semibold">{contentAnalytics.images?.count || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Videos Created</span>
            <span className="text-lg font-semibold">{contentAnalytics.videos?.count || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Captions Written</span>
            <span className="text-lg font-semibold">{contentAnalytics.captions?.count || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Hashtags Generated</span>
            <span className="text-lg font-semibold">{contentAnalytics.hashtags?.count || 0}</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Usage Analytics</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Total Credits Used</span>
            <span className="text-lg font-semibold">{aiAnalytics.totalCreditsUsed || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Image Generation</span>
            <span className="text-lg font-semibold">{aiAnalytics.imageGeneration?.count || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Video Generation</span>
            <span className="text-lg font-semibold">{aiAnalytics.videoGeneration?.count || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Caption Generation</span>
            <span className="text-lg font-semibold">{aiAnalytics.captionGeneration?.count || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Hashtag Generation</span>
            <span className="text-lg font-semibold">{aiAnalytics.hashtagGeneration?.count || 0}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

// Social Media Tab
const SocialTab = ({ user }: any) => {
  // Get social media data from the correct structure
  const socialMedia = user.socialMedia || {};
  const workspaces = socialMedia.workspaces || [];
  const instagramAccounts = socialMedia.instagramAccounts || [];
  const twitterAccounts = socialMedia.twitterAccounts || [];
  const linkedinAccounts = socialMedia.linkedinAccounts || [];
  const tiktokAccounts = socialMedia.tiktokAccounts || [];
  const youtubeAccounts = socialMedia.youtubeAccounts || [];
  
  console.log('🔍 SocialTab - user:', user);
  console.log('🔍 SocialTab - socialMedia:', socialMedia);
  console.log('🔍 SocialTab - workspaces:', workspaces);
  console.log('🔍 SocialTab - instagramAccounts:', instagramAccounts);

  // Combine all social accounts
  const allSocialAccounts = [
    ...instagramAccounts.map((account: any) => ({ ...account, platform: 'instagram' })),
    ...twitterAccounts.map((account: any) => ({ ...account, platform: 'twitter' })),
    ...linkedinAccounts.map((account: any) => ({ ...account, platform: 'linkedin' })),
    ...tiktokAccounts.map((account: any) => ({ ...account, platform: 'tiktok' })),
    ...youtubeAccounts.map((account: any) => ({ ...account, platform: 'youtube' }))
  ];

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Social Media Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{socialMedia.totalConnections || 0}</div>
            <div className="text-sm text-gray-600">Total Connections</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{socialMedia.totalWorkspaces || 0}</div>
            <div className="text-sm text-gray-600">Workspaces</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-gray-600">{socialMedia.summary || 'No connections'}</div>
          </div>
        </div>
      </div>


      {/* All Social Media Accounts */}
      {allSocialAccounts.length > 0 ? (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">All Social Media Accounts</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allSocialAccounts.map((account: any, index: number) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`p-2 rounded-lg ${
                      account.platform === 'instagram' ? 'bg-pink-100' :
                      account.platform === 'twitter' ? 'bg-blue-100' :
                      account.platform === 'linkedin' ? 'bg-blue-200' :
                      account.platform === 'tiktok' ? 'bg-black' :
                      account.platform === 'youtube' ? 'bg-red-100' :
                      'bg-gray-100'
                    }`}>
                      <Globe className={`h-5 w-5 ${
                        account.platform === 'instagram' ? 'text-pink-600' :
                        account.platform === 'twitter' ? 'text-blue-600' :
                        account.platform === 'linkedin' ? 'text-blue-700' :
                        account.platform === 'tiktok' ? 'text-white' :
                        account.platform === 'youtube' ? 'text-red-600' :
                        'text-gray-600'
                      }`} />
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
                    <span className="text-sm font-medium">{account.followers.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Following:</span>
                    <span className="text-sm font-medium">{account.following.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Posts:</span>
                    <span className="text-sm font-medium">{account.posts.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Connected:</span>
                    <span className={`text-sm font-medium ${account.connected ? 'text-green-600' : 'text-red-600'}`}>
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
                      <span className="text-sm font-medium">{new Date(account.connectedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Social Media Connections</h4>
          <p className="text-gray-500">This user hasn't connected any social media accounts yet.</p>
        </div>
      )}
    </div>
  );
};

// AI Usage Tab
const AITab = ({ user }: any) => (
  <div className="space-y-6">
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Usage Breakdown</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="text-center p-4 border rounded-lg">
          <Image className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-blue-600">{aiAnalytics.imageGeneration.count}</div>
          <div className="text-sm text-gray-600">Images Generated</div>
          <div className="text-xs text-gray-500 mt-1">{aiAnalytics.imageGeneration.creditsUsed} credits used</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Video className="h-8 w-8 text-purple-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-purple-600">{aiAnalytics.videoGeneration.count}</div>
          <div className="text-sm text-gray-600">Videos Generated</div>
          <div className="text-xs text-gray-500 mt-1">{aiAnalytics.videoGeneration.creditsUsed} credits used</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <FileText className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-green-600">{aiAnalytics.captionGeneration.count}</div>
          <div className="text-sm text-gray-600">Captions Generated</div>
          <div className="text-xs text-gray-500 mt-1">{aiAnalytics.captionGeneration.creditsUsed} credits used</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Hash className="h-8 w-8 text-orange-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-orange-600">{aiAnalytics.hashtagGeneration.count}</div>
          <div className="text-sm text-gray-600">Hashtags Generated</div>
          <div className="text-xs text-gray-500 mt-1">{aiAnalytics.hashtagGeneration.creditsUsed} credits used</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Settings className="h-8 w-8 text-indigo-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-indigo-600">{aiAnalytics.contentOptimization.count}</div>
          <div className="text-sm text-gray-600">Content Optimized</div>
          <div className="text-xs text-gray-500 mt-1">{aiAnalytics.contentOptimization.creditsUsed} credits used</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Brain className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-red-600">{aiAnalytics.totalCreditsUsed}</div>
          <div className="text-sm text-gray-600">Total Credits Used</div>
          <div className="text-xs text-gray-500 mt-1">All AI features</div>
        </div>
      </div>
    </div>

    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Usage Timeline</h3>
      <div className="text-center py-8">
        <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Last AI usage: {aiAnalytics.lastUsed ? new Date(aiAnalytics.lastUsed).toLocaleString() : 'Never'}</p>
      </div>
    </div>
  </div>
);

// Content Tab
const ContentTab = ({ user }: any) => {
  // Safely access analytics data with fallbacks
  const analytics = user.analytics || {};
  const contentAnalytics = analytics.contentAnalytics || {};

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Creation Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center p-4 border rounded-lg">
            <Image className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-600">{contentAnalytics.images?.count || 0}</div>
            <div className="text-sm text-gray-600">Images</div>
            <div className="text-xs text-gray-500 mt-1">{contentAnalytics.images?.aiGenerated || 0} AI generated</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Video className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-purple-600">{contentAnalytics.videos?.count || 0}</div>
            <div className="text-sm text-gray-600">Videos</div>
            <div className="text-xs text-gray-500 mt-1">{contentAnalytics.videos?.aiGenerated || 0} AI generated</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <FileText className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-600">{contentAnalytics.captions?.count || 0}</div>
            <div className="text-sm text-gray-600">Captions</div>
            <div className="text-xs text-gray-500 mt-1">{contentAnalytics.captions?.aiGenerated || 0} AI generated</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <Hash className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-orange-600">{contentAnalytics.hashtags?.count || 0}</div>
            <div className="text-sm text-gray-600">Hashtags</div>
            <div className="text-xs text-gray-500 mt-1">{contentAnalytics.hashtags?.aiGenerated || 0} AI generated</div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Content Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Content Created</span>
              <span className="text-lg font-semibold">{contentAnalytics.totalCreated || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">AI Generated Content</span>
              <span className="text-lg font-semibold">
                {(contentAnalytics.images?.aiGenerated || 0) + 
                 (contentAnalytics.videos?.aiGenerated || 0) + 
                 (contentAnalytics.captions?.aiGenerated || 0) + 
                 (contentAnalytics.hashtags?.aiGenerated || 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Manual Content</span>
              <span className="text-lg font-semibold">
                {(contentAnalytics.totalCreated || 0) - 
                 ((contentAnalytics.images?.aiGenerated || 0) + 
                  (contentAnalytics.videos?.aiGenerated || 0) + 
                  (contentAnalytics.captions?.aiGenerated || 0) + 
                  (contentAnalytics.hashtags?.aiGenerated || 0))}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Last Content Created</span>
              <span className="text-sm font-medium">
                {contentAnalytics.lastCreated ? new Date(contentAnalytics.lastCreated).toLocaleDateString() : 'Never'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">AI Usage Rate</span>
              <span className="text-sm font-medium">
                {(contentAnalytics.totalCreated || 0) > 0 ? 
                  Math.round((((contentAnalytics.images?.aiGenerated || 0) + 
                               (contentAnalytics.videos?.aiGenerated || 0) + 
                               (contentAnalytics.captions?.aiGenerated || 0) + 
                               (contentAnalytics.hashtags?.aiGenerated || 0)) / (contentAnalytics.totalCreated || 1)) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
  </div>
  );
};

// Revenue Tab
const RevenueTab = ({ user }: any) => (
  <div className="space-y-6">
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Overview</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="text-center p-4 border rounded-lg">
          <DollarSign className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-green-600">${revenueAnalytics.lifetimeValue}</div>
          <div className="text-sm text-gray-600">Lifetime Value</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <CreditCard className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-blue-600">${revenueAnalytics.totalSpent}</div>
          <div className="text-sm text-gray-600">Total Spent</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Target className="h-8 w-8 text-purple-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-purple-600">${revenueAnalytics.subscriptionRevenue}</div>
          <div className="text-sm text-gray-600">Subscription Revenue</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Plus className="h-8 w-8 text-orange-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-orange-600">${revenueAnalytics.creditPurchases}</div>
          <div className="text-sm text-gray-600">Credit Purchases</div>
        </div>
      </div>
    </div>

    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
      <div className="text-center py-8">
        <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Last Payment: {revenueAnalytics.lastPayment ? new Date(revenueAnalytics.lastPayment).toLocaleString() : 'No payments recorded'}</p>
      </div>
    </div>
  </div>
);

// Activity Tab
const ActivityTab = ({ user }: any) => (
  <div className="space-y-6">
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Overview</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="text-center p-4 border rounded-lg">
          <Activity className="h-8 w-8 text-blue-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-blue-600">{user.analytics.activityAnalytics.totalSessions}</div>
          <div className="text-sm text-gray-600">Total Sessions</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Clock className="h-8 w-8 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-green-600">{Math.round(user.analytics.activityAnalytics.averageSessionDuration / 60)}</div>
          <div className="text-sm text-gray-600">Avg Session (min)</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <Calendar className="h-8 w-8 text-purple-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-purple-600">{Math.round(user.analytics.activityAnalytics.timeSpentToday / 60)}</div>
          <div className="text-sm text-gray-600">Time Today (min)</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <BarChart3 className="h-8 w-8 text-orange-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-orange-600">{Math.round(user.analytics.activityAnalytics.timeSpentThisWeek / 60)}</div>
          <div className="text-sm text-gray-600">Time This Week (min)</div>
        </div>
      </div>
    </div>

    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h3>
      <div className="space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Activity className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-sm font-medium">Last Active</p>
            <p className="text-xs text-gray-500">{new Date(user.analytics.activityAnalytics.lastActiveAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Clock className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium">Time This Month</p>
            <p className="text-xs text-gray-500">{Math.round(user.analytics.activityAnalytics.timeSpentThisMonth / 60)} minutes</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Workspace Tab
const WorkspaceTab = ({ user }: any) => {
  // Get workspace data from the correct structure
  const socialMedia = user.socialMedia || {};
  const workspaces = socialMedia.workspaces || [];
  const primaryWorkspace = user.workspace || {};
  
  console.log('🔍 WorkspaceTab - user:', user);
  console.log('🔍 WorkspaceTab - workspaces:', workspaces);
  console.log('🔍 WorkspaceTab - primaryWorkspace:', primaryWorkspace);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Workspace Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{workspaces.length}</div>
            <div className="text-sm text-gray-600">Total Workspaces</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {workspaces.reduce((sum: number, ws: any) => sum + (ws.socialAccountsCount || 0), 0)}
            </div>
            <div className="text-sm text-gray-600">Total Social Accounts</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {workspaces.filter((ws: any) => (ws.socialAccountsCount || 0) > 0).length}
            </div>
            <div className="text-sm text-gray-600">Active Workspaces</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {workspaces.reduce((sum: number, ws: any) => sum + (ws.credits || 0), 0)}
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
                <span className="text-lg font-semibold">{primaryWorkspace.name || 'Default Workspace'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Workspace ID</span>
                <span className="text-sm font-medium font-mono bg-gray-100 px-2 py-1 rounded">
                  {primaryWorkspace.id || user.workspaceId || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Theme</span>
                <span className="text-sm font-medium capitalize">{primaryWorkspace.theme || 'light'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">AI Personality</span>
                <span className="text-sm font-medium capitalize">{primaryWorkspace.aiPersonality || 'professional'}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Credits</span>
                <span className="text-lg font-semibold">{primaryWorkspace.credits || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Social Accounts</span>
                <span className="text-sm font-medium">{primaryWorkspace.socialAccountsCount || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Connected Platforms</span>
                <span className="text-sm font-medium">
                  {primaryWorkspace.connectedPlatforms?.join(', ') || 'None'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Max Team Members</span>
                <span className="text-sm font-medium">{primaryWorkspace.maxTeamMembers || 1}</span>
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
              <div key={index} className="border rounded-lg p-6 hover:shadow-md transition-shadow">
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
                    <span className="text-sm font-medium capitalize">{workspace.theme || 'light'}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">AI Personality:</span>
                    <span className="text-sm font-medium capitalize">{workspace.aiPersonality || 'professional'}</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Max Members:</span>
                    <span className="text-sm font-medium">{workspace.maxTeamMembers || 1}</span>
                  </div>
                  
                  <div className="mt-3">
                    <span className="text-sm text-gray-600">Connected Platforms:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {workspace.connectedPlatforms && workspace.connectedPlatforms.length > 0 ? (
                        workspace.connectedPlatforms.map((platform: string, idx: number) => (
                          <span key={idx} className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            {platform}
                          </span>
                        ))
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
                      <div>Created: {workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : 'Unknown'}</div>
                      <div>Updated: {workspace.updatedAt ? new Date(workspace.updatedAt).toLocaleDateString() : 'Unknown'}</div>
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

export default UserDetailPage;
