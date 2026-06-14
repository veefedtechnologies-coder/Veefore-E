/**
 * AutomationStepByStep Page
 * 
 * This file has been refactored as part of the codebase optimization initiative.
 * The original monolithic component (4,352 lines) has been decomposed into smaller,
 * focused modules following the Single Responsibility Principle.
 * 
 * New structure:
 * - /features/automation/components/AutomationBuilder.tsx - Main orchestrator component
 * - /features/automation/components/AutomationList.tsx - List view with CRUD operations
 * - /features/automation/components/InstagramPreview.tsx - Instagram post/story preview
 * - /features/automation/components/CommentSimulator.tsx - Comment automation simulation
 * - /features/automation/hooks/useAutomationFlow.ts - State management hook
 * - /features/automation/hooks/useInstagramSimulation.ts - Simulation logic hook
 * 
 * This page file now acts as a thin wrapper for backwards compatibility,
 * re-exporting the AutomationBuilder component from the new module structure.
 * 
 * Task: 2.7 - Update imports in consuming files
 * Requirements: 2.6, 2.7
 */

import React from 'react'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { AutomationBuilder } from '@/features/automation'

/**
 * AutomationStepByStep - Main page component
 * 
 * This component provides the main entry point for the automation feature.
 * It wraps the AutomationBuilder with SEO metadata and structured data.
 * 
 * The actual implementation is now in the feature module:
 * @see /features/automation/components/AutomationBuilder.tsx
 */
export default function AutomationStepByStep() {
  return (
    <>
      <SEO 
        {...seoConfig.automation}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <AutomationBuilder />
    </>
  )
}
