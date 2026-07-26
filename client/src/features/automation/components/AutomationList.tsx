/**
 * AutomationList Component
 * 
 * Displays a list of automation rules with filtering, sorting, and CRUD operations.
 * Extracted from AutomationStepByStep.tsx as part of the refactoring effort.
 * 
 * Features:
 * - Search/filter automations by name, type, or keywords
 * - Sort by date, status, or name
 * - Toggle active/inactive status
 * - Delete automations
 * - View automation statistics
 * - Pagination support via AutomationTable sub-component
 * 
 * Requirements: 2.2, 2.3
 */

import React, { useState, useMemo } from 'react'
import { Bot, Search } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { AutomationTable } from './AutomationTable'
import { Skeleton } from '@/components/ui/skeleton'
import type { AutomationRule } from '../types/automation.types'

export interface AutomationListProps {
  /** Array of automation rules to display */
  automationRules: AutomationRule[]
  /** Loading state indicator */
  rulesLoading: boolean
  /** Mutation hook for updating automation rules */
  updateAutomationMutation: {
    mutateAsync: (data: { ruleId: string; updates: Partial<AutomationRule> }) => Promise<void>
    isPending: boolean
  }
  /** Mutation hook for deleting automation rules */
  deleteAutomationMutation: {
    mutateAsync: (ruleId: string) => Promise<void>
    isPending: boolean
  }
  /** Callback when create new automation is clicked */
  onCreateNew?: () => void
}

type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'status'
type FilterOption = 'all' | 'active' | 'paused'

export const AutomationList: React.FC<AutomationListProps> = ({
  automationRules,
  rulesLoading,
  updateAutomationMutation,
  deleteAutomationMutation,
  onCreateNew
}) => {
  const { toast } = useToast()
  
  // State for filtering and sorting
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('date-desc')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')

  // Handle toggle active/inactive
  const handleToggleActive = async (ruleId: string, isActive: boolean) => {
    try {
      await updateAutomationMutation.mutateAsync({
        ruleId,
        updates: { isActive: !isActive }
      })
      toast({
        title: isActive ? "Automation Paused" : "Automation Resumed",
        description: isActive ? "Your automation has been paused" : "Your automation is now active",
        variant: "default",
      })
    } catch (error) {
      console.error('Error toggling automation:', error)
      toast({
        title: "Error",
        description: "Failed to update automation status",
        variant: "destructive",
      })
    }
  }

  // Handle delete automation
  const handleDelete = async (ruleId: string) => {
    if (window.confirm('Are you sure you want to delete this automation rule?')) {
      try {
        await deleteAutomationMutation.mutateAsync(ruleId)
        toast({
          title: "Automation Deleted",
          description: "Your automation rule has been successfully deleted",
          variant: "default",
        })
      } catch (error) {
        console.error('Error deleting automation:', error)
        toast({
          title: "Error",
          description: "Failed to delete automation rule",
          variant: "destructive",
        })
      }
    }
  }

  // Filter and sort automation rules
  const filteredAndSortedRules = useMemo(() => {
    if (!automationRules) return []
    
    let filtered = automationRules

    // Apply status filter
    if (filterBy === 'active') {
      filtered = filtered.filter(rule => rule.isActive)
    } else if (filterBy === 'paused') {
      filtered = filtered.filter(rule => !rule.isActive)
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(rule => 
        rule.name?.toLowerCase().includes(query) ||
        rule.type?.toLowerCase().includes(query) ||
        rule.keywords?.some(keyword => keyword.toLowerCase().includes(query))
      )
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        case 'date-asc':
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        case 'name-asc':
          return (a.name || '').localeCompare(b.name || '')
        case 'name-desc':
          return (b.name || '').localeCompare(a.name || '')
        case 'status':
          return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0)
        default:
          return 0
      }
    })

    return sorted
  }, [automationRules, searchQuery, sortBy, filterBy])

  // Calculate statistics
  const stats = useMemo(() => {
    if (!automationRules) {
      return { total: 0, active: 0, paused: 0 }
    }
    return {
      total: automationRules.length,
      active: automationRules.filter(rule => rule.isActive).length,
      paused: automationRules.filter(rule => !rule.isActive).length
    }
  }, [automationRules])

  // Show skeletons only when loading AND no cached data exists
  const showSkeletons = rulesLoading && (!automationRules || automationRules.length === 0)

  if (showSkeletons) {
    return <AutomationListSkeleton />
  }

  return (
    <div className="p-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Automation Rules
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Manage and monitor your active automation rules
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.total}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total Rules
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {stats.active}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Active
              </div>
            </div>
            {onCreateNew && (
              <button
                onClick={onCreateNew}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                Create New
              </button>
            )}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search automations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter by Status */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterBy('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filterBy === 'all'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterBy('active')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filterBy === 'active'
                  ? 'bg-green-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilterBy('paused')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filterBy === 'paused'
                  ? 'bg-yellow-600 text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Paused
            </button>
          </div>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* Empty State */}
      {filteredAndSortedRules.length === 0 && !searchQuery && stats.total === 0 ? (
        <EmptyState onCreateNew={onCreateNew} />
      ) : filteredAndSortedRules.length === 0 ? (
        <NoResultsState searchQuery={searchQuery} onClearSearch={() => setSearchQuery('')} />
      ) : (
        /* Automation Table */
        <AutomationTable
          automations={filteredAndSortedRules}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          isUpdating={updateAutomationMutation.isPending}
          isDeleting={deleteAutomationMutation.isPending}
        />
      )}
    </div>
  )
}

// Skeleton loading component
const AutomationListSkeleton: React.FC = () => {
  return (
    <div className="p-8">
      <div className="mb-8">
        <Skeleton variant="text" className="h-8 rounded-lg w-64 mb-2" />
        <Skeleton variant="text" className="h-4 rounded w-96" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Skeleton variant="rectangle" className="w-12 h-12 rounded-xl" />
                <div>
                  <Skeleton variant="text" className="h-5 w-32 mb-2" />
                  <Skeleton variant="text" className="h-4 w-24" />
                </div>
              </div>
              <Skeleton variant="pill" className="h-6 rounded-full w-16" />
            </div>
            <div className="space-y-3">
              <Skeleton variant="text" className="h-4 w-full" />
              <Skeleton variant="text" className="h-4 w-3/4" />
              <Skeleton variant="text" className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Empty state component
const EmptyState: React.FC<{ onCreateNew?: () => void }> = ({ onCreateNew }) => {
  return (
    <div className="text-center py-16">
      <div className="relative">
        <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Bot className="w-12 h-12 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">!</span>
        </div>
      </div>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
        No automation rules yet
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
        Create your first automation rule to start engaging with your audience automatically
      </p>
      {onCreateNew && (
        <button
          onClick={onCreateNew}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
        >
          <Bot className="w-5 h-5" />
          Create Your First Rule
        </button>
      )}
    </div>
  )
}

// No results state component
const NoResultsState: React.FC<{ searchQuery: string; onClearSearch: () => void }> = ({ 
  searchQuery, 
  onClearSearch 
}) => {
  return (
    <div className="text-center py-16">
      <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <Search className="w-12 h-12 text-gray-400" />
      </div>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
        No results found
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
        No automations match your search for "{searchQuery}"
      </p>
      <button
        onClick={onClearSearch}
        className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
      >
        Clear Search
      </button>
    </div>
  )
}
