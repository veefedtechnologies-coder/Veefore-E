/**
 * useInstagramSimulation Hook Tests
 * 
 * Unit tests for the useInstagramSimulation custom hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useInstagramSimulation } from './useInstagramSimulation';
import type { UseInstagramSimulationProps } from './useInstagramSimulation';

// Mock fetch API
global.fetch = vi.fn();

describe('useInstagramSimulation', () => {
  const mockUser = {
    uid: 'test-user-id',
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
  } as any;

  const defaultProps: UseInstagramSimulationProps = {
    user: mockUser,
    authLoading: false,
    selectedAccount: 'account-1',
    realAccounts: [
      { id: 'account-1', username: 'test_account', workspaceId: 'workspace-1' },
    ],
    triggerKeywords: ['test', 'keyword'],
    commentReplies: ['Reply 1', 'Reply 2'],
    newKeyword: '',
    commentInputText: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default Instagram user', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      expect(result.current.realInstagramUser).toBeDefined();
      expect(result.current.realInstagramUser.username).toBe('rahulc1020');
    });

    it('should initialize with empty comment timestamps', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      expect(result.current.commentTimestamps).toEqual({});
    });

    it('should provide getRelativeTime function', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      expect(typeof result.current.getRelativeTime).toBe('function');
    });

    it('should generate test comments', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      expect(result.current.testComments).toHaveLength(2);
      expect(result.current.testComments[0].content).toBe('test');
      expect(result.current.testComments[1].content).toBe('keyword');
    });
  });

  describe('Instagram User Fetching', () => {
    it('should fetch Instagram user data when authenticated', async () => {
      const mockResponse = {
        username: 'real_user',
        profile_picture_url: 'https://example.com/real-profile.jpg',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        expect(result.current.realInstagramUser.username).toBe('real_user');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/instagram/user-profile?workspaceId=workspace-1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token',
          }),
        })
      );
    });

    it('should use fallback data when fetch fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        expect(result.current.realInstagramUser.username).toBe('rahulc1020');
      });
    });

    it('should not fetch when user is not authenticated', () => {
      const props = { ...defaultProps, user: null };
      
      renderHook(() => useInstagramSimulation(props));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not fetch when auth is loading', () => {
      const props = { ...defaultProps, authLoading: true };
      
      renderHook(() => useInstagramSimulation(props));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not fetch when no account is selected', () => {
      const props = { ...defaultProps, selectedAccount: '' };
      
      renderHook(() => useInstagramSimulation(props));

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Timestamp Generation', () => {
    it('should generate timestamps for trigger keywords', async () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        expect(Object.keys(result.current.commentTimestamps)).toHaveLength(2);
      });

      expect(result.current.commentTimestamps['test']).toBeDefined();
      expect(result.current.commentTimestamps['keyword']).toBeDefined();
    });

    it('should generate main and reply timestamps', async () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        const timestamp = result.current.commentTimestamps['test'];
        expect(timestamp.main).toBeInstanceOf(Date);
        expect(timestamp.reply).toBeInstanceOf(Date);
      });
    });

    it('should not regenerate timestamps for existing keywords', async () => {
      const { result, rerender } = renderHook(
        (props) => useInstagramSimulation(props),
        { initialProps: defaultProps }
      );

      await waitFor(() => {
        expect(Object.keys(result.current.commentTimestamps)).toHaveLength(2);
      });

      const originalTimestamps = { ...result.current.commentTimestamps };

      // Rerender with same keywords
      rerender(defaultProps);

      await waitFor(() => {
        expect(result.current.commentTimestamps).toEqual(originalTimestamps);
      });
    });

    it('should add timestamps for new keywords', async () => {
      const { result, rerender } = renderHook(
        (props) => useInstagramSimulation(props),
        { initialProps: defaultProps }
      );

      await waitFor(() => {
        expect(Object.keys(result.current.commentTimestamps)).toHaveLength(2);
      });

      // Add new keyword
      rerender({
        ...defaultProps,
        triggerKeywords: ['test', 'keyword', 'new'],
      });

      await waitFor(() => {
        expect(Object.keys(result.current.commentTimestamps)).toHaveLength(3);
        expect(result.current.commentTimestamps['new']).toBeDefined();
      });
    });
  });

  describe('Relative Time Calculation', () => {
    it('should return "just now" for very recent timestamps', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);
      
      expect(result.current.getRelativeTime(fiveSecondsAgo)).toBe('just now');
    });

    it('should return seconds for recent timestamps', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
      
      const relativeTime = result.current.getRelativeTime(thirtySecondsAgo);
      expect(relativeTime).toMatch(/\d+s/);
    });

    it('should return minutes for timestamps under an hour', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      
      expect(result.current.getRelativeTime(tenMinutesAgo)).toBe('10m');
    });

    it('should return hours for timestamps under a day', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      
      expect(result.current.getRelativeTime(fiveHoursAgo)).toBe('5h');
    });

    it('should return days for timestamps under a week', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      
      expect(result.current.getRelativeTime(threeDaysAgo)).toBe('3d');
    });

    it('should return weeks for timestamps under a month', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      expect(result.current.getRelativeTime(twoWeeksAgo)).toBe('2w');
    });

    it('should return months for timestamps under a year', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      
      expect(result.current.getRelativeTime(sixMonthsAgo)).toBe('6mo');
    });

    it('should return years for old timestamps', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));
      
      const now = new Date();
      const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
      
      expect(result.current.getRelativeTime(twoYearsAgo)).toBe('2y');
    });
  });

  describe('Test Comments Generation', () => {
    it('should generate placeholder comment when no keywords', () => {
      const props = { ...defaultProps, triggerKeywords: [] };
      const { result } = renderHook(() => useInstagramSimulation(props));

      expect(result.current.testComments).toHaveLength(1);
      expect(result.current.testComments[0].content).toContain(
        'Please add trigger keywords'
      );
    });

    it('should generate comments with trigger keywords as content', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      expect(result.current.testComments[0].content).toBe('test');
      expect(result.current.testComments[1].content).toBe('keyword');
    });

    it('should generate replies with comment replies', () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      expect(result.current.testComments[0].replies).toHaveLength(1);
      expect(result.current.testComments[0].replies[0].content).toBe('Reply 1');
      expect(result.current.testComments[1].replies[0].content).toBe('Reply 2');
    });

    it('should use real Instagram user for replies', async () => {
      const mockResponse = {
        username: 'real_user',
        profile_picture_url: 'https://example.com/real.jpg',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        expect(result.current.testComments[0].replies[0].username).toBe('real_user');
      });
    });

    it('should cycle through comment replies', () => {
      const props = {
        ...defaultProps,
        triggerKeywords: ['k1', 'k2', 'k3'],
        commentReplies: ['Reply 1', 'Reply 2'],
      };

      const { result } = renderHook(() => useInstagramSimulation(props));

      expect(result.current.testComments[0].replies[0].content).toBe('Reply 1');
      expect(result.current.testComments[1].replies[0].content).toBe('Reply 2');
      expect(result.current.testComments[2].replies[0].content).toBe('Reply 1'); // Cycles back
    });

    it('should use stable timestamps from state', async () => {
      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        expect(Object.keys(result.current.commentTimestamps)).toHaveLength(2);
      });

      const firstComment = result.current.testComments[0];
      const timestamp = result.current.commentTimestamps['test'];

      expect(firstComment.timestamp).toEqual(timestamp.main);
      expect(firstComment.replies[0].timestamp).toEqual(timestamp.reply);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty comment replies array', () => {
      const props = { ...defaultProps, commentReplies: [] };
      const { result } = renderHook(() => useInstagramSimulation(props));

      expect(result.current.testComments[0].replies[0].content).toBe('Message sent!');
    });

    it('should handle empty real accounts array', () => {
      const props = { ...defaultProps, realAccounts: [] };
      
      renderHook(() => useInstagramSimulation(props));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API response without username', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        expect(result.current.realInstagramUser.username).toBe('rahulc1020');
      });
    });

    it('should handle API error response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Error message',
      });

      const { result } = renderHook(() => useInstagramSimulation(defaultProps));

      await waitFor(() => {
        expect(result.current.realInstagramUser.username).toBe('rahulc1020');
      });
    });
  });
});
