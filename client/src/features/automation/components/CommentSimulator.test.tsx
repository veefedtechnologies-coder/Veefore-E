/**
 * CommentSimulator Component Tests
 * 
 * Unit tests for the CommentSimulator component and useInstagramSimulation hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommentSimulator } from './CommentSimulator';
import type { CommentSimulatorProps } from './CommentSimulator';

// Mock the useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      getIdToken: vi.fn().mockResolvedValue('mock-token'),
      uid: 'test-user-id',
    },
    loading: false,
  }),
}));

// Mock the useInstagramSimulation hook
vi.mock('../hooks/useInstagramSimulation', () => ({
  useInstagramSimulation: () => ({
    realInstagramUser: {
      username: 'test_user',
      profilePic: 'https://example.com/profile.jpg',
    },
    commentTimestamps: {},
    getRelativeTime: (timestamp: Date) => '5m',
    testComments: [
      {
        id: 1,
        username: 'test_commenter',
        profilePic: 'https://example.com/commenter.jpg',
        content: 'test keyword',
        timestamp: new Date(),
        likes: 0,
        replies: [
          {
            id: 1,
            username: 'test_user',
            profilePic: 'https://example.com/profile.jpg',
            content: 'Auto reply message',
            timestamp: new Date(),
            likes: 0,
          },
        ],
      },
    ],
  }),
}));

describe('CommentSimulator', () => {
  const mockUpdateSourceRef = { current: null };
  
  const defaultProps: CommentSimulatorProps = {
    isVisible: true,
    onClose: vi.fn(),
    triggerKeywords: ['test', 'keyword'],
    automationType: 'comment_dm',
    commentReplies: ['Reply 1', 'Reply 2'],
    dmMessage: 'DM message',
    selectedAccount: 'account-1',
    realAccounts: [
      { id: 'account-1', username: 'test_account', workspaceId: 'workspace-1' },
    ],
    newKeyword: '',
    commentInputText: '',
    setCommentInputText: vi.fn(),
    getCurrentKeywords: vi.fn(() => ['test', 'keyword']),
    setSelectedKeywords: vi.fn(),
    updateSourceRef: mockUpdateSourceRef,
    currentTime: new Date(),
    keywords: ['test', 'keyword'],
    setKeywords: vi.fn(),
    dmKeywords: [],
    setDmKeywords: vi.fn(),
    commentKeywords: [],
    setCommentKeywords: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the comment simulator when visible', () => {
      render(<CommentSimulator {...defaultProps} />);
      
      expect(screen.getByText('Comments')).toBeInTheDocument();
    });

    it('should not be visible when isVisible is false', () => {
      render(<CommentSimulator {...defaultProps} isVisible={false} />);
      
      const overlay = screen.getByRole('button', { hidden: true }).parentElement;
      expect(overlay).toHaveClass('opacity-0', 'pointer-events-none');
    });

    it('should render test comments when trigger keywords exist', () => {
      render(<CommentSimulator {...defaultProps} />);
      
      expect(screen.getByText('test_commenter')).toBeInTheDocument();
      expect(screen.getByText('test keyword')).toBeInTheDocument();
    });

    it('should render guidance message when no trigger keywords', () => {
      render(<CommentSimulator {...defaultProps} triggerKeywords={[]} />);
      
      expect(screen.getByText(/Ready to Automate/i)).toBeInTheDocument();
    });

    it('should render appropriate guidance for dm_only automation', () => {
      render(
        <CommentSimulator
          {...defaultProps}
          automationType="dm_only"
          triggerKeywords={[]}
        />
      );
      
      expect(screen.getByText(/Start the Conversation/i)).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should update comment text when user types', () => {
      render(<CommentSimulator {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Add a comment...');
      fireEvent.change(input, { target: { value: 'new comment' } });
      
      expect(input).toHaveValue('new comment');
    });

    it('should enable post button when text is entered', () => {
      render(<CommentSimulator {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      // Initially disabled
      expect(postButton).toHaveClass('text-gray-400');
      
      // Type text
      fireEvent.change(input, { target: { value: 'new comment' } });
      
      // Should be enabled
      expect(postButton).toHaveClass('text-blue-500');
    });

    it('should add keyword when post button is clicked', () => {
      const setKeywords = vi.fn();
      const setSelectedKeywords = vi.fn();
      
      render(
        <CommentSimulator
          {...defaultProps}
          setKeywords={setKeywords}
          setSelectedKeywords={setSelectedKeywords}
        />
      );
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      fireEvent.change(input, { target: { value: 'new keyword' } });
      fireEvent.click(postButton);
      
      expect(setKeywords).toHaveBeenCalled();
      expect(setSelectedKeywords).toHaveBeenCalled();
    });

    it('should clear input after posting comment', () => {
      render(<CommentSimulator {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Add a comment...');
      
      fireEvent.change(input, { target: { value: 'test comment' } });
      expect(input).toHaveValue('test comment');
      
      const postButton = screen.getByRole('button', { name: '' });
      fireEvent.click(postButton);
      
      expect(input).toHaveValue('');
    });

    it('should call onClose when overlay is clicked', () => {
      const onClose = vi.fn();
      render(<CommentSimulator {...defaultProps} onClose={onClose} />);
      
      const overlay = screen.getByRole('button', { hidden: true }).parentElement;
      fireEvent.click(overlay!);
      
      expect(onClose).toHaveBeenCalled();
    });

    it('should not close when clicking inside the modal', () => {
      const onClose = vi.fn();
      render(<CommentSimulator {...defaultProps} onClose={onClose} />);
      
      const modal = screen.getByText('Comments').parentElement;
      fireEvent.click(modal!);
      
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Automation Type Handling', () => {
    it('should handle comment_dm automation type', () => {
      const setKeywords = vi.fn();
      
      render(
        <CommentSimulator
          {...defaultProps}
          automationType="comment_dm"
          setKeywords={setKeywords}
        />
      );
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      fireEvent.change(input, { target: { value: 'dm keyword' } });
      fireEvent.click(postButton);
      
      expect(setKeywords).toHaveBeenCalled();
    });

    it('should handle dm_only automation type', () => {
      const setDmKeywords = vi.fn();
      
      render(
        <CommentSimulator
          {...defaultProps}
          automationType="dm_only"
          setDmKeywords={setDmKeywords}
        />
      );
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      fireEvent.change(input, { target: { value: 'dm keyword' } });
      fireEvent.click(postButton);
      
      expect(setDmKeywords).toHaveBeenCalled();
    });

    it('should handle comment_only automation type', () => {
      const setCommentKeywords = vi.fn();
      
      render(
        <CommentSimulator
          {...defaultProps}
          automationType="comment_only"
          setCommentKeywords={setCommentKeywords}
        />
      );
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      fireEvent.change(input, { target: { value: 'comment keyword' } });
      fireEvent.click(postButton);
      
      expect(setCommentKeywords).toHaveBeenCalled();
    });
  });

  describe('Keyword Synchronization', () => {
    it('should sync newKeyword to commentText', () => {
      const { rerender } = render(<CommentSimulator {...defaultProps} newKeyword="" />);
      
      const input = screen.getByPlaceholderText('Add a comment...');
      expect(input).toHaveValue('');
      
      rerender(<CommentSimulator {...defaultProps} newKeyword="synced keyword" />);
      
      // The effect should sync the keyword
      waitFor(() => {
        expect(input).toHaveValue('synced keyword');
      });
    });

    it('should not add duplicate keywords', () => {
      const setKeywords = vi.fn();
      
      render(
        <CommentSimulator
          {...defaultProps}
          keywords={['existing']}
          setKeywords={setKeywords}
        />
      );
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      fireEvent.change(input, { target: { value: 'existing' } });
      fireEvent.click(postButton);
      
      // Should not add duplicate
      expect(setKeywords).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty automation type', () => {
      render(<CommentSimulator {...defaultProps} automationType="" />);
      
      expect(
        screen.getByText(/configure your automation type first/i)
      ).toBeInTheDocument();
    });

    it('should handle empty trigger keywords array', () => {
      render(<CommentSimulator {...defaultProps} triggerKeywords={[]} />);
      
      expect(screen.getByText(/Ready to Automate/i)).toBeInTheDocument();
    });

    it('should trim whitespace from comment text', () => {
      const setKeywords = vi.fn();
      
      render(
        <CommentSimulator
          {...defaultProps}
          setKeywords={setKeywords}
        />
      );
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      fireEvent.change(input, { target: { value: '  spaced  ' } });
      fireEvent.click(postButton);
      
      expect(setKeywords).toHaveBeenCalledWith(
        expect.arrayContaining(['spaced'])
      );
    });

    it('should not post empty or whitespace-only comments', () => {
      const setKeywords = vi.fn();
      
      render(
        <CommentSimulator
          {...defaultProps}
          setKeywords={setKeywords}
        />
      );
      
      const input = screen.getByPlaceholderText('Add a comment...');
      const postButton = screen.getByRole('button', { name: '' });
      
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(postButton);
      
      expect(setKeywords).not.toHaveBeenCalled();
    });
  });
});
