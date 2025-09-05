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
  Zap
} from 'lucide-react';
import { apiClient } from '../../services/api';

interface WaitlistUser {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  referredBy: string;
  referralCount: number;
  credits: number;
  status: 'waitlisted' | 'early_access' | 'rejected' | 'banned' | 'removed';
  discountCode: string;
  discountExpiresAt: string;
  dailyLogins: number;
  feedbackSubmitted: boolean;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
  questionnaire: {
    businessType: string | null;
    teamSize: string | null;
    currentTools: string[];
    primaryGoal: string | null;
    contentTypes: string[];
    budget: string | null;
    urgency: string | null;
  };
  metadata: {
    ipAddress: string | null;
    userAgent: string | null;
    emailVerified: boolean;
    joinedAt: string | null;
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
  };
}

const WaitlistManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<WaitlistUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject' | 'ban';
    user: WaitlistUser | null;
  }>({ type: 'approve', user: null });
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [banReason, setBanReason] = useState('');

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

  // Approve user mutation
  const approveUserMutation = useMutation(
    async ({ userId, notes }: { userId: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/approve`, {
        adminNotes: notes
      });
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

  // Reject user mutation
  const rejectUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/reject`, {
        reason,
        adminNotes: notes
      });
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

  // Ban user mutation
  const banUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/ban`, {
        reason,
        adminNotes: notes
      });
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

  const users = waitlistData?.data?.users || [];
  
  // Filter out any undefined or null users
  const validUsers = users.filter(user => user && user.id);
  const stats: WaitlistStats = statsData?.data || {
    totalUsers: 0,
    todaySignups: 0,
    usersWithQuestionnaire: 0,
    statusBreakdown: { waitlisted: 0, early_access: 0, rejected: 0, banned: 0, removed: 0 }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      waitlisted: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      early_access: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle },
      banned: { color: 'bg-red-100 text-red-800', icon: Ban },
      removed: { color: 'bg-gray-100 text-gray-800', icon: UserX }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.waitlisted;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  const getQuestionnaireValue = (question: string, value: any) => {
    if (!value) return 'Not answered';
    
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : 'Not answered';
    }
    
    return value;
  };

  const handleAction = (type: 'approve' | 'reject' | 'ban', user: WaitlistUser) => {
    setActionModal({ type, user });
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
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleString()}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Today's Signups</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todaySignups}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Target className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">With Questionnaire</p>
              <p className="text-2xl font-bold text-gray-900">{stats.usersWithQuestionnaire}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
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
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by name, email, or referral code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Questionnaire
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {usersLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : validUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No users found
                  </td>
                </tr>
              ) : (
                validUsers.map((user: WaitlistUser) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {user.name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
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
                      {getStatusBadge(user.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center space-x-2">
                          <Briefcase className="h-4 w-4 text-gray-400" />
                          <span>{getQuestionnaireValue('Business Type', user.questionnaire.businessType)}</span>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Target className="h-4 w-4 text-gray-400" />
                          <span>{getQuestionnaireValue('Goal', user.questionnaire.primaryGoal)}</span>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <Zap className="h-4 w-4 text-gray-400" />
                          <span>{getQuestionnaireValue('Urgency', user.questionnaire.urgency)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        {new Date(user.joinedAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowUserModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900 p-1"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {user.status === 'waitlisted' && (
                          <>
                            <button
                              onClick={() => handleAction('approve', user)}
                              className="text-green-600 hover:text-green-900 p-1"
                              title="Approve"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleAction('reject', user)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleAction('ban', user)}
                              className="text-red-600 hover:text-red-900 p-1"
                              title="Ban"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">User Details</h2>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Name</label>
                      <p className="text-sm text-gray-900">{selectedUser.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Email</label>
                      <p className="text-sm text-gray-900">{selectedUser.email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Referral Code</label>
                      <p className="text-sm text-gray-900">{selectedUser.referralCode}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Referred By</label>
                      <p className="text-sm text-gray-900">{selectedUser.referredBy || 'None'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Referral Count</label>
                      <p className="text-sm text-gray-900">{selectedUser.referralCount}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <div className="mt-1">{getStatusBadge(selectedUser.status)}</div>
                    </div>
                  </div>
                </div>

                {/* Questionnaire */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Questionnaire Responses</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Business Type</label>
                      <p className="text-sm text-gray-900">{getQuestionnaireValue('Business Type', selectedUser.questionnaire.businessType)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Team Size</label>
                      <p className="text-sm text-gray-900">{getQuestionnaireValue('Team Size', selectedUser.questionnaire.teamSize)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Current Tools</label>
                      <p className="text-sm text-gray-900">{getQuestionnaireValue('Current Tools', selectedUser.questionnaire.currentTools)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Primary Goal</label>
                      <p className="text-sm text-gray-900">{getQuestionnaireValue('Primary Goal', selectedUser.questionnaire.primaryGoal)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Content Types</label>
                      <p className="text-sm text-gray-900">{getQuestionnaireValue('Content Types', selectedUser.questionnaire.contentTypes)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Budget</label>
                      <p className="text-sm text-gray-900">{getQuestionnaireValue('Budget', selectedUser.questionnaire.budget)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Urgency</label>
                      <p className="text-sm text-gray-900">{getQuestionnaireValue('Urgency', selectedUser.questionnaire.urgency)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-end space-x-3">
                  {selectedUser.status === 'waitlisted' && (
                    <>
                      <button
                        onClick={() => {
                          setShowUserModal(false);
                          handleAction('approve', selectedUser);
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowUserModal(false);
                          handleAction('reject', selectedUser);
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
                      >
                        <XCircle className="h-4 w-4" />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowUserModal(false);
                          handleAction('ban', selectedUser);
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
                      >
                        <Ban className="h-4 w-4" />
                        <span>Ban</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowUserModal(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {actionModal.user && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <AlertTriangle className="h-6 w-6 text-yellow-600 mr-3" />
                <h3 className="text-lg font-semibold text-gray-900">
                  {actionModal.type === 'approve' && 'Approve User'}
                  {actionModal.type === 'reject' && 'Reject User'}
                  {actionModal.type === 'ban' && 'Ban User'}
                </h3>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                {actionModal.type === 'approve' && `Are you sure you want to approve ${actionModal.user?.name || 'this user'} for early access?`}
                {actionModal.type === 'reject' && `Are you sure you want to reject ${actionModal.user?.name || 'this user'}?`}
                {actionModal.type === 'ban' && `Are you sure you want to ban ${actionModal.user?.name || 'this user'}?`}
              </p>

              {actionModal.type === 'reject' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rejection Reason
                  </label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter rejection reason..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              {actionModal.type === 'ban' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ban Reason
                  </label>
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Enter ban reason..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Notes (Optional)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add any notes..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => setActionModal({ type: 'approve', user: null })}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction}
                  disabled={
                    approveUserMutation.isPending || 
                    rejectUserMutation.isPending || 
                    banUserMutation.isPending ||
                    (actionModal.type === 'reject' && !rejectionReason) ||
                    (actionModal.type === 'ban' && !banReason)
                  }
                  className={`px-4 py-2 rounded-lg text-white flex items-center space-x-2 ${
                    actionModal.type === 'approve' 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-red-600 hover:bg-red-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {(approveUserMutation.isPending || rejectUserMutation.isPending || banUserMutation.isPending) && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  <span>
                    {actionModal.type === 'approve' && 'Approve'}
                    {actionModal.type === 'reject' && 'Reject'}
                    {actionModal.type === 'ban' && 'Ban'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitlistManagement;
