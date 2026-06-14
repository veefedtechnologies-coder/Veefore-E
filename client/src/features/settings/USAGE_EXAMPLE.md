# SettingsLayout Usage Example

This file demonstrates how to migrate from the old Settings.tsx pattern to using the new SettingsLayout orchestrator.

## Before (Old Pattern in Settings.tsx)

```tsx
function SettingsContent() {
  const [activeTab, setActiveTab] = useState('account')
  
  const categories = [
    {
      group: 'General',
      items: [
        { id: 'account', label: 'Account Profile', icon: User },
        { id: 'workspace', label: 'Workspaces', icon: Globe },
      ]
    }
  ]
  
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'account': return <AccountSettings />
      case 'workspace': return <WorkspaceSettings />
      default: return <div>Coming Soon</div>
    }
  }
  
  // Manual navigation rendering...
  return <div>...</div>
}
```

## After (Using SettingsLayout)

```tsx
import { SettingsLayout, createSettingsCategories } from '@/features/settings'
import {
  User, Globe, Brain, Zap, Instagram, BarChart,
  Bell, Shield, Palette, CreditCard, AlertTriangle
} from 'lucide-react'
import {
  AccountSettings,
  WorkspaceSettings,
  AppearanceSettings,
  BillingSettings,
  AISettings,
  AutomationSettings,
  SocialAccountsSettings,
  AnalyticsSettings,
  NotificationSettings,
  SecurityPrivacySettings,
  DangerZoneSettings
} from '@/components/settings/SettingsTabs'

export default function Settings() {
  const categories = createSettingsCategories([
    {
      group: 'General',
      items: [
        {
          id: 'account',
          label: 'Account Profile',
          icon: User,
          component: AccountSettings
        },
        {
          id: 'workspace',
          label: 'Workspaces',
          icon: Globe,
          component: WorkspaceSettings
        },
        {
          id: 'appearance',
          label: 'Appearance',
          icon: Palette,
          component: AppearanceSettings
        },
        {
          id: 'billing',
          label: 'Billing & Plans',
          icon: CreditCard,
          component: BillingSettings
        }
      ]
    },
    {
      group: 'Features',
      items: [
        {
          id: 'ai',
          label: 'AI Configuration',
          icon: Brain,
          component: AISettings
        },
        {
          id: 'automation',
          label: 'Automations',
          icon: Zap,
          component: AutomationSettings
        },
        {
          id: 'social',
          label: 'Social Accounts',
          icon: Instagram,
          component: SocialAccountsSettings,
          aliases: ['social-accounts'] // Support old URL format
        },
        {
          id: 'analytics',
          label: 'Analytics',
          icon: BarChart,
          component: AnalyticsSettings
        }
      ]
    },
    {
      group: 'Preferences',
      items: [
        {
          id: 'notifications',
          label: 'Notifications',
          icon: Bell,
          component: NotificationSettings
        },
        {
          id: 'security',
          label: 'Security & Privacy',
          icon: Shield,
          component: SecurityPrivacySettings
        }
      ]
    },
    {
      group: 'Advanced',
      items: [
        {
          id: 'danger',
          label: 'Danger Zone',
          icon: AlertTriangle,
          component: DangerZoneSettings,
          danger: true // Special styling for dangerous settings
        }
      ]
    }
  ])

  return (
    <SettingsLayout 
      categories={categories}
      defaultTab="account"
      title="Settings"
      subtitle="Manage your enterprise workspace and preferences"
    />
  )
}
```

## Benefits of New Pattern

1. **Type Safety**: Full TypeScript support with proper types for routes and categories
2. **Cleaner Code**: No need for switch statements or manual tab rendering
3. **Reusability**: SettingsLayout can be reused for other settings pages (e.g., admin settings)
4. **URL Synchronization**: Automatic URL param handling and history management
5. **Search Built-in**: No need to implement search functionality manually
6. **Mobile Support**: Responsive navigation with mobile menu toggle included
7. **Route Aliases**: Support for backwards compatibility with old URLs
8. **Extensible**: Easy to add new settings tabs without modifying layout logic

## Migration Steps

1. Import `SettingsLayout` from `@/features/settings`
2. Define your categories array with routes
3. Replace the old manual navigation/rendering code with `<SettingsLayout />`
4. Remove the old state management and switch statement logic
5. Test navigation and URL synchronization
