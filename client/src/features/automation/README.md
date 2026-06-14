# Automation Feature

This feature module contains components for Instagram automation workflows, including comment automation, DM automation, and combined automation flows.

## Directory Structure

```
automation/
├── components/
│   ├── InstagramPreview.tsx          # Instagram post/reel/story preview (~680 lines)
│   ├── InstagramPreview.md           # Component documentation
│   ├── COMPONENT_VERIFICATION.md     # Verification guide
│   └── __tests__/
│       ├── InstagramPreview.client.test.tsx
│       └── InstagramPreview.integration.client.test.tsx
├── types/
│   └── instagram.types.ts            # TypeScript type definitions (~470 lines)
└── README.md                         # This file
```

## Components

### InstagramPreview

Instagram post/reel/story preview component with automation indicators.

**Features:**
- IPhoneMockup wrapper with status indicators
- InstagramPostRenderer for posts, reels, videos, carousels
- DM preview interface with variable substitution
- Support for multiple automation types
- Follower gate feature
- Responsive design and dark mode

**Usage:**
```tsx
import { InstagramPreview } from '@/features/automation/components/InstagramPreview';

<InstagramPreview
  selectedPost={postData}
  realAccounts={accounts}
  selectedAccount="acc1"
  automationType="comment_dm"
  currentStep={2}
  currentKeywords={['guide', 'free']}
  dmMessage="Hi {{username}}! Here's your {{keyword}}"
  dmButtons={buttons}
/>
```

See [InstagramPreview.md](./components/InstagramPreview.md) for complete documentation.

## Types

### instagram.types.ts

Comprehensive TypeScript type definitions for Instagram automation:

- `PostData` - Instagram post structure
- `AccountData` - Instagram account information
- `DMButton` - DM button configuration
- `AutomationType` - Automation workflow types
- `AutomationConfig` - Complete automation configuration
- Utility functions for engagement metrics, template substitution, etc.

**Usage:**
```tsx
import type { PostData, AccountData, AutomationType } from '@/features/automation/types/instagram.types';
import { getEngagementCount, formatEngagementNumber } from '@/features/automation/types/instagram.types';

const post: PostData = {
  id: '123',
  type: 'reel',
  mediaUrl: 'video.mp4',
  likes: 1500,
  comments: 250,
};

const likesFormatted = formatEngagementNumber(post.likes); // "1.5K"
const commentCount = getEngagementCount(post, 'comments'); // 250
```

## Integration

### With AutomationStepByStep.tsx

To integrate the extracted InstagramPreview component:

1. Import the component:
```tsx
import { InstagramPreview } from '@/features/automation/components/InstagramPreview';
```

2. Replace the `renderInstagramPreview` function:
```tsx
const renderInstagramPreview = () => {
  return (
    <InstagramPreview
      selectedPost={selectedPost}
      postsData={postsData}
      selectedAccount={selectedAccount}
      realAccounts={realAccounts}
      automationType={automationType}
      currentStep={currentStep}
      currentKeywords={getCurrentKeywords()}
      commentReplies={commentReplies}
      dmMessage={dmMessage}
      dmButtons={dmButtons}
      followerGateEnabled={followerGateEnabled}
      followerGateMessage={followerGateMessage}
      followerGateVisitLabel={followerGateVisitLabel}
      followerGateConfirmLabel={followerGateConfirmLabel}
      showCommentScreen={showCommentScreen}
      onCommentScreenToggle={setShowCommentScreen}
      CommentScreenComponent={CommentScreen}
      commentScreenProps={commentScreenProps}
    />
  );
};
```

## Testing

### Unit Tests

```bash
# Run component tests
npm test -- InstagramPreview --config vitest.client.config.ts
```

### Integration Tests

```bash
# Run integration tests
npm test -- InstagramPreview.integration --config vitest.client.config.ts
```

### Manual Testing

See [COMPONENT_VERIFICATION.md](./components/COMPONENT_VERIFICATION.md) for manual verification steps.

## Development

### Adding New Features

1. Update types in `instagram.types.ts`
2. Modify `InstagramPreview.tsx` component
3. Update documentation in `InstagramPreview.md`
4. Add tests in `__tests__/` directory
5. Update this README

### Best Practices

- Use TypeScript types from `instagram.types.ts`
- Follow React hooks rules
- Maintain Instagram UI authenticity
- Ensure accessibility compliance
- Test across different post types
- Support dark mode
- Handle edge cases gracefully

## Requirements

This feature validates:

- **Requirement 2.2**: Large file decomposition
  - Extracted ~300 lines from AutomationStepByStep.tsx
  - Created focused, single-responsibility components
  - Improved maintainability

- **Requirement 2.3**: Instagram preview functionality
  - IPhoneMockup wrapper implementation
  - InstagramPostRenderer for all content types
  - Post and story preview modes
  - Responsive design

## Future Enhancements

### Planned Features

- [ ] Animation transitions between preview modes
- [ ] Real-time comment simulation
- [ ] Multi-account preview
- [ ] Story ring animation
- [ ] Live engagement updates
- [ ] Screenshot/export functionality
- [ ] Accessibility improvements
- [ ] Performance optimizations

### Technical Debt

- [ ] Fix React hook test environment setup
- [ ] Add E2E tests with Playwright
- [ ] Improve video player performance
- [ ] Add error boundaries
- [ ] Implement loading states
- [ ] Add retry logic for failed media loads

## Contributing

When contributing to this feature:

1. Read the component documentation
2. Follow the existing code structure
3. Add tests for new functionality
4. Update documentation
5. Ensure TypeScript strict mode compliance
6. Test across different browsers
7. Verify accessibility

## License

Part of the Veefore-E application. All rights reserved.

## Support

For questions or issues:
- Check component documentation in `InstagramPreview.md`
- Review verification guide in `COMPONENT_VERIFICATION.md`
- See TypeScript types in `instagram.types.ts`
- Contact the development team

---

**Last Updated**: January 2025  
**Component Version**: 1.0.0  
**Status**: ✅ Complete and ready for integration
