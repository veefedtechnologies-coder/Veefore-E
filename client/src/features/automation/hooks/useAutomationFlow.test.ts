/**
 * Unit tests for useAutomationFlow hook
 * 
 * Tests core functionality: state management, validation, and flow control
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAutomationFlow } from './useAutomationFlow'
import { createElement } from 'react'

// Mock dependencies
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn()
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

vi.mock('@/lib/cache', () => ({
  saveAutomationState: vi.fn(),
  loadAutomationState: vi.fn(() => ({})),
  clearAutomationCache: vi.fn(),
  clearUserAutomationCache: vi.fn()
}))

// Test wrapper with QueryClient (no JSX)
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  
  return ({ children }: any) => createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useAutomationFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize with default flow state', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      expect(result.current.flow.automationType).toBe('comment_dm')
      expect(result.current.flow.selectedAccount).toBe('')
      expect(result.current.flow.keywords).toEqual([])
      expect(result.current.currentStep).toBe(1)
      expect(result.current.isValid).toBe(false)
    })

    it('should initialize with custom step', () => {
      const { result } = renderHook(() => useAutomationFlow(3), {
        wrapper: createWrapper()
      })

      expect(result.current.currentStep).toBe(3)
    })
  })

  describe('updateTrigger', () => {
    it('should update trigger configuration', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.updateTrigger({
          selectedAccount: 'account-123',
          automationType: 'dm_only',
          keywords: ['help', 'info']
        })
      })

      expect(result.current.flow.selectedAccount).toBe('account-123')
      expect(result.current.flow.automationType).toBe('dm_only')
      expect(result.current.flow.keywords).toEqual(['help', 'info'])
    })
  })

  describe('addAction', () => {
    it('should update action configuration', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.addAction({
          dmMessage: 'Hello! How can I help you?',
          commentReplies: ['Thanks!', 'Sent!']
        })
      })

      expect(result.current.flow.dmMessage).toBe('Hello! How can I help you?')
      expect(result.current.flow.commentReplies).toEqual(['Thanks!', 'Sent!'])
    })
  })

  describe('Keyword Management', () => {
    it('should add keyword to correct list based on automation type', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      // Default is comment_dm
      act(() => {
        result.current.addKeyword('help')
      })

      expect(result.current.flow.keywords).toContain('help')

      // Change to dm_only
      act(() => {
        result.current.updateTrigger({ automationType: 'dm_only' })
        result.current.addKeyword('info')
      })

      expect(result.current.flow.dmKeywords).toContain('info')
    })

    it('should remove keyword from list', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.addKeyword('help')
        result.current.addKeyword('info')
      })

      expect(result.current.flow.keywords).toHaveLength(2)

      act(() => {
        result.current.removeKeyword('help')
      })

      expect(result.current.flow.keywords).toHaveLength(1)
      expect(result.current.flow.keywords).not.toContain('help')
      expect(result.current.flow.keywords).toContain('info')
    })

    it('should trim whitespace when adding keywords', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.addKeyword('  help  ')
      })

      expect(result.current.flow.keywords).toContain('help')
      expect(result.current.flow.keywords).not.toContain('  help  ')
    })

    it('should ignore empty keywords', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.addKeyword('')
        result.current.addKeyword('   ')
      })

      expect(result.current.flow.keywords).toHaveLength(0)
    })
  })

  describe('DM Button Management', () => {
    it('should add DM button', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      const button = {
        type: 'web_url' as const,
        text: 'Visit Website',
        url: 'https://example.com',
        payload: ''
      }

      act(() => {
        result.current.addDmButton(button)
      })

      expect(result.current.flow.dmButtons).toHaveLength(2) // Initial has 1 default
      expect(result.current.flow.dmButtons[1]).toEqual(button)
    })

    it('should update DM button by index', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.updateDmButton(0, { text: 'Updated Text' })
      })

      expect(result.current.flow.dmButtons[0].text).toBe('Updated Text')
    })

    it('should remove DM button by index', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      const initialLength = result.current.flow.dmButtons.length

      act(() => {
        result.current.removeDmButton(0)
      })

      expect(result.current.flow.dmButtons).toHaveLength(initialLength - 1)
    })
  })

  describe('Validation', () => {
    it('should return invalid when required fields are missing', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      const validation = result.current.validateFlow()

      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
      expect(validation.errors.some(e => e.field === 'selectedAccount')).toBe(true)
      expect(validation.errors.some(e => e.field === 'contentType')).toBe(true)
    })

    it('should validate comment_dm automation type', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.updateFlow({
          selectedAccount: 'account-123',
          contentType: 'post',
          selectedPost: {
            id: 'post-123',
            externalId: 'ext-123',
            title: 'Test Post',
            type: 'post',
            image: 'image.jpg',
            mediaUrl: 'media.jpg',
            thumbnailUrl: 'thumb.jpg',
            permalink: 'https://example.com',
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            reach: 0,
            caption: 'Test',
            publishedAt: new Date().toISOString()
          },
          automationType: 'comment_dm',
          keywords: ['help']
        })
      })

      const validation = result.current.validateFlow()

      // Should still be invalid because comment replies and DM message are missing
      expect(validation.isValid).toBe(false)
      expect(validation.errors.some(e => e.field === 'commentReplies')).toBe(true)
      expect(validation.errors.some(e => e.field === 'dmMessage')).toBe(true)
    })

    it('should be valid when all required fields are filled', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.updateFlow({
          selectedAccount: 'account-123',
          contentType: 'post',
          selectedPost: {
            id: 'post-123',
            externalId: 'ext-123',
            title: 'Test Post',
            type: 'post',
            image: 'image.jpg',
            mediaUrl: 'media.jpg',
            thumbnailUrl: 'thumb.jpg',
            permalink: 'https://example.com',
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            reach: 0,
            caption: 'Test',
            publishedAt: new Date().toISOString()
          },
          automationType: 'comment_dm',
          keywords: ['help'],
          commentReplies: ['Message sent!'],
          dmMessage: 'Hello! How can I help?'
        })
      })

      const validation = result.current.validateFlow()

      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })
  })

  describe('Step Navigation', () => {
    it('should allow setting current step', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.setCurrentStep(3)
      })

      expect(result.current.currentStep).toBe(3)
    })

    it('should check if can proceed from step', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      // Step 1 requires account, content type, and post
      expect(result.current.canProceed(1)).toBe(false)

      act(() => {
        result.current.updateFlow({
          selectedAccount: 'account-123',
          contentType: 'post',
          selectedPost: {
            id: 'post-123',
            externalId: 'ext-123',
            title: 'Test Post',
            type: 'post',
            image: 'image.jpg',
            mediaUrl: 'media.jpg',
            thumbnailUrl: 'thumb.jpg',
            permalink: 'https://example.com',
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            reach: 0,
            caption: 'Test',
            publishedAt: new Date().toISOString()
          }
        })
      })

      expect(result.current.canProceed(1)).toBe(true)
    })
  })

  describe('Reset Flow', () => {
    it('should reset flow to initial state', () => {
      const { result } = renderHook(() => useAutomationFlow(), {
        wrapper: createWrapper()
      })

      act(() => {
        result.current.updateFlow({
          selectedAccount: 'account-123',
          keywords: ['help', 'info']
        })
        result.current.setCurrentStep(3)
      })

      expect(result.current.flow.selectedAccount).toBe('account-123')
      expect(result.current.currentStep).toBe(3)

      act(() => {
        result.current.resetFlow()
      })

      expect(result.current.flow.selectedAccount).toBe('')
      expect(result.current.flow.keywords).toEqual([])
      expect(result.current.currentStep).toBe(1)
      expect(result.current.isValid).toBe(false)
    })
  })
})
