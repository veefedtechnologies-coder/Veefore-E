/**
 * Unit tests for AutomationTable component
 * 
 * Tests pagination, automation card rendering, and action handlers
 * Requirements: 2.2, 2.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AutomationTable } from '../AutomationTable'
import type { AutomationRule } from '../../types/automation.types'

describe('AutomationTable', () => {
  const mockAutomations: AutomationRule[] = Array.from({ length: 15 }, (_, i) => ({
    id: `auto-${i + 1}`,
    name: `Automation ${i + 1}`,
    workspaceId: 'ws1',
    type: i % 3 === 0 ? 'comment_dm' : i % 3 === 1 ? 'dm_only' : 'comment_only',
    matchMode: 'contains',
    negativeKeywords: [],
    aiIntents: [],
    keywords: [`keyword${i}`, `test${i}`],
    targetMediaIds: [`post${i}`],
    responses: [`Response ${i}`],
    isActive: i % 2 === 0,
    createdAt: new Date(2024, 0, i + 1).toISOString()
  }))

  const mockOnToggleActive = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render automation cards', () => {
      render(
        <AutomationTable
          automations={mockAutomations.slice(0, 3)}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText('Automation 1')).toBeInTheDocument()
      expect(screen.getByText('Automation 2')).toBeInTheDocument()
      expect(screen.getByText('Automation 3')).toBeInTheDocument()
    })

    it('should display automation type correctly', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText('comment + dm automation')).toBeInTheDocument()
    })

    it('should show active status correctly', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0], mockAutomations[1]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const activeLabels = screen.getAllByText('Active')
      const pausedLabels = screen.getAllByText('Paused')
      
      expect(activeLabels.length).toBeGreaterThan(0)
      expect(pausedLabels.length).toBeGreaterThan(0)
    })

    it('should display automation statistics', () => {
      const automation = mockAutomations[0]
      render(
        <AutomationTable
          automations={[automation]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText('Keywords')).toBeInTheDocument()
      expect(screen.getByText('Target Posts')).toBeInTheDocument()
      expect(screen.getByText('Responses')).toBeInTheDocument()
    })

    it('should display keyword preview', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText('Trigger Keywords:')).toBeInTheDocument()
      expect(screen.getByText('keyword0')).toBeInTheDocument()
      expect(screen.getByText('test0')).toBeInTheDocument()
    })

    it('should show "+X more" when more than 4 keywords exist', () => {
      const automationWithManyKeywords: AutomationRule = {
        ...mockAutomations[0],
        keywords: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']
      }

      render(
        <AutomationTable
          automations={[automationWithManyKeywords]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText('+2 more')).toBeInTheDocument()
    })

    it('should display created date', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText(/Created/)).toBeInTheDocument()
    })
  })

  describe('Pagination', () => {
    it('should show first page of items with default pagination (6 per page)', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Should show first 6 automations
      expect(screen.getByText('Automation 1')).toBeInTheDocument()
      expect(screen.getByText('Automation 6')).toBeInTheDocument()
      expect(screen.queryByText('Automation 7')).not.toBeInTheDocument()
    })

    it('should show pagination controls when items exceed page size', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText('Showing 1-6 of 15 automations')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument()
    })

    it('should not show pagination when items fit on one page', () => {
      render(
        <AutomationTable
          automations={mockAutomations.slice(0, 4)}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Previous page' })).not.toBeInTheDocument()
    })

    it('should navigate to next page', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const nextButton = screen.getByRole('button', { name: 'Next page' })
      fireEvent.click(nextButton)

      // Should now show items 7-12
      expect(screen.getByText('Automation 7')).toBeInTheDocument()
      expect(screen.getByText('Automation 12')).toBeInTheDocument()
      expect(screen.queryByText('Automation 1')).not.toBeInTheDocument()
      expect(screen.getByText('Showing 7-12 of 15 automations')).toBeInTheDocument()
    })

    it('should navigate to previous page', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Go to page 2
      const nextButton = screen.getByRole('button', { name: 'Next page' })
      fireEvent.click(nextButton)

      // Go back to page 1
      const prevButton = screen.getByRole('button', { name: 'Previous page' })
      fireEvent.click(prevButton)

      expect(screen.getByText('Automation 1')).toBeInTheDocument()
      expect(screen.getByText('Showing 1-6 of 15 automations')).toBeInTheDocument()
    })

    it('should disable previous button on first page', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const prevButton = screen.getByRole('button', { name: 'Previous page' })
      expect(prevButton).toBeDisabled()
    })

    it('should disable next button on last page', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Navigate to last page (page 3 for 15 items with 6 per page)
      const nextButton = screen.getByRole('button', { name: 'Next page' })
      fireEvent.click(nextButton) // page 2
      fireEvent.click(nextButton) // page 3

      expect(nextButton).toBeDisabled()
    })

    it('should render page number buttons', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // With 15 items and 6 per page, should have 3 pages
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument()
    })

    it('should navigate to specific page when page number is clicked', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const page2Button = screen.getByRole('button', { name: '2' })
      fireEvent.click(page2Button)

      expect(screen.getByText('Showing 7-12 of 15 automations')).toBeInTheDocument()
    })

    it('should use custom itemsPerPage prop', () => {
      render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
          itemsPerPage={3}
        />
      )

      expect(screen.getByText('Showing 1-3 of 15 automations')).toBeInTheDocument()
      expect(screen.getByText('Automation 1')).toBeInTheDocument()
      expect(screen.getByText('Automation 3')).toBeInTheDocument()
      expect(screen.queryByText('Automation 4')).not.toBeInTheDocument()
    })

    it('should reset to page 1 when filtered items change and current page becomes invalid', () => {
      const { rerender } = render(
        <AutomationTable
          automations={mockAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Navigate to page 2
      const nextButton = screen.getByRole('button', { name: 'Next page' })
      fireEvent.click(nextButton)

      // Now filter to only 3 items (which would make page 2 invalid)
      rerender(
        <AutomationTable
          automations={mockAutomations.slice(0, 3)}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Should be back on page 1
      expect(screen.queryByText(/Showing/)).not.toBeInTheDocument() // Only 3 items, no pagination
    })
  })

  describe('Action Handlers', () => {
    it('should call onToggleActive with correct parameters when pause button is clicked', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const pauseButton = screen.getByTitle('Pause automation')
      fireEvent.click(pauseButton)

      expect(mockOnToggleActive).toHaveBeenCalledWith('auto-1', true)
    })

    it('should call onToggleActive with correct parameters when resume button is clicked', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[1]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const resumeButton = screen.getByTitle('Resume automation')
      fireEvent.click(resumeButton)

      expect(mockOnToggleActive).toHaveBeenCalledWith('auto-2', false)
    })

    it('should call onDelete with correct automation id', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const deleteButton = screen.getByTitle('Delete automation')
      fireEvent.click(deleteButton)

      expect(mockOnDelete).toHaveBeenCalledWith('auto-1')
    })

    it('should disable toggle button when isUpdating is true', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={true}
          isDeleting={false}
        />
      )

      const pauseButton = screen.getByTitle('Pause automation')
      expect(pauseButton).toBeDisabled()
    })

    it('should disable delete button when isDeleting is true', () => {
      render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={true}
        />
      )

      const deleteButton = screen.getByTitle('Delete automation')
      expect(deleteButton).toBeDisabled()
    })
  })

  describe('Visual Styling', () => {
    it('should apply correct styling for active automations', () => {
      const { container } = render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const activeLabel = screen.getByText('Active')
      expect(activeLabel.className).toContain('green')
    })

    it('should apply correct styling for paused automations', () => {
      const { container } = render(
        <AutomationTable
          automations={[mockAutomations[1]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const pausedLabel = screen.getByText('Paused')
      expect(pausedLabel.className).toContain('gray')
    })

    it('should show pulsing indicator for active automations', () => {
      const { container } = render(
        <AutomationTable
          automations={[mockAutomations[0]]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      const indicators = container.querySelectorAll('.animate-pulse')
      expect(indicators.length).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty automations array', () => {
      render(
        <AutomationTable
          automations={[]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.queryByText(/Automation/)).not.toBeInTheDocument()
    })

    it('should handle automation without keywords', () => {
      const automationNoKeywords: AutomationRule = {
        ...mockAutomations[0],
        keywords: []
      }

      render(
        <AutomationTable
          automations={[automationNoKeywords]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.queryByText('Trigger Keywords:')).not.toBeInTheDocument()
    })

    it('should handle automation without id', () => {
      const automationNoId: AutomationRule = {
        ...mockAutomations[0],
        id: undefined
      }

      render(
        <AutomationTable
          automations={[automationNoId]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Should still render without crashing
      expect(screen.getByText('Automation 1')).toBeInTheDocument()
    })

    it('should handle automation with non-array responses', () => {
      const automationBadResponses: AutomationRule = {
        ...mockAutomations[0],
        responses: 'not an array' as any
      }

      render(
        <AutomationTable
          automations={[automationBadResponses]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Should show 0 responses instead of crashing
      expect(screen.getByText('Responses')).toBeInTheDocument()
    })

    it('should handle automation without createdAt', () => {
      const automationNoDate: AutomationRule = {
        ...mockAutomations[0],
        createdAt: undefined
      }

      render(
        <AutomationTable
          automations={[automationNoDate]}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      expect(screen.getByText(/Created N\/A/)).toBeInTheDocument()
    })
  })

  describe('Pagination Ellipsis', () => {
    it('should show ellipsis for many pages', () => {
      // Create 50 automations to have many pages (50/6 = 9 pages)
      const manyAutomations = Array.from({ length: 50 }, (_, i) => ({
        ...mockAutomations[0],
        id: `auto-${i + 1}`,
        name: `Automation ${i + 1}`
      }))

      render(
        <AutomationTable
          automations={manyAutomations}
          onToggleActive={mockOnToggleActive}
          onDelete={mockOnDelete}
          isUpdating={false}
          isDeleting={false}
        />
      )

      // Should show ellipsis between pages
      const ellipsis = screen.getAllByText('...')
      expect(ellipsis.length).toBeGreaterThan(0)
    })
  })
})
