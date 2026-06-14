import React from 'react'
import { MessageSquare, Send, Brain, Clock, BarChart3, LucideIcon } from 'lucide-react'
import { Phase1EngagementVisual, Phase1DMVisual, HookVisual } from '../../../components/USPVisuals'
import { isPhase1 } from './phase'

export interface HeroFeature {
  id: string
  icon: LucideIcon
  title: string
  tagline: string
  description: string
  details: string[]
  gradient: string
  visual: React.ReactNode
}

/**
 * heroFeatures - Data backing the cinematic "Game-Changing Features" scroll
 * section. Switches between the Phase 1 (scheduling/analytics) and default
 * (engagement/DM) narratives.
 */
export const heroFeatures: HeroFeature[] = isPhase1 ? [
  {
    id: 'smart-scheduler',
    icon: Clock,
    title: 'Smart Content Scheduler',
    tagline: 'Post when your fans are actually awake.',
    description: "Stop guessing when to hit publish. We track exactly when your specific audience is scrolling, so your post doesn't die in the first 10 minutes.",
    details: ['Peak-time prediction', 'Visual content calendar', 'Auto-publishing queue', 'Audience heatmaps'],
    gradient: 'from-blue-500 to-cyan-500',
    visual: <Phase1EngagementVisual />
  },
  {
    id: 'analytics-engine',
    icon: BarChart3,
    title: 'Deep Analytics Engine',
    tagline: 'Know exactly what is working and double down on it.',
    description: 'Understand your top content formats, posting patterns, and growth drivers with AI-powered insight reports.',
    details: ['Content performance scoring', 'Reach & impression tracking', 'Competitor benchmarking', 'AI growth recommendations'],
    gradient: 'from-purple-500 to-pink-500',
    visual: <Phase1DMVisual />
  },
  {
    id: 'hook-intelligence',
    icon: Brain,
    title: 'AI Hook & Trend Intelligence',
    tagline: 'Remove guesswork from content creation.',
    description: "Creators don't need trends. They need explanations. VeeFore provides intelligence, not noise.",
    details: ['Competitor hook extraction', 'Emotional pattern analysis', 'Niche-specific suggestions', 'Viral pattern prediction'],
    gradient: 'from-indigo-500 to-purple-500',
    visual: <HookVisual />
  }
] : [
  {
    id: 'engagement-automation',
    icon: MessageSquare,
    title: 'AI Engagement Automation',
    tagline: 'Increase engagement velocity and consistency.',
    description: "Fast, meaningful engagement directly boosts algorithmic reach. This is VeeFore's strongest differentiator.",
    details: ['Context-aware comment replies', 'Priority handling of high-value comments', 'Human-like tone control', 'Platform-safe automation limits'],
    gradient: 'from-blue-500 to-cyan-500',
    visual: <Phase1EngagementVisual />
  },
  {
    id: 'dm-automation',
    icon: Send,
    title: 'Smart DM Automation',
    tagline: 'Turn DMs into scalable growth and monetization channels.',
    description: 'Creators lose opportunities in DMs. VeeFore captures them without spam.',
    details: ['Keyword-triggered replies', 'Lead qualification logic', 'Creator-defined safety boundaries', 'Advanced follow-up funnels'],
    gradient: 'from-purple-500 to-pink-500',
    visual: <Phase1DMVisual />
  },
  {
    id: 'hook-intelligence',
    icon: Brain,
    title: 'AI Hook & Trend Intelligence',
    tagline: 'Remove guesswork from content creation.',
    description: "Creators don't need trends. They need explanations. VeeFore provides intelligence, not noise.",
    details: ['Competitor hook extraction', 'Emotional pattern analysis', 'Niche-specific suggestions', 'Viral pattern prediction'],
    gradient: 'from-indigo-500 to-purple-500',
    visual: <HookVisual />
  }
]
