# InstagramPreview Component

## Overview

The `InstagramPreview` component provides a realistic Instagram interface preview for automation workflows. It displays posts, reels, stories, and direct messages with accurate Instagram UI replication, allowing users to visualize how their automated responses will appear on the platform.

## Features

- **Multiple Content Types**: Supports posts, reels, videos, carousels, and stories
- **IPhoneMockup Wrapper**: Provides an iPhone-like frame with header and status indicators
- **InstagramPostRenderer**: Accurate rendering of Instagram post UI with engagement metrics
- **DM Preview Interface**: Shows direct message previews with buttons and variable substitution
- **Responsive Design**: Adapts to different screen sizes while maintaining Instagram's authentic look
- **Dark Mode Support**: Full dark mode theming
- **Automation Status**: Live indicators showing active automation configuration

## Installation

```tsx
import { InstagramPreview } from '@/features/automation/components/InstagramPreview';
```

## Usage

### Basic Post Preview

```tsx
<InstagramPreview
  selectedPost={{
    id: '123',
    type: 'post',
    image: 'https://example.com/image.jpg',
    caption: 'Amazing content!',
    likes: 1500,
    comments: 250,
  }}
  realAccounts={[
    {
      id: 'acc1',
      name: '@myaccount',
      avatar: 'https://example.com/avatar.jpg',
      platform: 'Instagram'
    }
  ]}
  selectedAccount="acc1"
/>
```

### Reel/Video Preview

```tsx
<InstagramPreview
  selectedPost={{
    id: '456',
    type: 'reel',
    mediaUrl: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    caption: 'Check out this reel!',
    likes: 5000,
    comments: 500,
  }}
  realAccounts={accounts}
  selectedAccount="acc1"
  showCommentScreen={false}
  onCommentScreenToggle={(show) => setShowComments(show)}
/>
```

### DM Preview with Automation

```tsx
<InstagramPreview
  automationType="comment_dm"
  currentStep={3}
  dmMessage="Hi {{username}}! Thanks for your interest in {{keyword}}. Here's your link: {{link}}"
  dmButtons={[
    { 
      text: 'Visit Website', 
      type: 'web_url', 
      url: 'https://example.com' 
    },
    { 
      text: 'Quick Reply', 
      type: 'quick_reply' 
    }
  ]}
  currentKeywords={['guide', 'ebook', 'free']}
  realAccounts={accounts}
  selectedAccount="acc1"
/>
```

### With Follower Gate

```tsx
<InstagramPreview
  automationType="comment_dm"
  currentStep={3}
  followerGateEnabled={true}
  followerGateMessage="Please follow us to get access!"
  followerGateVisitLabel="Visit Profile"
  followerGateConfirmLabel="I'm Following ✅"
  realAccounts={accounts}
  selectedAccount="acc1"
/>
```

### With Comment Screen Integration

```tsx
<InstagramPreview
  selectedPost={reelData}
  realAccounts={accounts}
  selectedAccount="acc1"
  showCommentScreen={showComments}
  onCommentScreenToggle={setShowComments}
  CommentScreenComponent={CommentScreen}
  commentScreenProps={{
    triggerKeywords: ['free', 'guide'],
    automationType: 'comment_dm',
    commentReplies: ['Check your DMs!'],
    // ... other props
  }}
/>
```

## Props

### InstagramPreviewProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `selectedPost` | `PostData \| null` | `undefined` | The post/reel/story data to display |
| `postsData` | `PostData[]` | `undefined` | Array of posts for finding updated data |
| `selectedAccount` | `string` | `undefined` | ID of the selected Instagram account |
| `realAccounts` | `AccountData[]` | `[]` | Array of available Instagram accounts |
| `automationType` | `'comment_dm' \| 'dm_only' \| 'comment_only' \| ''` | `''` | Type of automation configured |
| `currentStep` | `number` | `1` | Current step in automation workflow |
| `currentKeywords` | `string[]` | `[]` | Trigger keywords for automation |
| `commentReplies` | `string[]` | `[]` | Array of comment reply messages |
| `dmMessage` | `string` | `''` | Direct message template |
| `dmButtons` | `DMButton[]` | `[]` | Buttons to display in DM |
| `followerGateEnabled` | `boolean` | `false` | Enable follower verification |
| `followerGateMessage` | `string` | `''` | Message for follower gate |
| `followerGateVisitLabel` | `string` | `''` | Label for visit profile button |
| `followerGateConfirmLabel` | `string` | `''` | Label for confirm following button |
| `showCommentScreen` | `boolean` | `false` | Whether comment screen is visible |
| `onCommentScreenToggle` | `(show: boolean) => void` | `undefined` | Handler for comment screen toggle |
| `CommentScreenComponent` | `React.ComponentType<any>` | `undefined` | Custom comment screen component |
| `commentScreenProps` | `any` | `undefined` | Props to pass to comment screen |

### PostData

```typescript
interface PostData {
  id: string;
  type?: 'post' | 'reel' | 'video' | 'carousel' | 'story';
  image?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  likes?: number;
  comments?: number;
  engagement?: {
    likes?: number;
    comments?: number;
  };
}
```

### AccountData

```typescript
interface AccountData {
  id: string;
  name: string;
  avatar?: string;
  platform?: string;
}
```

### DMButton

```typescript
interface DMButton {
  text: string;
  type: 'quick_reply' | 'web_url' | 'flow' | 'copy_code';
  url?: string;
}
```

## Sub-Components

### PostHeader

Displays the Instagram post header with account avatar, username, timestamp, and menu button.

### InstagramPostRenderer

Core renderer that handles different post types:
- Regular posts (single image)
- Carousels (multiple images)
- Reels (vertical video)
- Stories (full-screen)

### ReelOverlay

Provides the Instagram Reel UI overlay with:
- Profile picture and follow button
- Caption and audio info
- Action buttons (like, comment, share, save)

### PostActions

Displays engagement actions below regular posts:
- Like, comment, share, save buttons
- Likes count
- Comments preview link

### DMPreview

Renders the Instagram DM interface with:
- Message timestamp
- Message bubble with profile picture
- Interactive buttons
- Message input mockup
- Variable substitution ({{username}}, {{keyword}}, {{link}})

### AutomationStatusIndicator

Shows the current automation configuration status:
- Automation type badge
- Active trigger count
- Monitored keywords

## Variable Substitution

The DM message supports dynamic variables:

- `{{username}}` - Replaced with "john_smith" (preview placeholder)
- `{{first_name}}` - Replaced with "John" (preview placeholder)
- `{{keyword}}` - Replaced with the first trigger keyword
- `{{link}}` - Replaced with the first button URL or "https://link..."

Example:
```
"Hi {{username}}! Thanks for {{keyword}}. Visit: {{link}}"
→ "Hi john_smith! Thanks for guide. Visit: https://example.com"
```

## Automation Modes

### Comment to DM (`comment_dm`)

- **Step 3**: Shows only DM preview
- **Steps 4-5**: Shows both post preview and DM preview

### DM Only (`dm_only`)

- Shows DM automation trigger without public comment

### Comment Only (`comment_only`)

- Shows only public comment automation

## Styling

The component uses Tailwind CSS with:
- Gradient backgrounds for headers
- Dark mode support via `dark:` prefixes
- Responsive design with mobile-first approach
- Instagram-authentic UI colors and spacing
- Smooth transitions and animations

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader friendly
- Color contrast compliance

## Performance Considerations

1. **Video Optimization**: Uses poster images as fallback
2. **Lazy Loading**: Videos only load when visible
3. **Memoization**: Sub-components are optimized to prevent unnecessary re-renders
4. **Sticky Positioning**: Uses CSS sticky for efficient scroll performance

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14+
- Chrome Mobile 90+

## Testing

Comprehensive test suite included covering:
- Component rendering
- Post type variations
- DM preview modes
- Automation status
- Edge cases and error states

Run tests:
```bash
npm test InstagramPreview.test.tsx
```

## Examples

### Complete Integration Example

```tsx
import React, { useState } from 'react';
import { InstagramPreview } from '@/features/automation/components/InstagramPreview';
import { CommentScreen } from './CommentScreen';

function AutomationPreview() {
  const [showComments, setShowComments] = useState(false);
  
  const post = {
    id: '123',
    type: 'reel',
    mediaUrl: 'https://example.com/video.mp4',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    caption: 'Amazing content! 🎉',
    likes: 15000,
    comments: 1200,
  };
  
  const accounts = [
    {
      id: 'acc1',
      name: '@mybrand',
      avatar: 'https://example.com/avatar.jpg',
      platform: 'Instagram'
    }
  ];
  
  return (
    <InstagramPreview
      selectedPost={post}
      realAccounts={accounts}
      selectedAccount="acc1"
      automationType="comment_dm"
      currentStep={2}
      currentKeywords={['guide', 'free', 'download']}
      commentReplies={['Check your DMs! 📩']}
      dmMessage="Hi {{username}}! Here's your {{keyword}}: {{link}}"
      dmButtons={[
        { text: 'Download Now', type: 'web_url', url: 'https://example.com/download' },
        { text: 'Learn More', type: 'quick_reply' }
      ]}
      showCommentScreen={showComments}
      onCommentScreenToggle={setShowComments}
      CommentScreenComponent={CommentScreen}
      commentScreenProps={{
        triggerKeywords: ['guide', 'free', 'download'],
        automationType: 'comment_dm',
        commentReplies: ['Check your DMs! 📩'],
        dmMessage: "Hi {{username}}! Here's your {{keyword}}: {{link}}",
      }}
    />
  );
}
```

## Related Components

- `CommentSimulator` - Simulates comment interactions
- `AutomationBuilder` - Main automation configuration component
- `AutomationList` - Lists all configured automations

## Requirements

This component validates:
- **Requirement 2.2**: Extraction of large component files
- **Requirement 2.3**: Preview functionality for Instagram posts and stories

## Changelog

### Version 1.0.0 (Initial Release)
- Initial extraction from AutomationStepByStep.tsx
- Support for posts, reels, and stories
- DM preview interface
- Follower gate feature
- Dark mode support
- Comprehensive test coverage

## Contributing

When contributing to this component:
1. Maintain Instagram UI authenticity
2. Add tests for new features
3. Update documentation
4. Ensure accessibility compliance
5. Test across different post types

## License

Part of the Veefore-E application. All rights reserved.
