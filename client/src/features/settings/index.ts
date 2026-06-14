/**
 * Settings Feature Module
 * 
 * Exports for settings components, layout, hooks, and types.
 */

// Layout and orchestration
export { SettingsLayout, createSettingsRoutes, createSettingsCategories } from './SettingsLayout';

// Settings components
export { ProfileSettings } from './components/ProfileSettings';
export { AvatarUpload } from './components/AvatarUpload';
export { ProfessionalProfileFields } from './components/ProfessionalProfileFields';
export { SecuritySettings } from './components/SecuritySettings';
export { BillingSettings } from './components/BillingSettings';
export { IntegrationsSettings } from './components/IntegrationsSettings';

// Hooks
export { useProfileSettings } from './hooks/useProfileSettings';
export { useBillingSettings } from './hooks/useBillingSettings';

// Types
export type { SettingsRoute, SettingsCategory, SettingsLayoutProps } from './types';
export type { ProfileFormData, AvatarUploadState, CropSettings, ProfileUpdatePayload } from './types/profile.types';
export type { SubscriptionData, PaymentMethod, BillingHistoryItem, PlanId, SubscriptionStatus } from './types/billing.types';
