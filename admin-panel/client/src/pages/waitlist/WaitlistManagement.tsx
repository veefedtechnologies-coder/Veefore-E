import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Users,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Ban,
  Eye,
  Mail,
  Calendar,
  TrendingUp,
  UserCheck,
  UserX,
  AlertTriangle,
  Clock,
  Target,
  Briefcase,
  DollarSign,
  Zap,
  Trash2,
  Pause,
  RotateCcw,
  CalendarX,
  Trash,
  CheckSquare,
  Square,
  ChevronDown,
  User,
  Building2,
  Users2,
  Globe,
  Layers,
  MessageSquare,
  BarChart3,
  Rocket,
  ShieldCheck,
  X
} from 'lucide-react';
import { apiClient } from '../../services/api';

// ============================================
// TYPES - New Role-Based Structure
// ============================================

type OrgType = 'solo' | 'startup' | 'agency' | 'enterprise';

interface RoleBasedQuestionnaire {
  // Common fields
  orgType?: OrgType;
  timeline?: string;
  referralSource?: string;
  primaryGoal?: string;
  painPoints?: string;

  // Creator/Solo fields
  primaryPlatform?: string;
  contentNiche?: string;
  creatorAudienceSize?: string;
  postingFrequency?: string;

  // Startup/Brand fields
  startupStage?: string;
  startupGrowthChannel?: string;
  startupTeamSize?: string;

  // Agency fields
  agencyClientCount?: string;
  agencyServices?: string;
  agencyNiche?: string;
  agencyMonthlyOutput?: string;

  // Enterprise fields
  enterpriseIndustry?: string;
  enterpriseDepartment?: string;
  enterpriseSecurity?: string;
  enterpriseBudget?: string;

  // Legacy fields (for backward compatibility)
  businessType?: string;
  teamSize?: string;
  currentTools?: string[];
  contentTypes?: string[];
  budget?: string;
  urgency?: string;
  role?: string;
}

interface WaitlistUser {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  referredBy: string;
  referralCount: number;
  credits: number;
  status: 'waitlisted' | 'early_access' | 'rejected' | 'banned' | 'removed' | 'suspended' | 'postponed';
  discountCode: string;
  discountExpiresAt: string;
  dailyLogins: number;
  feedbackSubmitted: boolean;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  questionnaire?: RoleBasedQuestionnaire;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    emailVerified?: boolean;
    joinedAt?: string;
    role?: string;
    questionnaire?: RoleBasedQuestionnaire;
    source?: string;
    ip?: string;
  };
}

interface WaitlistStats {
  totalUsers: number;
  todaySignups: number;
  usersWithQuestionnaire: number;
  statusBreakdown: {
    waitlisted: number;
    early_access: number;
    rejected: number;
    banned: number;
    removed: number;
    suspended: number;
    postponed: number;
  };
}

// ============================================
// ORG TYPE CONFIGURATION
// ============================================

const orgTypeConfig: Record<OrgType, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  solo: { label: 'Creator', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: User },
  startup: { label: 'Brand', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Rocket },
  agency: { label: 'Agency', color: 'text-green-700', bgColor: 'bg-green-100', icon: Building2 },
  enterprise: { label: 'Enterprise', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: ShieldCheck }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const getOrgType = (user: WaitlistUser): OrgType | null => {
  // Check direct questionnaire.orgType
  if (user.questionnaire?.orgType) return user.questionnaire.orgType;
  // Check metadata.questionnaire.orgType (where new frontend stores it)
  if (user.metadata?.questionnaire?.orgType) return user.metadata.questionnaire.orgType;
  // Check metadata.role (this is set by frontend as role: formData.orgType)
  if (user.metadata?.role) {
    const roleMap: Record<string, OrgType> = {
      'creator': 'solo', 'solo': 'solo',
      'brand': 'startup', 'startup': 'startup',
      'agency': 'agency',
      'enterprise': 'enterprise'
    };
    return roleMap[user.metadata.role.toLowerCase()] || null;
  }
  // Check questionnaire.role (alternative location)
  if (user.questionnaire?.role) {
    const roleMap: Record<string, OrgType> = {
      'creator': 'solo', 'solo': 'solo',
      'brand': 'startup', 'startup': 'startup',
      'agency': 'agency',
      'enterprise': 'enterprise'
    };
    return roleMap[user.questionnaire.role.toLowerCase()] || null;
  }
  return null;
};

const getQuestionnaireData = (user: WaitlistUser): RoleBasedQuestionnaire => {
  // Merge questionnaire from multiple sources, prioritizing nested questionnaire
  const nested = user.metadata?.questionnaire || {};
  const direct = user.questionnaire || {};

  return {
    ...direct,
    ...nested,
    // Ensure orgType is set
    orgType: nested.orgType || direct.orgType || (user.metadata?.role as OrgType) || undefined,
    role: user.metadata?.role
  };
};

const formatFieldValue = (value: any): string => {
  if (!value) return 'Not answered';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Not answered';
  return String(value);
};

// ============================================
// MAIN COMPONENT
// ============================================

const WaitlistManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orgTypeFilter, setOrgTypeFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<WaitlistUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject' | 'ban' | 'remove' | 'suspend' | 'postpone' | 'restore' | 'delete';
    user: WaitlistUser | null;
  }>({ type: 'approve', user: null });
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendUntil, setSuspendUntil] = useState('');
  const [postponeReason, setPostponeReason] = useState('');
  const [postponeUntil, setPostponeUntil] = useState('');
  const [restoreStatus, setRestoreStatus] = useState('waitlisted');
  const [deleteReason, setDeleteReason] = useState('');

  // Bulk selection state
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [bulkActionModal, setBulkActionModal] = useState<{
    show: boolean;
    action: string;
  }>({ show: false, action: '' });
  const [bulkReason, setBulkReason] = useState('');
  const [bulkAdminNotes, setBulkAdminNotes] = useState('');
  const [bulkAdditionalData, setBulkAdditionalData] = useState<any>({});

  const queryClient = useQueryClient();

  // Fetch waitlist users
  const { data: waitlistData, isLoading: usersLoading } = useQuery(
    ['waitlist-users', searchTerm, statusFilter],
    async () => {
      const response = await apiClient.get('/waitlist/waitlist-users', {
        params: { search: searchTerm, status: statusFilter, limit: 50 }
      });
      return response.data;
    }
  );

  // Fetch waitlist stats
  const { data: statsData } = useQuery(
    ['waitlist-stats'],
    async () => {
      const response = await apiClient.get('/waitlist/waitlist-stats');
      return response.data;
    }
  );

  // Mutations
  const approveUserMutation = useMutation(
    async ({ userId, notes }: { userId: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/approve`, { adminNotes: notes });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setActionModal({ type: 'approve', user: null });
        setAdminNotes('');
      }
    }
  );

  const rejectUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/reject`, { reason, adminNotes: notes });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setActionModal({ type: 'reject', user: null });
        setRejectionReason('');
        setAdminNotes('');
      }
    }
  );

  const banUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/ban`, { reason, adminNotes: notes });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setActionModal({ type: 'ban', user: null });
        setBanReason('');
        setAdminNotes('');
      }
    }
  );

  const deleteUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.delete(`/waitlist/waitlist-users/${userId}`, {
        data: { reason, adminNotes: notes }
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setActionModal({ type: 'delete', user: null });
        setDeleteReason('');
        setAdminNotes('');
      }
    }
  );

  const restoreUserMutation = useMutation(
    async ({ userId, newStatus, notes }: { userId: string; newStatus: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/restore`, { newStatus, adminNotes: notes });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setActionModal({ type: 'restore', user: null });
        setRestoreStatus('waitlisted');
        setAdminNotes('');
      }
    }
  );

  const bulkActionMutation = useMutation(
    async ({ userIds, action, reason, notes, additionalData }: {
      userIds: string[]; action: string; reason: string; notes: string; additionalData?: any
    }) => {
      const response = await apiClient.post('/waitlist/waitlist-users/bulk-action', {
        userIds, action, reason, adminNotes: notes, additionalData
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setBulkActionModal({ show: false, action: '' });
        setBulkReason('');
        setBulkAdminNotes('');
        setBulkAdditionalData({});
        setSelectedUsers([]);
        setSelectAll(false);
      }
    }
  );

  // Filter users
  const allUsers = waitlistData?.data?.users || [];
  const validUsers = allUsers.filter((user: WaitlistUser) => {
    if (!user || !user.id) return false;
    if (orgTypeFilter !== 'all') {
      const userOrgType = getOrgType(user);
      if (userOrgType !== orgTypeFilter) return false;
    }
    return true;
  });

  const stats: WaitlistStats = statsData?.data || {
    totalUsers: 0, todaySignups: 0, usersWithQuestionnaire: 0,
    statusBreakdown: { waitlisted: 0, early_access: 0, rejected: 0, banned: 0, removed: 0, suspended: 0, postponed: 0 }
  };

  // Status badge component
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
      waitlisted: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      early_access: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle },
      banned: { color: 'bg-red-100 text-red-800', icon: Ban },
      removed: { color: 'bg-gray-100 text-gray-800', icon: UserX },
      suspended: { color: 'bg-orange-100 text-orange-800', icon: Pause },
      postponed: { color: 'bg-purple-100 text-purple-800', icon: CalendarX }
    };

    const config = statusConfig[status] || statusConfig.waitlisted;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  // Org type badge component
  const getOrgTypeBadge = (user: WaitlistUser) => {
    const orgType = getOrgType(user);
    if (!orgType) return <span className="text-gray-400 text-xs">Unknown</span>;

    const config = orgTypeConfig[orgType];
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  // Handlers
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers([]);
      setSelectAll(false);
    } else {
      setSelectedUsers(validUsers.map((user: WaitlistUser) => user.id));
      setSelectAll(true);
    }
  };

  const handleSelectUser = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
      setSelectAll(false);
    } else {
      const newSelected = [...selectedUsers, userId];
      setSelectedUsers(newSelected);
      setSelectAll(newSelected.length === validUsers.length);
    }
  };

  const handleAction = (type: typeof actionModal.type, user: WaitlistUser) => {
    setActionModal({ type, user });
  };

  const handleBulkAction = (action: string) => {
    if (selectedUsers.length === 0) return;
    setBulkActionModal({ show: true, action });
  };

  const confirmAction = () => {
    if (!actionModal.user) return;
    const { user, type } = actionModal;

    switch (type) {
      case 'approve':
        approveUserMutation.mutate({ userId: user.id, notes: adminNotes });
        break;
      case 'reject':
        rejectUserMutation.mutate({ userId: user.id, reason: rejectionReason, notes: adminNotes });
        break;
      case 'ban':
        banUserMutation.mutate({ userId: user.id, reason: banReason, notes: adminNotes });
        break;
      case 'delete':
        deleteUserMutation.mutate({ userId: user.id, reason: deleteReason, notes: adminNotes });
        break;
      case 'restore':
        restoreUserMutation.mutate({ userId: user.id, newStatus: restoreStatus, notes: adminNotes });
        break;
    }
  };

  const confirmBulkAction = () => {
    if (selectedUsers.length === 0) return;
    bulkActionMutation.mutate({
      userIds: selectedUsers,
      action: bulkActionModal.action,
      reason: bulkReason,
      notes: bulkAdminNotes,
      additionalData: bulkAdditionalData
    });
  };

  // Get key metrics for table display based on org type
  const getKeyMetric = (user: WaitlistUser): { icon: React.ElementType; label: string; value: string } => {
    const q = getQuestionnaireData(user);
    const orgType = getOrgType(user);

    switch (orgType) {
      case 'solo':
        return { icon: Users2, label: 'Audience', value: formatFieldValue(q.creatorAudienceSize) };
      case 'startup':
        return { icon: Rocket, label: 'Stage', value: formatFieldValue(q.startupStage) };
      case 'agency':
        return { icon: Building2, label: 'Clients', value: formatFieldValue(q.agencyClientCount) };
      case 'enterprise':
        return { icon: ShieldCheck, label: 'Industry', value: formatFieldValue(q.enterpriseIndustry) };
      default:
        return { icon: Target, label: 'Goal', value: formatFieldValue(q.primaryGoal) };
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Waitlist Management</h1>
          <p className="text-gray-600">Manage waitlist users and approve early access</p>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleString()}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-xl">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Today's Signups</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todaySignups}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Target className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">With Questionnaire</p>
              <p className="text-2xl font-bold text-gray-900">{stats.usersWithQuestionnaire}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 rounded-xl">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending Review</p>
              <p className="text-2xl font-bold text-gray-900">{stats.statusBreakdown.waitlisted}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by name, email, or referral code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-40">
            <select
              value={orgTypeFilter}
              onChange={(e) => setOrgTypeFilter(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="solo">Creator</option>
              <option value="startup">Brand</option>
              <option value="agency">Agency</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className="sm:w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="early_access">Early Access</option>
              <option value="rejected">Rejected</option>
              <option value="banned">Banned</option>
              <option value="removed">Removed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedUsers.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-blue-900">
                {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => { setSelectedUsers([]); setSelectAll(false); }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value=""
                onChange={(e) => { if (e.target.value) { handleBulkAction(e.target.value); e.target.value = ''; } }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Bulk Actions</option>
                <option value="approve">Approve Selected</option>
                <option value="reject">Reject Selected</option>
                <option value="ban">Ban Selected</option>
                <option value="delete">Delete Selected</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {usersLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                      <span className="text-gray-500">Loading users...</span>
                    </div>
                  </td>
                </tr>
              ) : validUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                validUsers.map((user: WaitlistUser) => {
                  const keyMetric = getKeyMetric(user);
                  const q = getQuestionnaireData(user);
                  const MetricIcon = keyMetric.icon;

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => handleSelectUser(user.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                              {user.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{user.name || 'Unknown'}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                            <div className="text-xs text-gray-400">Ref: {user.referralCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getOrgTypeBadge(user)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(user.status)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 space-y-1">
                          <div className="flex items-center space-x-2">
                            <MetricIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-500">{keyMetric.label}:</span>
                            <span className="font-medium">{keyMetric.value}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Target className="h-4 w-4 text-gray-400" />
                            <span className="text-gray-500">Goal:</span>
                            <span className="font-medium">{formatFieldValue(q.primaryGoal)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          {new Date(user.joinedAt || user.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => { setSelectedUser(user); setShowUserModal(true); }}
                            className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {user.status === 'waitlisted' && (
                            <>
                              <button onClick={() => handleAction('approve', user)} className="text-green-600 hover:text-green-900 p-1.5 hover:bg-green-50 rounded-lg transition-colors" title="Approve">
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleAction('reject', user)} className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Reject">
                                <XCircle className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleAction('ban', user)} className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Ban">
                                <Ban className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {(user.status === 'suspended' || user.status === 'removed' || user.status === 'postponed' || user.status === 'banned' || user.status === 'rejected') && (
                            <button onClick={() => handleAction('restore', user)} className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded-lg transition-colors" title="Restore">
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => handleAction('delete', user)} className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                            <Trash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={() => setShowUserModal(false)}
          onAction={handleAction}
        />
      )}

      {/* Action Confirmation Modal */}
      {actionModal.user && (
        <ActionModal
          type={actionModal.type}
          user={actionModal.user}
          onClose={() => setActionModal({ type: 'approve', user: null })}
          onConfirm={confirmAction}
          adminNotes={adminNotes}
          setAdminNotes={setAdminNotes}
          rejectionReason={rejectionReason}
          setRejectionReason={setRejectionReason}
          banReason={banReason}
          setBanReason={setBanReason}
          deleteReason={deleteReason}
          setDeleteReason={setDeleteReason}
          restoreStatus={restoreStatus}
          setRestoreStatus={setRestoreStatus}
          isLoading={approveUserMutation.isLoading || rejectUserMutation.isLoading || banUserMutation.isLoading || deleteUserMutation.isLoading || restoreUserMutation.isLoading}
        />
      )}

      {/* Bulk Action Modal */}
      {bulkActionModal.show && (
        <BulkActionModal
          action={bulkActionModal.action}
          selectedCount={selectedUsers.length}
          onClose={() => setBulkActionModal({ show: false, action: '' })}
          onConfirm={confirmBulkAction}
          reason={bulkReason}
          setReason={setBulkReason}
          notes={bulkAdminNotes}
          setNotes={setBulkAdminNotes}
          isLoading={bulkActionMutation.isLoading}
        />
      )}
    </div>
  );
};

// ============================================
// USER DETAILS MODAL COMPONENT
// ============================================

interface UserDetailsModalProps {
  user: WaitlistUser;
  onClose: () => void;
  onAction: (type: 'approve' | 'reject' | 'ban' | 'delete' | 'restore', user: WaitlistUser) => void;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({ user, onClose, onAction }) => {
  const orgType = getOrgType(user);
  const q = getQuestionnaireData(user);

  // Role-specific fields configuration
  const roleFields: Record<OrgType, { label: string; fields: { key: keyof RoleBasedQuestionnaire; label: string; icon: React.ElementType }[] }> = {
    solo: {
      label: 'Creator Profile',
      fields: [
        { key: 'primaryPlatform', label: 'Primary Platform', icon: Globe },
        { key: 'contentNiche', label: 'Content Niche', icon: Layers },
        { key: 'creatorAudienceSize', label: 'Audience Size', icon: Users2 },
        { key: 'postingFrequency', label: 'Posting Frequency', icon: Calendar }
      ]
    },
    startup: {
      label: 'Brand Profile',
      fields: [
        { key: 'startupStage', label: 'Company Stage', icon: Rocket },
        { key: 'startupGrowthChannel', label: 'Growth Channel', icon: TrendingUp },
        { key: 'startupTeamSize', label: 'Team Size', icon: Users2 }
      ]
    },
    agency: {
      label: 'Agency Profile',
      fields: [
        { key: 'agencyClientCount', label: 'Client Count', icon: Building2 },
        { key: 'agencyServices', label: 'Services Offered', icon: Layers },
        { key: 'agencyNiche', label: 'Agency Niche', icon: Target },
        { key: 'agencyMonthlyOutput', label: 'Monthly Output', icon: BarChart3 }
      ]
    },
    enterprise: {
      label: 'Enterprise Profile',
      fields: [
        { key: 'enterpriseIndustry', label: 'Industry', icon: Building2 },
        { key: 'enterpriseDepartment', label: 'Department', icon: Briefcase },
        { key: 'enterpriseSecurity', label: 'Security Requirements', icon: ShieldCheck },
        { key: 'enterpriseBudget', label: 'Budget Range', icon: DollarSign }
      ]
    }
  };

  const currentRoleFields = orgType ? roleFields[orgType] : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">
                {user.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <h2 className="text-xl font-bold">{user.name}</h2>
                <p className="text-white/80">{user.email}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Basic Information */}
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <User className="h-5 w-5 mr-2 text-blue-600" />
                Basic Information
              </h3>
              <div className="space-y-3">
                <InfoRow label="Referral Code" value={user.referralCode} />
                <InfoRow label="Referred By" value={user.referredBy || 'None'} />
                <InfoRow label="Referral Count" value={String(user.referralCount || 0)} />
                <InfoRow label="Credits" value={String(user.credits || 0)} />
                <InfoRow label="Status" value={user.status.replace('_', ' ').toUpperCase()} />
                <InfoRow label="Joined" value={new Date(user.joinedAt || user.createdAt).toLocaleDateString()} />
              </div>
            </div>

            {/* Organization Profile (Role-Based) */}
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                {orgType && <span className={`mr-2 ${orgTypeConfig[orgType].color}`}>{React.createElement(orgTypeConfig[orgType].icon, { className: 'h-5 w-5' })}</span>}
                {currentRoleFields?.label || 'Organization Profile'}
              </h3>

              {orgType && (
                <div className="mb-3">
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${orgTypeConfig[orgType].bgColor} ${orgTypeConfig[orgType].color}`}>
                    {React.createElement(orgTypeConfig[orgType].icon, { className: 'h-4 w-4 mr-1.5' })}
                    {orgTypeConfig[orgType].label}
                  </span>
                </div>
              )}

              <div className="space-y-3">
                {currentRoleFields?.fields.map(field => (
                  <InfoRow
                    key={field.key}
                    label={field.label}
                    value={formatFieldValue(q[field.key])}
                    icon={field.icon}
                  />
                ))}
                {!currentRoleFields && (
                  <p className="text-gray-500 text-sm italic">No profile type selected</p>
                )}
              </div>
            </div>

            {/* Goals & Intentions - Step 4 Common Questions */}
            <div className="bg-gray-50 rounded-xl p-5 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Target className="h-5 w-5 mr-2 text-purple-600" />
                Goals & Context
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoRow label="How did you find us?" value={formatFieldValue(q.referralSource)} icon={Search} />
                <InfoRow label="Primary Goal" value={formatFieldValue(q.primaryGoal)} icon={Target} />
                {/* Show Timeline only for Startups */}
                {(getOrgType(user) === 'startup') && (
                  <InfoRow label="Timeline" value={formatFieldValue(q.timeline)} icon={Clock} />
                )}
              </div>
              {/* Biggest Challenge - always show */}
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-500 flex items-center">
                  <MessageSquare className="h-4 w-4 mr-1.5 text-gray-400" />
                  Biggest Challenge
                </label>
                <p className="mt-1 text-gray-900 bg-white rounded-lg p-3 border">
                  {q.painPoints || <span className="text-gray-400 italic">Not answered</span>}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between">
          <div className="text-sm text-gray-500">
            User ID: {user.id}
          </div>
          <div className="flex items-center space-x-3">
            {user.status === 'waitlisted' && (
              <>
                <button onClick={() => { onClose(); onAction('approve', user); }} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center">
                  <CheckCircle className="h-4 w-4 mr-2" /> Approve
                </button>
                <button onClick={() => { onClose(); onAction('reject', user); }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center">
                  <XCircle className="h-4 w-4 mr-2" /> Reject
                </button>
              </>
            )}
            {(user.status === 'banned' || user.status === 'rejected' || user.status === 'removed') && (
              <button onClick={() => { onClose(); onAction('restore', user); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div >
  );
};

// Info Row Component
const InfoRow: React.FC<{ label: string; value: string; icon?: React.ElementType }> = ({ label, value, icon: Icon }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-500 flex items-center">
      {Icon && <Icon className="h-4 w-4 mr-1.5 text-gray-400" />}
      {label}
    </span>
    <span className="text-sm font-medium text-gray-900">{value}</span>
  </div>
);

// ============================================
// ACTION MODAL COMPONENT
// ============================================

interface ActionModalProps {
  type: string;
  user: WaitlistUser;
  onClose: () => void;
  onConfirm: () => void;
  adminNotes: string;
  setAdminNotes: (v: string) => void;
  rejectionReason: string;
  setRejectionReason: (v: string) => void;
  banReason: string;
  setBanReason: (v: string) => void;
  deleteReason: string;
  setDeleteReason: (v: string) => void;
  restoreStatus: string;
  setRestoreStatus: (v: string) => void;
  isLoading: boolean;
}

const ActionModal: React.FC<ActionModalProps> = ({
  type, user, onClose, onConfirm, adminNotes, setAdminNotes,
  rejectionReason, setRejectionReason, banReason, setBanReason,
  deleteReason, setDeleteReason, restoreStatus, setRestoreStatus, isLoading
}) => {
  const configs: Record<string, { title: string; color: string; icon: React.ElementType }> = {
    approve: { title: 'Approve User', color: 'bg-green-600 hover:bg-green-700', icon: CheckCircle },
    reject: { title: 'Reject User', color: 'bg-red-600 hover:bg-red-700', icon: XCircle },
    ban: { title: 'Ban User', color: 'bg-red-600 hover:bg-red-700', icon: Ban },
    delete: { title: 'Delete User', color: 'bg-red-600 hover:bg-red-700', icon: Trash },
    restore: { title: 'Restore User', color: 'bg-blue-600 hover:bg-blue-700', icon: RotateCcw }
  };

  const config = configs[type] || configs.approve;
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Icon className="h-6 w-6 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
          </div>
          <p className="text-gray-600 mb-4">
            You are about to {type} <span className="font-medium">{user.name}</span> ({user.email}).
          </p>

          {type === 'reject' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
              <input type="text" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for rejection"
              />
            </div>
          )}

          {type === 'ban' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ban Reason</label>
              <input type="text" value={banReason} onChange={(e) => setBanReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for ban"
              />
            </div>
          )}

          {type === 'delete' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Delete Reason</label>
              <input type="text" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for deletion"
              />
            </div>
          )}

          {type === 'restore' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Restore To Status</label>
              <select value={restoreStatus} onChange={(e) => setRestoreStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="waitlisted">Waitlisted</option>
                <option value="early_access">Early Access</option>
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes (Optional)</label>
            <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3} placeholder="Add internal notes..."
            />
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isLoading}
            className={`px-4 py-2 text-white rounded-lg ${config.color} disabled:opacity-50 flex items-center`}
          >
            {isLoading ? 'Processing...' : config.title}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// BULK ACTION MODAL COMPONENT
// ============================================

interface BulkActionModalProps {
  action: string;
  selectedCount: number;
  onClose: () => void;
  onConfirm: () => void;
  reason: string;
  setReason: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  isLoading: boolean;
}

const BulkActionModal: React.FC<BulkActionModalProps> = ({
  action, selectedCount, onClose, onConfirm, reason, setReason, notes, setNotes, isLoading
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Bulk {action.charAt(0).toUpperCase() + action.slice(1)}</h3>
          <p className="text-gray-600 mb-4">
            This will {action} <span className="font-medium">{selectedCount}</span> selected user{selectedCount !== 1 ? 's' : ''}.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder={`Reason for bulk ${action}`}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3} placeholder="Internal notes..."
            />
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isLoading}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : `${action.charAt(0).toUpperCase() + action.slice(1)} All`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WaitlistManagement;
