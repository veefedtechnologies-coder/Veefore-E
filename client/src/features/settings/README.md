# Settings Feature Module

## Overview

The Settings feature module provides profile editing functionality, including basic information management, avatar upload with preview, professional profile configuration, and user preferences.

This module was extracted from the monolithic `SettingsTabs.tsx` component (2,302 lines) as part of Task 8.2 of the codebase refactoring initiative.

## Structure

```
features/settings/
├── components/
│   ├── ProfileSettings.tsx          # Main profile settings form
│   ├── AvatarUpload.tsx             # Avatar upload with preview
│   └── ProfessionalProfileFields.tsx # Business type-specific fields
├── hooks/
│   └── useProfileSettings.ts         # Profile state and API management
├── types/
│   └── profile.types.ts              # TypeScript type definitions
├── index.ts                          # Module exports
└── README.md                         # This file
```

## Components

### ProfileSettings

Main component that orchestrates the profile editing experience.

**Features:**
- Basic information editing (name, email, phone, bio)
- Avatar upload with preview
- Professional profile configuration
- User preferences (timezone, language)

**Usage:**
```tsx
import { ProfileSettings } from '@/features/settings';

function SettingsPage() {
  return <ProfileSettings />;
}
```

### AvatarUpload

Handles avatar image upload with preview and validation.

**Features:**
- File selection with type validation (PNG, JPG, JPEG)
- Size validation (5MB max)
- Preview before upload
- Upload and remove functionality
- Loading states

**Props:**
- `currentAvatar`: Current avatar URL
- `avatarState`: Upload state
- `onAvatarSelect`: File selection handler
- `onAvatarUpload`: Upload handler
- `onAvatarRemove`: Remove handler
- `onAvatarCancel`: Cancel selection handler
- `isUploading`: Upload loading state
- `isRemoving`: Remove loading state

### ProfessionalProfileFields

Renders conditional form fields based on business type.

**Business Types:**
- **Creator**: Platform, niche, audience size, posting frequency
- **Startup**: Stage, team size, growth channel, timeline
- **Agency**: Client count, services, niche, monthly output
- **Enterprise**: Industry, department, security requirements, budget

## Hooks

### useProfileSettings

Manages profile editing state, form data, avatar upload, and API mutations.

**Returns:**
```typescript
{
  // Form data
  formData: ProfileFormData
  setFormData: (data: ProfileFormData) => void
  handleFieldChange: (field: keyof ProfileFormData, value: string) => void
  
  // Avatar state
  avatarState: AvatarUploadState
  handleAvatarSelect: (file: File) => void
  handleAvatarUpload: () => Promise<void>
  handleAvatarRemove: () => void
  handleAvatarCancel: () => void
  
  // Form submission
  handleSubmit: (e: React.FormEvent) => void
  
  // Loading states
  isSaving: boolean
  isUploadingAvatar: boolean
  isRemovingAvatar: boolean
  
  // User data
  userData: any
}
```

**Features:**
- Automatic form initialization from user data
- Form validation
- Avatar file validation (type and size)
- API mutations with optimistic updates
- Toast notifications for success/error states
- Preview URL cleanup on unmount

## Types

### ProfileFormData

Complete form data structure for profile editing.

### AvatarUploadState

Avatar upload state including file, preview URL, loading, and error states.

### ProfileUpdatePayload

API payload structure for profile updates.

## API Endpoints

The module interacts with the following API endpoints:

- `PATCH /api/user` - Update profile information
- `POST /api/user/avatar` - Upload avatar
- `DELETE /api/user/avatar` - Remove avatar

## Requirements Validation

This module satisfies the following requirements from the spec:

- **Requirement 11.2**: Extract ProfileSettings component
- **Requirement 11.3**: Isolate API calls and form validation
- **Requirement 11.6**: Create custom hooks for settings-specific logic

## Integration

To integrate this module into the main settings page:

```tsx
import { ProfileSettings } from '@/features/settings';

function SettingsPage() {
  return (
    <div className="settings-container">
      <ProfileSettings />
      {/* Other settings sections */}
    </div>
  );
}
```

## Testing

Key areas to test:

1. **Form Validation**
   - Required fields
   - Email format
   - Phone number format

2. **Avatar Upload**
   - File type validation
   - File size validation
   - Preview generation
   - Upload success/error handling

3. **Professional Profile**
   - Conditional field rendering based on business type
   - Field value persistence

4. **API Integration**
   - Successful profile updates
   - Error handling
   - Cache invalidation

## Future Enhancements

Potential improvements for future iterations:

1. **Avatar Cropping**: Add image cropping tool before upload
2. **Drag and Drop**: Support drag-and-drop for avatar upload
3. **Multiple Images**: Support multiple profile images/gallery
4. **Rich Bio Editor**: Add markdown or rich text editor for bio
5. **Social Links**: Add social media profile links section
6. **Email Verification**: Add email change with verification flow
7. **Username Availability**: Real-time username availability check

## Related Modules

- `@/hooks/useUser` - User data fetching
- `@/hooks/use-toast` - Toast notifications
- `@/lib/queryClient` - API request utilities
- `@/components/ui/*` - UI component library
