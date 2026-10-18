import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstagramPreview } from '../InstagramPreview';
import '@testing-library/jest-dom';

describe('InstagramPreview', () => {
  const mockPostData = {
    id: '123',
    type: 'post' as const,
    image: 'https://example.com/image.jpg',
    caption: 'Test caption',
    likes: 100,
    comments: 50,
  };

  const mockReelData = {
    id: '456',
    type: 'reel' as const,
    mediaUrl: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    caption: 'Test reel caption',
    likes: 200,
    comments: 75,
  };

  const mockAccountData = [
    {
      id: 'acc1',
      name: '@testaccount',
      avatar: 'https://example.com/avatar.jpg',
      platform: 'Instagram',
    },
  ];

  const mockDMButtons = [
    { text: 'Visit Website', type: 'web_url' as const, url: 'https://example.com' },
    { text: 'Quick Reply', type: 'quick_reply' as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render preview header with correct title', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('Live Preview')).toBeInTheDocument();
      expect(screen.getByText('Automation preview')).toBeInTheDocument();
    });

    it('should render placeholder when no post is selected', () => {
      render(<InstagramPreview />);

      expect(screen.getByText('Select a post to preview')).toBeInTheDocument();
    });

    it('should render post image when post data is provided', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      const image = screen.getByAltText('Post');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', mockPostData.image);
    });
  });

  describe('Post Type Rendering', () => {
    it('should render regular post with header and actions', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      // Check for post header elements
      expect(screen.getByText('@testaccount')).toBeInTheDocument();
      
      // Check for post actions
      expect(screen.getByText('100 likes')).toBeInTheDocument();
      expect(screen.getByText(/View all 50 comments/)).toBeInTheDocument();
    });

    it('should render reel without header but with overlay', () => {
      render(
        <InstagramPreview
          selectedPost={mockReelData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      // Reel should show caption in overlay
      expect(screen.getByText('Test reel caption')).toBeInTheDocument();
      
      // Should show Follow button
      expect(screen.getByText('Follow')).toBeInTheDocument();
    });

    it('should display carousel indicator for carousel posts', () => {
      const carouselPost = { ...mockPostData, type: 'carousel' as const };
      
      render(
        <InstagramPreview
          selectedPost={carouselPost}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      // Check for carousel indicator (3 dots)
      const carouselIndicators = screen.getByRole('img', { name: 'Post' })
        .parentElement?.querySelector('.bg-black\\/20');
      expect(carouselIndicators).toBeInTheDocument();
    });
  });

  describe('DM Preview Mode', () => {
    it('should render DM preview in step 3 for comment_dm automation', () => {
      render(
        <InstagramPreview
          automationType="comment_dm"
          currentStep={3}
          dmMessage="Test DM message"
          dmButtons={mockDMButtons}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('DM Preview')).toBeInTheDocument();
      expect(screen.getByText('Instagram direct message interface')).toBeInTheDocument();
      expect(screen.getByText(/Test DM message/)).toBeInTheDocument();
    });

    it('should render DM buttons correctly', () => {
      render(
        <InstagramPreview
          automationType="comment_dm"
          currentStep={3}
          dmMessage="Test message"
          dmButtons={mockDMButtons}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('Visit Website')).toBeInTheDocument();
      expect(screen.getByText(/Quick Reply \(Quick Reply\)/)).toBeInTheDocument();
    });

    it('should show DM preview in steps 4 and 5 for comment_dm automation', () => {
      const { rerender } = render(
        <InstagramPreview
          selectedPost={mockPostData}
          automationType="comment_dm"
          currentStep={4}
          dmMessage="Follow-up DM"
          dmButtons={mockDMButtons}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('DM Preview')).toBeInTheDocument();

      rerender(
        <InstagramPreview
          selectedPost={mockPostData}
          automationType="comment_dm"
          currentStep={5}
          dmMessage="Follow-up DM"
          dmButtons={mockDMButtons}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('DM Preview')).toBeInTheDocument();
    });

    it('should replace placeholders in DM message', () => {
      render(
        <InstagramPreview
          automationType="comment_dm"
          currentStep={3}
          dmMessage="Hi {{username}}, thanks for {{keyword}}!"
          currentKeywords={['subscribe']}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText(/Hi john_smith, thanks for subscribe!/)).toBeInTheDocument();
    });
  });

  describe('Follower Gate Feature', () => {
    it('should render follower gate message when enabled', () => {
      render(
        <InstagramPreview
          automationType="comment_dm"
          currentStep={3}
          followerGateEnabled={true}
          followerGateMessage="Please follow us first!"
          followerGateConfirmLabel="I'm Following ✅"
          followerGateVisitLabel="Visit Profile"
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('Please follow us first!')).toBeInTheDocument();
      expect(screen.getByText(/I'm Following ✅/)).toBeInTheDocument();
      expect(screen.getByText('Visit Profile')).toBeInTheDocument();
    });
  });

  describe('Automation Status Indicator', () => {
    it('should show automation type when selected', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          automationType="comment_dm"
          currentStep={2}
          currentKeywords={['free', 'guide']}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText(/Comment to DM Active/)).toBeInTheDocument();
      expect(screen.getByText('2 triggers')).toBeInTheDocument();
      expect(screen.getByText(/Monitoring: free, guide/)).toBeInTheDocument();
    });

    it('should show default message when no automation selected', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          currentStep={1}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('Select Automation Type')).toBeInTheDocument();
    });
  });

  describe('Account Data Handling', () => {
    it('should display account avatar and name', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      const avatar = screen.getAllByAltText('Profile')[0];
      expect(avatar).toHaveAttribute('src', mockAccountData[0].avatar);
      expect(screen.getByText('@testaccount')).toBeInTheDocument();
    });

    it('should use fallback avatar when none provided', () => {
      const accountWithoutAvatar = [{ ...mockAccountData[0], avatar: undefined }];
      
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={accountWithoutAvatar}
          selectedAccount="acc1"
        />
      );

      // Should still render with fallback
      const avatars = screen.getAllByAltText('Profile');
      expect(avatars.length).toBeGreaterThan(0);
    });
  });

  describe('Engagement Metrics', () => {
    it('should display likes count correctly', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('100 likes')).toBeInTheDocument();
    });

    it('should display comments count correctly', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText(/View all 50 comments/)).toBeInTheDocument();
    });

    it('should format large numbers with locale string', () => {
      const postWithLargeNumbers = {
        ...mockPostData,
        likes: 1500000,
        comments: 25000,
      };

      render(
        <InstagramPreview
          selectedPost={postWithLargeNumbers}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText(/1,500,000 likes/)).toBeInTheDocument();
      expect(screen.getByText(/View all 25,000 comments/)).toBeInTheDocument();
    });

    it('should handle engagement object format', () => {
      const postWithEngagement = {
        ...mockPostData,
        likes: undefined,
        comments: undefined,
        engagement: {
          likes: 300,
          comments: 150,
        },
      };

      render(
        <InstagramPreview
          selectedPost={postWithEngagement}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('300 likes')).toBeInTheDocument();
      expect(screen.getByText(/View all 150 comments/)).toBeInTheDocument();
    });
  });

  describe('Caption Rendering', () => {
    it('should render post caption with account name', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('Test caption')).toBeInTheDocument();
      // Account name appears as bold text before caption
      const captionContainer = screen.getByText('Test caption').parentElement;
      expect(captionContainer?.textContent).toContain('testaccount');
    });

    it('should not render caption section when caption is empty', () => {
      const postWithoutCaption = { ...mockPostData, caption: undefined };
      
      render(
        <InstagramPreview
          selectedPost={postWithoutCaption}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      // Should still render likes and comments
      expect(screen.getByText('100 likes')).toBeInTheDocument();
    });
  });

  describe('Comment Screen Integration', () => {
    it('should toggle comment screen when button is clicked on reel', () => {
      const mockToggle = vi.fn();
      
      render(
        <InstagramPreview
          selectedPost={mockReelData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
          showCommentScreen={false}
          onCommentScreenToggle={mockToggle}
        />
      );

      const commentButton = screen.getByRole('button', { name: /75/i });
      fireEvent.click(commentButton);

      expect(mockToggle).toHaveBeenCalledWith(true);
    });

    it('should render CommentScreenComponent when provided', () => {
      const MockCommentScreen = ({ isVisible }: { isVisible: boolean }) => (
        <div>{isVisible ? 'Comment Screen Visible' : 'Comment Screen Hidden'}</div>
      );

      render(
        <InstagramPreview
          selectedPost={mockReelData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
          showCommentScreen={true}
          CommentScreenComponent={MockCommentScreen}
          commentScreenProps={{}}
        />
      );

      expect(screen.getByText('Comment Screen Visible')).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should render with sticky positioning', () => {
      const { container } = render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      const stickyContainer = container.querySelector('.sticky');
      expect(stickyContainer).toBeInTheDocument();
    });
  });

  describe('Dark Mode Support', () => {
    it('should apply dark mode classes', () => {
      const { container } = render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      // Check for dark mode classes
      const darkElements = container.querySelectorAll('.dark\\:bg-gray-800');
      expect(darkElements.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing post data gracefully', () => {
      render(
        <InstagramPreview
          selectedPost={null}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText('Select a post to preview')).toBeInTheDocument();
    });

    it('should handle empty accounts array', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={[]}
          selectedAccount="acc1"
        />
      );

      // Should use fallback account name
      expect(screen.getByText('your_account')).toBeInTheDocument();
    });

    it('should handle missing selected account', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          realAccounts={mockAccountData}
        />
      );

      // Should still render
      expect(screen.getByText('Live Preview')).toBeInTheDocument();
    });

    it('should handle empty keywords array', () => {
      render(
        <InstagramPreview
          selectedPost={mockPostData}
          automationType="comment_dm"
          currentStep={2}
          currentKeywords={[]}
          realAccounts={mockAccountData}
          selectedAccount="acc1"
        />
      );

      expect(screen.getByText(/Monitoring: All comments/)).toBeInTheDocument();
    });
  });
});
