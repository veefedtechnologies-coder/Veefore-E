import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InstagramPreview } from '../InstagramPreview';
import '@testing-library/jest-dom';

describe('InstagramPreview Integration Tests', () => {
  const mockPostData = {
    id: '123',
    type: 'post' as const,
    image: 'https://example.com/image.jpg',
    caption: 'Test caption',
    likes: 100,
    comments: 50,
  };

  const mockAccountData = [
    {
      id: 'acc1',
      name: '@testaccount',
      avatar: 'https://example.com/avatar.jpg',
      platform: 'Instagram',
    },
  ];

  it('should render without crashing', () => {
    const { container } = render(<InstagramPreview />);
    expect(container).toBeInTheDocument();
  });

  it('should display placeholder when no post selected', () => {
    render(<InstagramPreview />);
    expect(screen.getByText('Select a post to preview')).toBeInTheDocument();
  });

  it('should render with post data', () => {
    render(
      <InstagramPreview
        selectedPost={mockPostData}
        realAccounts={mockAccountData}
        selectedAccount="acc1"
      />
    );
    
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
  });

  it('should render DM preview mode', () => {
    render(
      <InstagramPreview
        automationType="comment_dm"
        currentStep={3}
        dmMessage="Test DM"
        realAccounts={mockAccountData}
        selectedAccount="acc1"
      />
    );
    
    expect(screen.getByText('DM Preview')).toBeInTheDocument();
  });

  it('should render automation status indicator', () => {
    render(
      <InstagramPreview
        selectedPost={mockPostData}
        automationType="comment_dm"
        currentStep={2}
        currentKeywords={['guide']}
        realAccounts={mockAccountData}
        selectedAccount="acc1"
      />
    );
    
    expect(screen.getByText(/Comment to DM Active/)).toBeInTheDocument();
  });
});
