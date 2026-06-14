/**
 * Settings Feature Types
 * 
 * Type definitions for the settings feature module.
 * 
 * @module features/settings/types
 */

import { LucideIcon } from 'lucide-react'

/**
 * Settings route configuration
 * Defines the structure for each settings tab/route
 */
export interface SettingsRoute {
  /** Unique identifier for the route */
  id: string
  /** Display label for the navigation item */
  label: string
  /** Icon component to display */
  icon: LucideIcon
  /** React component to render for this route */
  component: React.ComponentType
  /** Optional danger flag for destructive settings */
  danger?: boolean
  /** Optional URL aliases for backwards compatibility */
  aliases?: string[]
}

/**
 * Settings category grouping
 * Organizes routes into logical groups in the sidebar
 */
export interface SettingsCategory {
  /** Group display name */
  group: string
  /** Routes belonging to this category */
  items: SettingsRoute[]
}

/**
 * Props for SettingsLayout component
 */
export interface SettingsLayoutProps {
  /** Array of categorized settings routes */
  categories: SettingsCategory[]
  /** Optional default tab to show */
  defaultTab?: string
  /** Optional header title */
  title?: string
  /** Optional header subtitle */
  subtitle?: string
}
