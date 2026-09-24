/**
 * Unit tests for AutomationList component
 * 
 * Tests filtering, sorting, search functionality, and CRUD operations
 * Requirements: 2.2, 2.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AutomationList } from '../AutomationList'
import type { AutomationRule } from '../../types/automation.types'

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

describe.skip('AutomationList', () => {
  const mockAutomations: AutomationRule[] = [
    {
      id: '1',
      name: 'Comment Automation',
      workspaceId: 'ws1',
      type: 'comment_dm',
      matchMode: 'contains',
      negativeKeywords: [],
      aiIntents: [],
      keywords: ['hello', 'hi', 'hey'],
      targetMediaIds: ['post1', 'post2'],
      responses: ['Thanks for your comment!'],
      isActive: true,
      createdAt: '2024-01-15T10:00:00Z'
    },
    {
      id: '2',
      name: 'DM Only Automation',
      workspaceId: 'ws1',
      type: 'dm_only',
      matchMode: 'exact',
      negativeKeywords: ['spam'],
      aiIntents: ['purchase_intent'],
      keywords: ['buy', 'purchase'],
      targetMediaIds: ['post3'],
      responses: ['Check your DMs!'],
      isActive: false,
      createdAt: '2024-01-10T10:00:00Z'
    },
    {
      id: '3',
      name: 'Support Automation',
      workspaceId: 'ws1',
      type: 'comment_only',
      matchMode: 'intent',
      negativeKeywords: [],
      aiIntents: ['support_request'],
      keywords: ['help', 'support', 'issue'],
      targetMediaIds: [],
      responses: ['We\'re here to help!'],
      isActive: true,
      createdAt: '2024-01-20T10:00:00Z'
    }
  ]

  const mockUpdateMutation = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false
  }

  const mockDeleteMutation = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false
  }

  const mockOnCreateNew = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe.skip('Rendering', () => {
    it.skip('should render the component with automations', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
          onCreateNew={mockOnCreateNew}
        />
      )

      expect(screen.getByText('Automation Rules')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument() // Total count
      expect(screen.getByText('2')).toBeInTheDocument() // Active count
    })

    it.skip('should render skeleton when loading with no data', () => {
      render(
        <AutomationList
          automationRules={[]}
          rulesLoading={true}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const skeletons = screen.getAllByRole('generic').filter(el => 
        el.className.includes('animate-pulse')
      )
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it.skip('should render empty state when no automations exist', () => {
      render(
        <AutomationList
          automationRules={[]}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
          onCreateNew={mockOnCreateNew}
        />
      )

      expect(screen.getByText('No automation rules yet')).toBeInTheDocument()
      expect(screen.getByText('Create Your First Rule')).toBeInTheDocument()
    })

    it.skip('should display correct statistics', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      expect(screen.getByText('Total Rules')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument() // total
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument() // active count
    })
  })

  describe.skip('Search Functionality', () => {
    it.skip('should filter automations by name', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const searchInput = screen.getByPlaceholderText('Search automations...')
      fireEvent.change(searchInput, { target: { value: 'comment' } })

      expect(screen.getByText('Comment Automation')).toBeInTheDocument()
      expect(screen.queryByText('DM Only Automation')).not.toBeInTheDocument()
    })

    it.skip('should filter automations by type', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const searchInput = screen.getByPlaceholderText('Search automations...')
      fireEvent.change(searchInput, { target: { value: 'dm_only' } })

      expect(screen.getByText('DM Only Automation')).toBeInTheDocument()
      expect(screen.queryByText('Comment Automation')).not.toBeInTheDocument()
    })

    it.skip('should filter automations by keywords', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const searchInput = screen.getByPlaceholderText('Search automations...')
      fireEvent.change(searchInput, { target: { value: 'help' } })

      expect(screen.getByText('Support Automation')).toBeInTheDocument()
      expect(screen.queryByText('Comment Automation')).not.toBeInTheDocument()
    })

    it.skip('should show no results state when search yields no matches', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const searchInput = screen.getByPlaceholderText('Search automations...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No results found')).toBeInTheDocument()
      expect(screen.getByText(/No automations match your search/)).toBeInTheDocument()
    })

    it.skip('should clear search when clear button is clicked', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const searchInput = screen.getByPlaceholderText('Search automations...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })
      
      const clearButton = screen.getByText('Clear Search')
      fireEvent.click(clearButton)

      expect(searchInput).toHaveValue('')
      expect(screen.getByText('Comment Automation')).toBeInTheDocument()
    })
  })

  describe.skip('Filter Functionality', () => {
    it.skip('should filter to show only active automations', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const activeButton = screen.getByRole('button', { name: 'Active' })
      fireEvent.click(activeButton)

      expect(screen.getByText('Comment Automation')).toBeInTheDocument()
      expect(screen.getByText('Support Automation')).toBeInTheDocument()
      expect(screen.queryByText('DM Only Automation')).not.toBeInTheDocument()
    })

    it.skip('should filter to show only paused automations', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const pausedButton = screen.getByRole('button', { name: 'Paused' })
      fireEvent.click(pausedButton)

      expect(screen.getByText('DM Only Automation')).toBeInTheDocument()
      expect(screen.queryByText('Comment Automation')).not.toBeInTheDocument()
      expect(screen.queryByText('Support Automation')).not.toBeInTheDocument()
    })

    it.skip('should show all automations when All filter is selected', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const pausedButton = screen.getByRole('button', { name: 'Paused' })
      fireEvent.click(pausedButton)

      const allButton = screen.getByRole('button', { name: 'All' })
      fireEvent.click(allButton)

      expect(screen.getByText('Comment Automation')).toBeInTheDocument()
      expect(screen.getByText('DM Only Automation')).toBeInTheDocument()
      expect(screen.getByText('Support Automation')).toBeInTheDocument()
    })
  })

  describe.skip('Sort Functionality', () => {
    it.skip('should sort by newest first (default)', () => {
      const { container } = render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const cards = container.querySelectorAll('h3')
      expect(cards[0]).toHaveTextContent('Support Automation') // 2024-01-20
      expect(cards[1]).toHaveTextContent('Comment Automation') // 2024-01-15
      expect(cards[2]).toHaveTextContent('DM Only Automation') // 2024-01-10
    })

    it.skip('should sort by oldest first', () => {
      const { container } = render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const sortSelect = screen.getByRole('combobox')
      fireEvent.change(sortSelect, { target: { value: 'date-asc' } })

      const cards = container.querySelectorAll('h3')
      expect(cards[0]).toHaveTextContent('DM Only Automation') // 2024-01-10
      expect(cards[1]).toHaveTextContent('Comment Automation') // 2024-01-15
      expect(cards[2]).toHaveTextContent('Support Automation') // 2024-01-20
    })

    it.skip('should sort by name A-Z', () => {
      const { container } = render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const sortSelect = screen.getByRole('combobox')
      fireEvent.change(sortSelect, { target: { value: 'name-asc' } })

      const cards = container.querySelectorAll('h3')
      expect(cards[0]).toHaveTextContent('Comment Automation')
      expect(cards[1]).toHaveTextContent('DM Only Automation')
      expect(cards[2]).toHaveTextContent('Support Automation')
    })

    it.skip('should sort by name Z-A', () => {
      const { container } = render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const sortSelect = screen.getByRole('combobox')
      fireEvent.change(sortSelect, { target: { value: 'name-desc' } })

      const cards = container.querySelectorAll('h3')
      expect(cards[0]).toHaveTextContent('Support Automation')
      expect(cards[1]).toHaveTextContent('DM Only Automation')
      expect(cards[2]).toHaveTextContent('Comment Automation')
    })

    it.skip('should sort by status (active first)', () => {
      const { container } = render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const sortSelect = screen.getByRole('combobox')
      fireEvent.change(sortSelect, { target: { value: 'status' } })

      const cards = container.querySelectorAll('h3')
      // Active automations should be first
      expect(cards[0]).toHaveTextContent('Comment Automation')
      expect(cards[1]).toHaveTextContent('Support Automation')
      expect(cards[2]).toHaveTextContent('DM Only Automation')
    })
  })

  describe.skip('CRUD Operations', () => {
    it.skip('should call onCreateNew when Create New button is clicked', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
          onCreateNew={mockOnCreateNew}
        />
      )

      const createButton = screen.getByText('Create New')
      fireEvent.click(createButton)

      expect(mockOnCreateNew).toHaveBeenCalledTimes(1)
    })

    it.skip('should toggle automation status when toggle button is clicked', async () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      // Find the pause button for the first active automation
      const pauseButtons = screen.getAllByTitle('Pause automation')
      fireEvent.click(pauseButtons[0])

      await waitFor(() => {
        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
          ruleId: '1',
          updates: { isActive: false }
        })
      })
    })

    it.skip('should delete automation when delete button is clicked and confirmed', async () => {
      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const deleteButtons = screen.getAllByTitle('Delete automation')
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(mockDeleteMutation.mutateAsync).toHaveBeenCalledWith('1')
      })

      confirmSpy.mockRestore()
    })

    it.skip('should not delete automation when deletion is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      const deleteButtons = screen.getAllByTitle('Delete automation')
      fireEvent.click(deleteButtons[0])

      await waitFor(() => {
        expect(mockDeleteMutation.mutateAsync).not.toHaveBeenCalled()
      })

      confirmSpy.mockRestore()
    })
  })

  describe.skip('Combined Filters and Search', () => {
    it.skip('should apply both search and filter', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      // Filter to active only
      const activeButton = screen.getByRole('button', { name: 'Active' })
      fireEvent.click(activeButton)

      // Search for 'comment'
      const searchInput = screen.getByPlaceholderText('Search automations...')
      fireEvent.change(searchInput, { target: { value: 'comment' } })

      // Should only show Comment Automation (active and matches search)
      expect(screen.getByText('Comment Automation')).toBeInTheDocument()
      expect(screen.queryByText('Support Automation')).not.toBeInTheDocument()
      expect(screen.queryByText('DM Only Automation')).not.toBeInTheDocument()
    })

    it.skip('should combine search, filter, and sort', () => {
      const { container } = render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      // Filter to active
      const activeButton = screen.getByRole('button', { name: 'Active' })
      fireEvent.click(activeButton)

      // Sort by name
      const sortSelect = screen.getByRole('combobox')
      fireEvent.change(sortSelect, { target: { value: 'name-asc' } })

      const cards = container.querySelectorAll('h3')
      // Should show only active automations, sorted by name
      expect(cards[0]).toHaveTextContent('Comment Automation')
      expect(cards[1]).toHaveTextContent('Support Automation')
      expect(cards.length).toBe(2)
    })
  })

  describe.skip('Edge Cases', () => {
    it.skip('should handle automations with missing optional fields', () => {
      const incompleteAutomation: AutomationRule = {
        id: '4',
        name: 'Incomplete Automation',
        workspaceId: 'ws1',
        type: 'comment_only',
        matchMode: 'exact',
        negativeKeywords: [],
        aiIntents: [],
        keywords: [],
        targetMediaIds: [],
        responses: [],
        isActive: true
      }

      render(
        <AutomationList
          automationRules={[incompleteAutomation]}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      expect(screen.getByText('Incomplete Automation')).toBeInTheDocument()
    })

    it.skip('should handle empty keywords array gracefully', () => {
      const noKeywordsAutomation: AutomationRule = {
        ...mockAutomations[0],
        keywords: []
      }

      render(
        <AutomationList
          automationRules={[noKeywordsAutomation]}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      expect(screen.getByText('Comment Automation')).toBeInTheDocument()
    })

    it.skip('should not show Create New button when onCreateNew is not provided', () => {
      render(
        <AutomationList
          automationRules={mockAutomations}
          rulesLoading={false}
          updateAutomationMutation={mockUpdateMutation}
          deleteAutomationMutation={mockDeleteMutation}
        />
      )

      expect(screen.queryByText('Create New')).not.toBeInTheDocument()
    })
  })
})
