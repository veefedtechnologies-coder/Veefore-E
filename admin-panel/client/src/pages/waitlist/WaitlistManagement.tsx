/**
 * @fileoverview WaitlistManagement page – orchestrator component.
 *
 * Responsibilities:
 *  - Fetching waitlist users and statistics via React Query
 *  - Owning all mutation logic (approve, reject, ban, delete, restore, bulk)
 *  - Managing shared UI state (search term, filters, selection, modal visibility)
 *  - Composing {@link WaitlistFilters}, {@link WaitlistTable},
 *    {@link UserDetailsModal}, {@link ActionModal}, and {@link BulkActionModal}
 *
 * All rendering has been delegated to the extracted sub-components; this file
 * contains only data-fetching, state, and coordination logic.
 *
 * @module WaitlistManagement
 * @see WaitlistFilters  – search bar, filter dropdowns, bulk-action bar
 * @see WaitlistTable    – data table with selection and per-row actions
 * @see ApprovalModal    – user details, single-action, and bulk-action modals
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Users,
  TrendingUp,
  Target,
  Clock,
} from 'lucide-react';
import { apiClient } from '../../services/api';

import type { WaitlistUser, WaitlistStats, ActionType } from './types';
import { getOrgType } from './utils';
import WaitlistFilters from './WaitlistFilters';
import WaitlistTable from './WaitlistTable';
import {
  UserDetailsModal,
  ActionModal,
  BulkActionModal,
} from './ApprovalModal';

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * WaitlistManagement
 *
 * Top-level page component for the admin waitlist management interface.
 * Manages all data, mutations, and shared state; delegates presentation to
 * child components.
 */
const WaitlistManagement: React.FC = () => {
  // ── Filter / search state ──────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orgTypeFilter, setOrgTypeFilter] = useState('all');

  // ── Modal state ────────────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<WaitlistUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  /** State for the single-user action confirmation modal. */
  const [actionModal, setActionModal] = useState<{
    type: ActionType;
    user: WaitlistUser | null;
  }>({ type: 'approve', user: null });

  /** State for the bulk-action confirmation modal. */
  const [bulkActionModal, setBulkActionModal] = useState<{
    show: boolean;
    action: string;
  }>({ show: false, action: '' });

  // ── Single-action form state ───────────────────────────────────────────
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

  // ── Bulk-action form state ─────────────────────────────────────────────
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkAdminNotes, setBulkAdminNotes] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bulkAdditionalData, setBulkAdditionalData] = useState<any>({});

  const queryClient = useQueryClient();

  // ── Queries ────────────────────────────────────────────────────────────

  /** Fetches the paginated list of waitlist users matching the current filters. */
  const { data: waitlistData, isLoading: usersLoading } = useQuery(
    ['waitlist-users', searchTerm, statusFilter],
    async () => {
      const response = await apiClient.get('/waitlist/waitlist-users', {
        params: { search: searchTerm, status: statusFilter, limit: 50 },
      });
      return response.data;
    },
  );

  /** Fetches aggregate waitlist statistics (totals, status breakdown). */
  const { data: statsData } = useQuery(['waitlist-stats'], async () => {
    const response = await apiClient.get('/waitlist/waitlist-stats');
    return response.data;
  });

  // ── Mutations ──────────────────────────────────────────────────────────

  const approveUserMutation = useMutation(
    async ({ userId, notes }: { userId: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/approve`, {
        adminNotes: notes,
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setActionModal({ type: 'approve', user: null });
        setAdminNotes('');
      },
    },
  );

  const rejectUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/reject`, {
        reason,
        adminNotes: notes,
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
      },
    },
  );

  const banUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/ban`, {
        reason,
        adminNotes: notes,
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
      },
    },
  );

  const deleteUserMutation = useMutation(
    async ({ userId, reason, notes }: { userId: string; reason: string; notes: string }) => {
      const response = await apiClient.delete(`/waitlist/waitlist-users/${userId}`, {
        data: { reason, adminNotes: notes },
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
      },
    },
  );

  const restoreUserMutation = useMutation(
    async ({
      userId,
      newStatus,
      notes,
    }: {
      userId: string;
      newStatus: string;
      notes: string;
    }) => {
      const response = await apiClient.post(`/waitlist/waitlist-users/${userId}/restore`, {
        newStatus,
        adminNotes: notes,
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['waitlist-users']);
        queryClient.invalidateQueries(['waitlist-stats']);
        setActionModal({ type: 'restore', user: null });
        setRestoreStatus('waitlisted');
        setAdminNotes('');
      },
    },
  );

  const bulkActionMutation = useMutation(
    async ({
      userIds,
      action,
      reason,
      notes,
      additionalData,
    }: {
      userIds: string[];
      action: string;
      reason: string;
      notes: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      additionalData?: any;
    }) => {
      const response = await apiClient.post('/waitlist/waitlist-users/bulk-action', {
        userIds,
        action,
        reason,
        adminNotes: notes,
        additionalData,
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
      },
    },
  );

  // ── Derived data ───────────────────────────────────────────────────────

  const allUsers: WaitlistUser[] = waitlistData?.data?.users ?? [];

  /**
   * Users after applying the client-side org-type filter.
   * The status and text-search filters are applied server-side via query params.
   */
  const validUsers = allUsers.filter((user) => {
    if (!user?.id) return false;
    if (orgTypeFilter !== 'all') {
      return getOrgType(user) === orgTypeFilter;
    }
    return true;
  });

  const stats: WaitlistStats = statsData?.data ?? {
    totalUsers: 0,
    todaySignups: 0,
    usersWithQuestionnaire: 0,
    statusBreakdown: {
      waitlisted: 0,
      early_access: 0,
      rejected: 0,
      banned: 0,
      removed: 0,
      suspended: 0,
      postponed: 0,
    },
  };

  // ── Handlers ───────────────────────────────────────────────────────────

  /** Toggles "select all" checkbox; clears selection when already all-selected. */
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers([]);
      setSelectAll(false);
    } else {
      setSelectedUsers(validUsers.map((u) => u.id));
      setSelectAll(true);
    }
  };

  /** Toggles selection for a single user row. */
  const handleSelectUser = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      const next = selectedUsers.filter((id) => id !== userId);
      setSelectedUsers(next);
      setSelectAll(false);
    } else {
      const next = [...selectedUsers, userId];
      setSelectedUsers(next);
      setSelectAll(next.length === validUsers.length);
    }
  };

  /** Opens the single-action modal for the given user and action type. */
  const handleAction = (type: ActionType, user: WaitlistUser) => {
    setActionModal({ type, user });
  };

  /** Opens the bulk-action modal if at least one user is selected. */
  const handleBulkAction = (action: string) => {
    if (selectedUsers.length === 0) return;
    setBulkActionModal({ show: true, action });
  };

  /** Dispatches the appropriate mutation when the action modal is confirmed. */
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
        restoreUserMutation.mutate({
          userId: user.id,
          newStatus: restoreStatus,
          notes: adminNotes,
        });
        break;
    }
  };

  /** Dispatches the bulk mutation when the bulk-action modal is confirmed. */
  const confirmBulkAction = () => {
    if (selectedUsers.length === 0) return;
    bulkActionMutation.mutate({
      userIds: selectedUsers,
      action: bulkActionModal.action,
      reason: bulkReason,
      notes: bulkAdminNotes,
      additionalData: bulkAdditionalData,
    });
  };

  /** Whether any mutation is currently in flight. */
  const isAnyMutationLoading =
    approveUserMutation.isLoading ||
    rejectUserMutation.isLoading ||
    banUserMutation.isLoading ||
    deleteUserMutation.isLoading ||
    restoreUserMutation.isLoading;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Waitlist Management</h1>
          <p className="text-gray-600">Manage waitlist users and approve early access</p>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleString()}
        </div>
      </div>

      {/* ── Stats cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Users className="h-6 w-6 text-blue-600" />}
          iconBg="bg-blue-100"
          label="Total Users"
          value={stats.totalUsers}
        />
        <StatCard
          icon={<TrendingUp className="h-6 w-6 text-green-600" />}
          iconBg="bg-green-100"
          label="Today's Signups"
          value={stats.todaySignups}
        />
        <StatCard
          icon={<Target className="h-6 w-6 text-purple-600" />}
          iconBg="bg-purple-100"
          label="With Questionnaire"
          value={stats.usersWithQuestionnaire}
        />
        <StatCard
          icon={<Clock className="h-6 w-6 text-yellow-600" />}
          iconBg="bg-yellow-100"
          label="Pending Review"
          value={stats.statusBreakdown.waitlisted}
        />
      </div>

      {/* ── Filters + bulk actions bar ──────────────────────────────── */}
      <WaitlistFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        orgTypeFilter={orgTypeFilter}
        onOrgTypeFilterChange={setOrgTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        selectedUsers={selectedUsers}
        onClearSelection={() => { setSelectedUsers([]); setSelectAll(false); }}
        onBulkAction={handleBulkAction}
      />

      {/* ── Data table ──────────────────────────────────────────────── */}
      <WaitlistTable
        users={validUsers}
        isLoading={usersLoading}
        selectedUsers={selectedUsers}
        selectAll={selectAll}
        onSelectAll={handleSelectAll}
        onSelectUser={handleSelectUser}
        onViewUser={(user) => { setSelectedUser(user); setShowUserModal(true); }}
        onAction={handleAction}
      />

      {/* ── User details modal ──────────────────────────────────────── */}
      {showUserModal && selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={() => setShowUserModal(false)}
          onAction={handleAction}
        />
      )}

      {/* ── Single-user action confirmation modal ───────────────────── */}
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
          isLoading={isAnyMutationLoading}
        />
      )}

      {/* ── Bulk action confirmation modal ──────────────────────────── */}
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
// STAT CARD (internal helper)
// ============================================

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: number;
}

/**
 * A single statistics card shown in the header grid.
 *
 * @param icon   - Icon element to display.
 * @param iconBg - Tailwind background colour class for the icon container.
 * @param label  - Human-readable metric name.
 * @param value  - Numeric metric value.
 */
const StatCard: React.FC<StatCardProps> = ({ icon, iconBg, label, value }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
    <div className="flex items-center">
      <div className={`p-3 ${iconBg} rounded-xl`} aria-hidden="true">
        {icon}
      </div>
      <div className="ml-4">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  </div>
);

export default WaitlistManagement;
