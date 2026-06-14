import { isPhase1 } from './phase'

export interface Faq {
  q: string
  a: string
  category: string
}

/**
 * faqs - Frequently asked questions shown in the FAQ section. Copy differs
 * between Phase 1 (scheduling/analytics) and default (engagement/DM) modes.
 */
export const faqs: Faq[] = isPhase1 ? [
  {
    q: 'What exactly is VeeFore?',
    a: 'VeeFore is an AI-powered Social Media Growth Platform for serious creators and brands. It supercharges your growth through three core systems: AI Hook Intelligence (viral content analysis), Smart Scheduler (best-time publishing), and Deep Analytics (performance insights). Think of it as having a 24/7 data-driven growth team.',
    category: 'About'
  },
  {
    q: 'How is VeeFore different from Hootsuite, Buffer, or Later?',
    a: 'Those tools help you schedule and publish content. VeeFore goes deeper — we analyze what content performs best, recommend the exact time to publish, and give you actionable hook intelligence to create content that actually reaches people. Our philosophy: data before guessing, insights before impressions.',
    category: 'Comparison'
  },
  {
    q: "How does VeeFore's AI content system work?",
    a: "VeeFore's AI continuously analyzes top-performing content in your niche, extracts the hook patterns and emotional triggers that drive viral reach, and uses your historical performance data to recommend what to create and when to post. The more you use it, the smarter it gets.",
    category: 'About'
  },
  {
    q: 'How does the credit system work?',
    a: "1 Credit = 1 AI Action. Actions include: generating viral hooks, creating captions with CTAs, analyzing trends, scoring your content, or generating posting schedules. Credits reset monthly based on your plan. Starter gets 300 credits, Growth gets 1,200, and Pro gets 3,000 credits. Unused credits don't roll over, so use them!",
    category: 'Pricing'
  },
  {
    q: 'Which platforms does VeeFore support?',
    a: "We're launching with full Instagram support (posts, reels, stories). TikTok, YouTube Shorts, and Twitter/X integrations are on our roadmap for Q2 2025. Beta users will get early access to new platform integrations as they roll out.",
    category: 'Platforms'
  },
  {
    q: 'What do I get by joining the beta waitlist?',
    a: "Beta members receive exclusive perks: 500 bonus credits on launch, access to a surprise feature we haven't announced yet, 30 days free trial (vs. 14 days for regular users), founding member pricing locked in forever, and direct access to our team for feedback and support. Plus, you'll help shape the product roadmap.",
    category: 'Beta'
  },
  {
    q: 'Who is VeeFore built for?',
    a: "VeeFore is designed for Instagram creators with 5K-500K followers, personal brands, coaches, agencies managing multiple accounts, and e-commerce brands using social for sales. If you're serious about growth and value your time, VeeFore is for you. Not ideal for casual posters or hobby accounts.",
    category: 'About'
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, absolutely. No contracts, no commitments. You can cancel your subscription at any time from your dashboard. Your access continues until the end of your billing period. We believe in earning your business every month, not locking you in.',
    category: 'Pricing'
  }
] : [
  {
    q: 'What exactly is VeeFore?',
    a: 'VeeFore is an AI-powered Social Media Growth Engine designed for serious creators and brands. Unlike basic scheduling tools, VeeFore actively participates in your growth through three core systems: AI Engagement Automation (smart comment replies), Hook Intelligence (trend analysis & viral hook suggestions), and Smart DM Funnels (converting followers into customers). Think of it as having a 24/7 growth team powered by AI.',
    category: 'About'
  },
  {
    q: 'How is VeeFore different from Hootsuite, Buffer, or Later?',
    a: 'Those tools help you schedule and publish content. VeeFore focuses on what happens AFTER you post. We help you respond to comments faster, engage with your audience at scale, identify trending hooks before they blow up, and turn DM conversations into conversions. Our philosophy: Engagement before volume, interaction before impressions.',
    category: 'Comparison'
  },
  {
    q: 'Is the automation safe for my account?',
    a: "Absolutely. VeeFore uses context-aware AI that mimics natural human engagement patterns. We implement strict rate limits well below platform thresholds, use human-like delays between actions, and our AI generates contextually relevant responses—not generic spam. Your account safety is our top priority, which is why we've built compliance into every feature.",
    category: 'Safety'
  },
  {
    q: 'How does the credit system work?',
    a: "1 Credit = 1 AI Action. Actions include: generating viral hooks, creating captions with CTAs, replying to comments, sending DM responses, or analyzing trends. Credits reset monthly based on your plan. Starter gets 300 credits, Growth gets 1,200, and Pro gets 3,000 credits. Unused credits don't roll over, so use them!",
    category: 'Pricing'
  },
  {
    q: 'Which platforms does VeeFore support?',
    a: "We're launching with full Instagram support (posts, reels, stories, DMs). TikTok, YouTube Shorts, and Twitter/X integrations are on our roadmap for Q2 2025. Beta users will get early access to new platform integrations as they roll out.",
    category: 'Platforms'
  },
  {
    q: 'What do I get by joining the beta waitlist?',
    a: "Beta members receive exclusive perks: 500 bonus credits on launch, access to a surprise feature we haven't announced yet, 30 days free trial (vs. 14 days for regular users), founding member pricing locked in forever, and direct access to our team for feedback and support. Plus, you'll help shape the product roadmap.",
    category: 'Beta'
  },
  {
    q: 'Who is VeeFore built for?',
    a: "VeeFore is designed for Instagram creators with 5K-500K followers, personal brands, coaches, agencies managing multiple accounts, and e-commerce brands using social for sales. If you're serious about growth and value your time, VeeFore is for you. Not ideal for casual posters or hobby accounts.",
    category: 'About'
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, absolutely. No contracts, no commitments. You can cancel your subscription at any time from your dashboard. Your access continues until the end of your billing period. We believe in earning your business every month, not locking you in.',
    category: 'Pricing'
  }
]
