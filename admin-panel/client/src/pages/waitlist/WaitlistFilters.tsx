/**
 * @fileoverview WaitlistFilters component.
 *
 * Renders the search bar, org-type filter, status filter, and the
 * bulk-actions bar that appears when one or more rows are selected.
 * All state lives in the parent (WaitlistManagement) and is passed
 * down via props so this component stays purely presentational.
 *
 * @module WaitlistFilters
 */

import React from 'react';
import { Search } from 'lucide-react';
import type { WaitlistUser } from './types';

// ============================================
// PROP TYPES
// ============================================

/** Props accepted by {@link WaitlistFilters}. */
export interface WaitlistFiltersProps {
  /** Current value of the text search input. */
  searchTerm: string;
  /** Callback fired when the search input changes. */
  onSearchChange: (value: string) => void;

  /** Currently selected org-type filter value (`'all'` | OrgType). */
  orgTypeFilter: string;
  /** Callback fired when the org-type dropdown changes. */
  onOrgTypeFilterChange: (value: string) => void;

  /** Currently selected status filter value (`'all'` | status string). */
  statusFilter: string;
  /** Callback fired when the status dropdown changes. */
  onStatusFilterChange: (value: string) => void;

  /** IDs of the currently selected users (for bulk actions). */
  selectedUsers: string[];
  /** Callback to clear the current selection. */
  onClearSelection: () => void;
  /** Callback fired when a bulk action is chosen from the dropdown. */
  onBulkAction: (action: string) => void;
}

// ============================================
// COMPONENT
// ============================================

/**
 * WaitlistFilters
 *
 * Presents the filter controls for the waitlist table:
 * - Full-text search (name, email, referral code)
 * - Org-type dropdown (All / Creator / Brand / Agency / Enterprise)
 * - Status dropdown (All / Waitlisted / Early Access / Rejected / Banned / Removed)
 * - Bulk-actions bar (shown only when ≥1 row is selected)
 *
 * @param props - See {@link WaitlistFiltersProps}.
 */
const WaitlistFilters: React.FC<WaitlistFiltersProps> = ({
  searchTerm,
  onSearchChange,
  orgTypeFilter,
  onOrgTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  selectedUsers,
  onClearSelection,
  onBulkAction,
}) => {
  /**
   * Handles changes on the bulk-action select element.
   * Resets the select back to the placeholder after dispatching the action
   * so the control is ready for the next operation.
   */
  const handleBulkSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value) {
      onBulkAction(e.target.value);
      // Reset so the placeholder shows again
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Filter Controls ───────────────────────────────────────── */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search input */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search by name, email, or referral code..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Search waitlist users"
              />
            </div>
          </div>

          {/* Org-type filter */}
          <div className="sm:w-40">
            <select
              value={orgTypeFilter}
              onChange={(e) => onOrgTypeFilterChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Filter by org type"
            >
              <option value="all">All Types</option>
              <option value="solo">Creator</option>
              <option value="startup">Brand</option>
              <option value="agency">Agency</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="sm:w-40">
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Filter by status"
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

      {/* ── Bulk Actions Bar (conditional) ────────────────────────── */}
      {selectedUsers.length > 0 && (
        <div
          className="bg-blue-50 border border-blue-200 rounded-xl p-4"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-blue-900">
                {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={onClearSelection}
                className="text-sm text-blue-600 hover:text-blue-800"
                type="button"
              >
                Clear selection
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <select
                defaultValue=""
                onChange={handleBulkSelectChange}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Choose a bulk action"
              >
                <option value="" disabled>
                  Bulk Actions
                </option>
                <option value="approve">Approve Selected</option>
                <option value="reject">Reject Selected</option>
                <option value="ban">Ban Selected</option>
                <option value="delete">Delete Selected</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaitlistFilters;
