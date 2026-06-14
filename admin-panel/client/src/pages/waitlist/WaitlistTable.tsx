/**
 * @fileoverview WaitlistTable component.
 *
 * Renders the main data table for the Waitlist Management page.
 * Displays user rows with selection checkboxes, org-type badges, status
 * badges, key metrics, and per-row action buttons.
 *
 * The component is purely presentational: all data-fetching and mutations
 * live in the parent (WaitlistManagement) and are passed down via props.
 *
 * @module WaitlistTable
 */

import React from 'react';
import {
  Eye,
  CheckCircle,
  XCircle,
  Ban,
  RotateCcw,
  Trash,
  Calendar,
  Target,
  Users2,
  Rocket,
  Building2,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { WaitlistUser, ActionType, OrgType } from './types';
import {
  orgTypeConfig,
  statusConfig,
  getOrgType,
  getQuestionnaireData,
  formatFieldValue,
} from './utils';

// ============================================
// PROP TYPES
// ============================================

/** Props accepted by {@link WaitlistTable}. */
export interface WaitlistTableProps {
  /** List of filtered user records to display. */
  users: WaitlistUser[];
  /** Whether the data is still being fetched (shows loading skeleton). */
  isLoading: boolean;

  /** IDs of currently selected rows. */
  selectedUsers: string[];
  /** Whether all visible rows are selected. */
  selectAll: boolean;
  /** Callback to toggle selection of all visible rows. */
  onSelectAll: () => void;
  /** Callback to toggle selection of a single row. */
  onSelectUser: (userId: string) => void;

  /** Callback fired when the "View Details" button is clicked for a row. */
  onViewUser: (user: WaitlistUser) => void;
  /** Callback fired when any per-row action button is clicked. */
  onAction: (type: ActionType, user: WaitlistUser) => void;
}

// ============================================
// INTERNAL BADGE HELPERS
// ============================================

/**
 * Renders a colour-coded status badge for a given status string.
 *
 * @param status - The waitlist user status value.
 */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config = statusConfig[status] ?? statusConfig.waitlisted;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}
    >
      <Icon className="w-3 h-3 mr-1" aria-hidden="true" />
      {status.replace('_', ' ').toUpperCase()}
    </span>
  );
};

/**
 * Renders a colour-coded org-type badge for a given user.
 * Falls back to a muted "Unknown" label when org type cannot be resolved.
 *
 * @param user - The waitlist user record.
 */
const OrgTypeBadge: React.FC<{ user: WaitlistUser }> = ({ user }) => {
  const orgType = getOrgType(user);
  if (!orgType) return <span className="text-gray-400 text-xs">Unknown</span>;

  const config = orgTypeConfig[orgType];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
    >
      <Icon className="w-3 h-3 mr-1" aria-hidden="true" />
      {config.label}
    </span>
  );
};

// ============================================
// KEY METRIC RESOLVER
// ============================================

/**
 * Returns the most relevant metric to display in the "Details" column based
 * on the user's org type.
 *
 * @param user - The waitlist user record.
 * @returns An object with an icon component, a label string, and a value string.
 */
const getKeyMetric = (
  user: WaitlistUser,
): { icon: React.ElementType; label: string; value: string } => {
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
      return {
        icon: ShieldCheck,
        label: 'Industry',
        value: formatFieldValue(q.enterpriseIndustry),
      };
    default:
      return { icon: Target, label: 'Goal', value: formatFieldValue(q.primaryGoal) };
  }
};

// ============================================
// USER ROW
// ============================================

interface UserRowProps {
  user: WaitlistUser;
  isSelected: boolean;
  onSelect: () => void;
  onView: () => void;
  onAction: (type: ActionType) => void;
}

/**
 * A single row in the waitlist table.
 * Extracted as an internal component to keep the table body readable.
 */
const UserRow: React.FC<UserRowProps> = ({ user, isSelected, onSelect, onView, onAction }) => {
  const keyMetric = getKeyMetric(user);
  const q = getQuestionnaireData(user);
  const MetricIcon = keyMetric.icon;

  const canApproveRejectBan = user.status === 'waitlisted';
  const canRestore =
    user.status === 'suspended' ||
    user.status === 'removed' ||
    user.status === 'postponed' ||
    user.status === 'banned' ||
    user.status === 'rejected';

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Checkbox */}
      <td className="px-6 py-4 whitespace-nowrap">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          aria-label={`Select ${user.name}`}
        />
      </td>

      {/* User identity */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10">
            <div
              className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium"
              aria-hidden="true"
            >
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

      {/* Org type */}
      <td className="px-6 py-4 whitespace-nowrap">
        <OrgTypeBadge user={user} />
      </td>

      {/* Status */}
      <td className="px-6 py-4 whitespace-nowrap">
        <StatusBadge status={user.status} />
      </td>

      {/* Key metric + primary goal */}
      <td className="px-6 py-4">
        <div className="text-sm text-gray-900 space-y-1">
          <div className="flex items-center space-x-2">
            <MetricIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
            <span className="text-gray-500">{keyMetric.label}:</span>
            <span className="font-medium">{keyMetric.value}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Target className="h-4 w-4 text-gray-400" aria-hidden="true" />
            <span className="text-gray-500">Goal:</span>
            <span className="font-medium">{formatFieldValue(q.primaryGoal)}</span>
          </div>
        </div>
      </td>

      {/* Joined date */}
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <div className="flex items-center">
          <Calendar className="h-4 w-4 mr-1" aria-hidden="true" />
          {new Date(user.joinedAt || user.createdAt).toLocaleDateString()}
        </div>
      </td>

      {/* Row actions */}
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <div className="flex items-center space-x-1">
          {/* View details */}
          <button
            onClick={onView}
            className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details"
            type="button"
            aria-label={`View details for ${user.name}`}
          >
            <Eye className="h-4 w-4" />
          </button>

          {/* Approve / Reject / Ban — only for waitlisted */}
          {canApproveRejectBan && (
            <>
              <button
                onClick={() => onAction('approve')}
                className="text-green-600 hover:text-green-900 p-1.5 hover:bg-green-50 rounded-lg transition-colors"
                title="Approve"
                type="button"
                aria-label={`Approve ${user.name}`}
              >
                <CheckCircle className="h-4 w-4" />
              </button>
              <button
                onClick={() => onAction('reject')}
                className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                title="Reject"
                type="button"
                aria-label={`Reject ${user.name}`}
              >
                <XCircle className="h-4 w-4" />
              </button>
              <button
                onClick={() => onAction('ban')}
                className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                title="Ban"
                type="button"
                aria-label={`Ban ${user.name}`}
              >
                <Ban className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Restore — for non-active statuses */}
          {canRestore && (
            <button
              onClick={() => onAction('restore')}
              className="text-blue-600 hover:text-blue-900 p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
              title="Restore"
              type="button"
              aria-label={`Restore ${user.name}`}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}

          {/* Delete — always visible */}
          <button
            onClick={() => onAction('delete')}
            className="text-red-600 hover:text-red-900 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
            type="button"
            aria-label={`Delete ${user.name}`}
          >
            <Trash className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ============================================
// TABLE COMPONENT
// ============================================

/**
 * WaitlistTable
 *
 * Displays waitlist users in a sortable, selectable data table.
 * Features:
 * - "Select all" header checkbox
 * - Per-row selection checkboxes (for bulk actions)
 * - Org-type and status badges
 * - Role-aware key metric column
 * - Per-row action buttons (view, approve, reject, ban, restore, delete)
 * - Loading skeleton and empty-state rows
 *
 * @param props - See {@link WaitlistTableProps}.
 */
const WaitlistTable: React.FC<WaitlistTableProps> = ({
  users,
  isLoading,
  selectedUsers,
  selectAll,
  onSelectAll,
  onSelectUser,
  onViewUser,
  onAction,
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200" role="grid">
          {/* ── Column headers ─────────────────────────────────────── */}
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={onSelectAll}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  aria-label="Select all users"
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>

          {/* ── Table body ─────────────────────────────────────────── */}
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              /* Loading state */
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div
                      className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"
                      aria-hidden="true"
                    />
                    <span className="text-gray-500">Loading users…</span>
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              /* Empty state */
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              /* Data rows */
              users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelected={selectedUsers.includes(user.id)}
                  onSelect={() => onSelectUser(user.id)}
                  onView={() => onViewUser(user)}
                  onAction={(type) => onAction(type, user)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WaitlistTable;
