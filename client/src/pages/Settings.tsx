import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { 
  User, 
  Globe,
  Brain,
  Zap,
  Instagram,
  BarChart,
  Bell,
  Shield,
  Palette,
  CreditCard,
  AlertTriangle,
  Link as LinkIcon
} from 'lucide-react'

// Import refactored settings components (Tasks 8.1-8.5)
import { SettingsLayout, createSettingsCategories } from '@/features/settings/SettingsLayout'
import { ProfileSettings, SecuritySettings, BillingSettings, IntegrationsSettings } from '@/features/settings'

// Import remaining non-refactored settings components
import { 
  WorkspaceSettings,
  AppearanceSettings,
  AISettings,
  NotificationSettings,
  DangerZoneSettings,
  AutomationSettings,
  SocialAccountsSettings,
  AnalyticsSettings
} from '@/components/settings/SettingsTabs'

import type { SettingsCategory } from '@/features/settings/types'


/**
 * Settings Page
 * 
 * Main settings page that uses the refactored SettingsLayout component
 * with extracted settings modules (ProfileSettings, SecuritySettings,
 * BillingSettings, IntegrationsSettings).
 * 
 * Task 8.6: Update settings routing to use SettingsLayout with sub-routes
 * Requirements: 11.5, 2.6
 */
export default function Settings() {
  // Define settings categories with refactored and legacy components
  const settingsCategories: SettingsCategory[] = createSettingsCategories([
    {
      group: 'General',
      items: [
        { 
          id: 'profile', 
          label: 'Profile Settings', 
          icon: User, 
          component: ProfileSettings,
          aliases: ['account'] // Support old 'account' route
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
        },
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
          aliases: ['social-accounts'] // Support old 'social-accounts' route
        },
        { 
          id: 'analytics', 
          label: 'Analytics', 
          icon: BarChart, 
          component: AnalyticsSettings 
        },
        {
          id: 'integrations',
          label: 'Integrations',
          icon: LinkIcon,
          component: IntegrationsSettings
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
          component: SecuritySettings 
        },
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
          danger: true 
        },
      ]
    }
  ])

  return (
    <>
      <SEO 
        {...seoConfig.settings}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <SettingsLayout
        categories={settingsCategories}
        defaultTab="profile"
        title="Settings"
        subtitle="Manage your enterprise workspace and preferences"
      />
    </>
  )
}
