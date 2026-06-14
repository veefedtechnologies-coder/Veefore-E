/**
 * @fileoverview ApprovalModal components for the Waitlist Management page.
 *
 * Exports three modal components:
 *  - {@link UserDetailsModal} – full user profile sheet with quick actions
 *  - {@link ActionModal} – confirmation dialog for a single-user action
 *  - {@link BulkActionModal} – confirmation dialog for a bulk action
 *
 * All modals are purely presentational; mutations are owned by the parent
 * WaitlistManagement component and passed in via callbacks.
 *
 * @module ApprovalModal
 */

import React from 'react';
import {
  X,
  User,
  Target,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Ban,
  RotateCcw,
  Trash,
  TrendingUp,
  Calendar,
  MessageSquare,
  Users2,
  Rocket,
  Building2,
  ShieldCheck,
  Layers,
  Globe,
  BarChart3,
  Briefcase,
  DollarSign,
} from 'lucide-react';
import type { WaitlistUser, OrgType, RoleBasedQuestionnaire, ActionType } from './types';
import { orgTypeConfig, getOrgType, getQuestionnaireData, formatFieldValue } from './utils';

// ============================================
// SHARED INTERNAL HELPERS
// ============================================

/**
 * A simple label/value pair row used inside the user details modal.
 *
 * @param label - The field label.
 * @param value - The field value as a string.
 * @param icon  - Optional Lucide icon component rendered before the label.
 */
const InfoRow: React.FC<{
  label: string;
  value: string;
  icon?: React.ElementType;
}> = ({ label, value, icon: Icon }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-500 flex items-center">
      {Icon && <Icon className="h-4 w-4 mr-1.5 text-gray-400" aria-hidden="true" />}
      {label}
    </span>
    <span className="text-sm font-medium text-gray-900">{value}</span>
  </div>
);

// ============================================
// USER DETAILS MODAL
// ============================================

/** Props accepted by {@link UserDetailsModal}. */
export interface UserDetailsModalProps {
  /** The user whose full profile should be displayed. */
  user: WaitlistUser;
  /** Callback fired when the modal should be closed. */
  onClose: () => void;
  /**
   * Callback fired when a quick-action button (Approve / Reject / Restore)
   * is clicked inside the modal footer.
   */
  onAction: (type: ActionType, user: WaitlistUser) => void;
}

/**
 * UserDetailsModal
 *
 * A full-screen overlay modal that shows a waitlist user's complete profile:
 * - Basic information (referral code, credits, status, join date)
 * - Role-based organisation profile (fields differ by org type)
 * - Goals & context section (referral source, primary goal, pain points)
 * - Footer quick-action buttons appropriate for the user's current status
 *
 * @param props - See {@link UserDetailsModalProps}.
 */
export const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  user,
  onClose,
  onAction,
}) => {
  const orgType = getOrgType(user);
  const q = getQuestionnaireData(user);

  /** Defines the role-specific fields to display in the "Organisation Profile" card. */
  const roleFields: Record<
    OrgType,
    {
      label: string;
      fields: { key: keyof RoleBasedQuestionnaire; label: string; icon: React.ElementType }[];
    }
  > = {
    solo: {
      label: 'Creator Profile',
      fields: [
        { key: 'primaryPlatform', label: 'Primary Platform', icon: Globe },
        { key: 'contentNiche', label: 'Content Niche', icon: Layers },
        { key: 'creatorAudienceSize', label: 'Audience Size', icon: Users2 },
        { key: 'postingFrequency', label: 'Posting Frequency', icon: Calendar },
      ],
    },
    startup: {
      label: 'Brand Profile',
      fields: [
        { key: 'startupStage', label: 'Company Stage', icon: Rocket },
        { key: 'startupGrowthChannel', label: 'Growth Channel', icon: TrendingUp },
        { key: 'startupTeamSize', label: 'Team Size', icon: Users2 },
      ],
    },
    agency: {
      label: 'Agency Profile',
      fields: [
        { key: 'agencyClientCount', label: 'Client Count', icon: Building2 },
        { key: 'agencyServices', label: 'Services Offered', icon: Layers },
        { key: 'agencyNiche', label: 'Agency Niche', icon: Target },
        { key: 'agencyMonthlyOutput', label: 'Monthly Output', icon: BarChart3 },
      ],
    },
    enterprise: {
      label: 'Enterprise Profile',
      fields: [
        { key: 'enterpriseIndustry', label: 'Industry', icon: Building2 },
        { key: 'enterpriseDepartment', label: 'Department', icon: Briefcase },
        { key: 'enterpriseSecurity', label: 'Security Requirements', icon: ShieldCheck },
        { key: 'enterpriseBudget', label: 'Budget Range', icon: DollarSign },
      ],
    },
  };

  const currentRoleFields = orgType ? roleFields[orgType] : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-details-title"
    >
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div
                className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold"
                aria-hidden="true"
              >
                {user.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <h2 id="user-details-title" className="text-xl font-bold">
                  {user.name}
                </h2>
                <p className="text-white/80">{user.email}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10"
              type="button"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <User className="h-5 w-5 mr-2 text-blue-600" aria-hidden="true" />
                Basic Information
              </h3>
              <div className="space-y-3">
                <InfoRow label="Referral Code" value={user.referralCode} />
                <InfoRow label="Referred By" value={user.referredBy || 'None'} />
                <InfoRow label="Referral Count" value={String(user.referralCount || 0)} />
                <InfoRow label="Credits" value={String(user.credits || 0)} />
                <InfoRow label="Status" value={user.status.replace('_', ' ').toUpperCase()} />
                <InfoRow
                  label="Joined"
                  value={new Date(user.joinedAt || user.createdAt).toLocaleDateString()}
                />
              </div>
            </div>

            {/* Organisation Profile (role-based) */}
            <div className="bg-gray-50 rounded-xl p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                {orgType && (
                  <span className={`mr-2 ${orgTypeConfig[orgType].color}`} aria-hidden="true">
                    {React.createElement(orgTypeConfig[orgType].icon, { className: 'h-5 w-5' })}
                  </span>
                )}
                {currentRoleFields?.label || 'Organisation Profile'}
              </h3>

              {orgType && (
                <div className="mb-3">
                  <span
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${orgTypeConfig[orgType].bgColor} ${orgTypeConfig[orgType].color}`}
                  >
                    {React.createElement(orgTypeConfig[orgType].icon, {
                      className: 'h-4 w-4 mr-1.5',
                    })}
                    {orgTypeConfig[orgType].label}
                  </span>
                </div>
              )}

              <div className="space-y-3">
                {currentRoleFields?.fields.map((field) => (
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

            {/* Goals & context */}
            <div className="bg-gray-50 rounded-xl p-5 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Target className="h-5 w-5 mr-2 text-purple-600" aria-hidden="true" />
                Goals &amp; Context
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <InfoRow
                  label="How did you find us?"
                  value={formatFieldValue(q.referralSource)}
                  icon={Search}
                />
                <InfoRow
                  label="Primary Goal"
                  value={formatFieldValue(q.primaryGoal)}
                  icon={Target}
                />
                {getOrgType(user) === 'startup' && (
                  <InfoRow
                    label="Timeline"
                    value={formatFieldValue(q.timeline)}
                    icon={Clock}
                  />
                )}
              </div>
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-500 flex items-center">
                  <MessageSquare
                    className="h-4 w-4 mr-1.5 text-gray-400"
                    aria-hidden="true"
                  />
                  Biggest Challenge
                </label>
                <p className="mt-1 text-gray-900 bg-white rounded-lg p-3 border">
                  {q.painPoints || (
                    <span className="text-gray-400 italic">Not answered</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between">
          <div className="text-sm text-gray-500">User ID: {user.id}</div>
          <div className="flex items-center space-x-3">
            {user.status === 'waitlisted' && (
              <>
                <button
                  onClick={() => { onClose(); onAction('approve', user); }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                  type="button"
                >
                  <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                  Approve
                </button>
                <button
                  onClick={() => { onClose(); onAction('reject', user); }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center"
                  type="button"
                >
                  <XCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                  Reject
                </button>
              </>
            )}
            {(user.status === 'banned' ||
              user.status === 'rejected' ||
              user.status === 'removed') && (
              <button
                onClick={() => { onClose(); onAction('restore', user); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                type="button"
              >
                <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
                Restore
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// ACTION MODAL (single-user confirmation)
// ============================================

/** Props accepted by {@link ActionModal}. */
export interface ActionModalProps {
  /** The action type being confirmed. */
  type: ActionType;
  /** The target user. */
  user: WaitlistUser;
  /** Callback fired when the modal is dismissed. */
  onClose: () => void;
  /** Callback fired when the action is confirmed. */
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
  /** Whether a mutation is currently in flight (disables the confirm button). */
  isLoading: boolean;
}

/**
 * ActionModal
 *
 * Confirmation dialog for a single-user action (approve, reject, ban,
 * delete, or restore).  Dynamically shows the relevant reason/notes fields
 * depending on the action type.
 *
 * @param props - See {@link ActionModalProps}.
 */
export const ActionModal: React.FC<ActionModalProps> = ({
  type,
  user,
  onClose,
  onConfirm,
  adminNotes,
  setAdminNotes,
  rejectionReason,
  setRejectionReason,
  banReason,
  setBanReason,
  deleteReason,
  setDeleteReason,
  restoreStatus,
  setRestoreStatus,
  isLoading,
}) => {
  const configs: Record<string, { title: string; color: string; icon: React.ElementType }> = {
    approve: { title: 'Approve User', color: 'bg-green-600 hover:bg-green-700', icon: CheckCircle },
    reject: { title: 'Reject User', color: 'bg-red-600 hover:bg-red-700', icon: XCircle },
    ban: { title: 'Ban User', color: 'bg-red-600 hover:bg-red-700', icon: Ban },
    delete: { title: 'Delete User', color: 'bg-red-600 hover:bg-red-700', icon: Trash },
    restore: { title: 'Restore User', color: 'bg-blue-600 hover:bg-blue-700', icon: RotateCcw },
  };

  const config = configs[type] ?? configs.approve;
  const Icon = config.icon;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Icon className="h-6 w-6 text-gray-700" aria-hidden="true" />
            <h3 id="action-modal-title" className="text-lg font-semibold text-gray-900">
              {config.title}
            </h3>
          </div>

          <p className="text-gray-600 mb-4">
            You are about to {type}{' '}
            <span className="font-medium">{user.name}</span> ({user.email}).
          </p>

          {/* Rejection reason */}
          {type === 'reject' && (
            <div className="mb-4">
              <label
                htmlFor="rejection-reason"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Rejection Reason
              </label>
              <input
                id="rejection-reason"
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for rejection"
              />
            </div>
          )}

          {/* Ban reason */}
          {type === 'ban' && (
            <div className="mb-4">
              <label
                htmlFor="ban-reason"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Ban Reason
              </label>
              <input
                id="ban-reason"
                type="text"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for ban"
              />
            </div>
          )}

          {/* Delete reason */}
          {type === 'delete' && (
            <div className="mb-4">
              <label
                htmlFor="delete-reason"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Delete Reason
              </label>
              <input
                id="delete-reason"
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reason for deletion"
              />
            </div>
          )}

          {/* Restore target status */}
          {type === 'restore' && (
            <div className="mb-4">
              <label
                htmlFor="restore-status"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Restore To Status
              </label>
              <select
                id="restore-status"
                value={restoreStatus}
                onChange={(e) => setRestoreStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="waitlisted">Waitlisted</option>
                <option value="early_access">Early Access</option>
              </select>
            </div>
          )}

          {/* Admin notes (always shown) */}
          <div className="mb-4">
            <label
              htmlFor="admin-notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Admin Notes (Optional)
            </label>
            <textarea
              id="admin-notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Add internal notes…"
            />
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-white rounded-lg ${config.color} disabled:opacity-50 flex items-center`}
            type="button"
          >
            {isLoading ? 'Processing…' : config.title}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// BULK ACTION MODAL
// ============================================

/** Props accepted by {@link BulkActionModal}. */
export interface BulkActionModalProps {
  /** The bulk action type string (e.g. `'approve'`, `'reject'`). */
  action: string;
  /** Number of users included in the bulk operation. */
  selectedCount: number;
  /** Callback fired when the modal is dismissed. */
  onClose: () => void;
  /** Callback fired when the action is confirmed. */
  onConfirm: () => void;
  reason: string;
  setReason: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  /** Whether a mutation is currently in flight (disables the confirm button). */
  isLoading: boolean;
}

/**
 * BulkActionModal
 *
 * Confirmation dialog for a bulk action affecting multiple selected users.
 * Collects a shared reason and optional admin notes before submitting.
 *
 * @param props - See {@link BulkActionModalProps}.
 */
export const BulkActionModal: React.FC<BulkActionModalProps> = ({
  action,
  selectedCount,
  onClose,
  onConfirm,
  reason,
  setReason,
  notes,
  setNotes,
  isLoading,
}) => {
  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-action-title"
    >
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        <div className="p-6">
          <h3 id="bulk-action-title" className="text-lg font-semibold text-gray-900 mb-2">
            Bulk {actionLabel}
          </h3>
          <p className="text-gray-600 mb-4">
            This will {action}{' '}
            <span className="font-medium">{selectedCount}</span>{' '}
            selected user{selectedCount !== 1 ? 's' : ''}.
          </p>

          <div className="mb-4">
            <label htmlFor="bulk-reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason
            </label>
            <input
              id="bulk-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder={`Reason for bulk ${action}`}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="bulk-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Admin Notes
            </label>
            <textarea
              id="bulk-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Internal notes…"
            />
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            type="button"
          >
            {isLoading ? 'Processing…' : `${actionLabel} All`}
          </button>
        </div>
      </div>
    </div>
  );
};
