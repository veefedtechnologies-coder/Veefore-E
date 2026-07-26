/**
 * AutomationTable Component
 * 
 * Displays automation rules in a table/grid format with pagination support.
 * Sub-component of AutomationList, extracted for better modularity.
 * 
 * Features:
 * - Grid display of automation cards
 * - Pagination controls
 * - Individual automation actions (toggle, delete)
 * - Statistics display per automation
 * 
 * Requirements: 2.2, 2.3
 */

import React, { useState } from 'react'
import { Bot, Play, Pause, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AutomationRule } from '../types/automation.types'

export interface AutomationTableProps {
  /** Array of automations to display */
  automations: AutomationRule[]
  /** Callback when toggling automation status */
  onToggleActive: (ruleId: string, isActive: boolean) => void
  /** Callback when deleting automation */
  onDelete: (ruleId: string) => void
  /** Loading state for update operations */
  isUpdating: boolean
  /** Loading state for delete operations */
  isDeleting: boolean
  /** Number of items per page (default: 6) */
  itemsPerPage?: number
}

export const AutomationTable: React.FC<AutomationTableProps> = ({
  automations,
  onToggleActive,
  onDelete,
  isUpdating,
  isDeleting,
  itemsPerPage = 6
}) => {
  const [currentPage, setCurrentPage] = useState(1)

  // Calculate pagination
  const totalPages = Math.ceil(automations.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentAutomations = automations.slice(startIndex, endIndex)

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
      // Scroll to top of table
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Reset to page 1 when automations change
  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [automations.length, currentPage, totalPages])

  return (
    <div>
      {/* Automation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {currentAutomations.map((rule) => (
          <AutomationCard
            key={rule.id}
            rule={rule}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
            isUpdating={isUpdating}
            isDeleting={isDeleting}
          />
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {startIndex + 1}-{Math.min(endIndex, automations.length)} of {automations.length} automations
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Page Numbers */}
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                // Show first page, last page, current page, and pages around current
                const showPage = 
                  page === 1 || 
                  page === totalPages || 
                  (page >= currentPage - 1 && page <= currentPage + 1)

                if (!showPage) {
                  // Show ellipsis
                  if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <span 
                        key={page}
                        className="px-3 py-2 text-gray-500 dark:text-gray-400"
                      >
                        ...
                      </span>
                    )
                  }
                  return null
                }

                return (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      currentPage === page
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {page}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              aria-label="Next page"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Individual Automation Card Component
interface AutomationCardProps {
  rule: AutomationRule
  onToggleActive: (ruleId: string, isActive: boolean) => void
  onDelete: (ruleId: string) => void
  isUpdating: boolean
  isDeleting: boolean
}

const AutomationCard: React.FC<AutomationCardProps> = ({
  rule,
  onToggleActive,
  onDelete,
  isUpdating,
  isDeleting
}) => {
  return (
    <div className="group relative bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      {/* Status Indicator */}
      <div className="absolute top-4 right-4">
        {/* skeleton-guard-allow: status-dot — live "active automation" status indicator, not a loading placeholder */}
        <div className={`w-3 h-3 rounded-full ${
          rule.isActive 
            ? 'bg-green-500 animate-pulse' 
            : 'bg-gray-400'
        }`}></div>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className={`p-3 rounded-2xl ${
          rule.isActive 
            ? 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30' 
            : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800'
        }`}>
          <Bot className={`w-6 h-6 ${
            rule.isActive 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-gray-500 dark:text-gray-400'
          }`} />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            {rule.name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 capitalize mb-3">
            {rule.type.replace('_', ' + ')} automation
          </p>
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
            rule.isActive 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              rule.isActive ? 'bg-green-500' : 'bg-gray-400'
            }`}></div>
            {rule.isActive ? 'Active' : 'Paused'}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {rule.keywords?.length || 0}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            Keywords
          </div>
        </div>
        <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
          <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
            {rule.targetMediaIds?.length || 0}
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
            Target Posts
          </div>
        </div>
        <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
            {Array.isArray(rule.responses) ? rule.responses.length : 0}
          </div>
          <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
            Responses
          </div>
        </div>
      </div>

      {/* Keywords Preview */}
      {rule.keywords?.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Trigger Keywords:
          </div>
          <div className="flex flex-wrap gap-2">
            {rule.keywords.slice(0, 4).map((keyword: string, index: number) => (
              <span 
                key={index} 
                className="px-3 py-1 bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-medium"
              >
                {keyword}
              </span>
            ))}
            {rule.keywords.length > 4 && (
              <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-medium">
                +{rule.keywords.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Created {rule.createdAt ? new Date(rule.createdAt).toLocaleDateString() : 'N/A'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleActive(rule.id!, rule.isActive)}
            disabled={isUpdating}
            className={`p-2 rounded-xl transition-all duration-200 ${
              rule.isActive 
                ? 'bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 text-yellow-600 dark:text-yellow-400 hover:from-yellow-200 hover:to-orange-200 dark:hover:from-yellow-900/50 dark:hover:to-orange-900/50' 
                : 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400 hover:from-green-200 hover:to-emerald-200 dark:hover:from-green-900/50 dark:hover:to-emerald-900/50'
            }`}
            title={rule.isActive ? 'Pause automation' : 'Resume automation'}
          >
            {rule.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={() => onDelete(rule.id!)}
            disabled={isDeleting}
            className="p-2 bg-gradient-to-r from-red-100 to-pink-100 dark:from-red-900/30 dark:to-pink-900/30 text-red-600 dark:text-red-400 rounded-xl hover:from-red-200 hover:to-pink-200 dark:hover:from-red-900/50 dark:hover:to-pink-900/50 transition-all duration-200"
            title="Delete automation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
