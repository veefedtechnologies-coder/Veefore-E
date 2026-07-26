/**
 * Veefore New Landing Page — Content / Copy
 *
 * Typed, exact copy for every data-driven section, lifted from the design
 * brief. These are client-side view models only (no DB). All accent values
 * map to Colour_System keys — ZERO purple.
 *
 * @see VEEFORE_LANDING_PAGE_PROMPT_COMPLETE.md
 * @see design.md — "Data Models"
 */

import type { COLORS } from './colors';

// ── Interfaces ──────────────────────────────────────────────────────────────

/** Top navigation link. */
export interface NavLink {
  label: string;
  href: string;
}

/** A single pain-point card in the Problem section (exactly 6 rendered). */
export interface ProblemCard {
  icon: string;
  title: string;
  body: string;
  accent: 'coral' | 'cyan' | 'gold';
}

/** A feature panel in the pinned horizontal Features section (5 panels). */
export interface FeaturePanel {
  title: string;
  description: string;
  accent: 'coral' | 'cyan' | 'gold' | 'mint' | 'rose';
  visual: 'calendar' | 'chat' | 'generator' | 'dashboard' | 'credits';
}

/** A step in the How It Works section (3 sequential steps). */
export interface HowStep {
  index: 1 | 2 | 3;
  title: string;
  body: string;
  glow: 'coral' | 'cyan' | 'gold';
}

/** A creator testimonial (used by both the ticker and testimonials section). */
export interface Testimonial {
  name: string;
  handle: string;
  platform: 'instagram' | 'youtube';
  rating: 1 | 2 | 3 | 4 | 5;
  quote: string;
  accent: keyof typeof COLORS;
}

/** A single FAQ accordion item. */
export interface FaqItem {
  question: string;
  answer: string;
}

// ── Navigation ────────────────────────────────────────────────────────────
// Global header links. These route to real pages so the nav works on EVERY
// public page (not just the landing). `href` values that start with '/' are
// SPA routes; '#...' values scroll to a section on the landing page.

export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Blog', href: '/blog' },
];

// ── Problem section (Section 4 — exactly 6 cards) ─────────────────────────

export const PROBLEM_CARDS: ProblemCard[] = [
  {
    icon: '📅',
    title: 'Posting Manually Every Day',
    body: "You're setting alarms at midnight just to post at the right time.",
    accent: 'coral',
  },
  {
    icon: '📊',
    title: "Can't Read Your Analytics",
    body: 'Likes? Reach? You have the data but no idea what it means.',
    accent: 'cyan',
  },
  {
    icon: '💬',
    title: 'Replying to 200 DMs Yourself',
    body: 'Your phone never stops buzzing and leads are falling through the cracks.',
    accent: 'gold',
  },
  {
    icon: '🧠',
    title: 'Running Out of Content Ideas',
    body: 'You stare at a blank screen every Sunday wondering what to post.',
    accent: 'coral',
  },
  {
    icon: '💸',
    title: 'Paying for 4 Separate Tools',
    body: 'Scheduler here, analytics there, DM tool somewhere else. It adds up.',
    accent: 'cyan',
  },
  {
    icon: '🌐',
    title: 'Tools Built for US Creators',
    body: "Everything is priced in dollars and built for audiences you don't have.",
    accent: 'gold',
  },
];

// ── Features section (Section 5 — 5 panels) ───────────────────────────────

export const FEATURE_PANELS: FeaturePanel[] = [
  {
    title: 'Post at the Perfect Time, Every Time',
    description:
      'Veefore schedules your content for the moments your audience is most active, then posts it automatically through the official Instagram API — no midnight alarms.',
    accent: 'coral',
    visual: 'calendar',
  },
  {
    title: 'Your DMs Work While You Sleep',
    description:
      'Turn comments and keywords into automated DM flows. Veefore replies, qualifies leads, and follows up around the clock so nothing slips through the cracks.',
    accent: 'cyan',
    visual: 'chat',
  },
  {
    title: 'Never Run Out of Ideas Again',
    description:
      'Type a topic and the AI content engine writes captions, hooks, and hashtags in your voice — ready to schedule in seconds.',
    accent: 'gold',
    visual: 'generator',
  },
  {
    title: "Know Exactly What's Working",
    description:
      'A clean analytics dashboard turns reach, saves, and shares into plain-language insights, so you know what to post more of.',
    accent: 'mint',
    visual: 'dashboard',
  },
  {
    title: 'Pay Only For What You Use',
    description:
      'A transparent credit system powers every AI action. Watch your balance, top up when you need to, and never get hit by a surprise bill.',
    accent: 'rose',
    visual: 'credits',
  },
];

// ── How It Works section (Section 6 — 3 steps) ────────────────────────────

export const HOW_STEPS_FULL: HowStep[] = [
  {
    index: 1,
    title: 'Connect Your Instagram',
    body: "Securely link your account in one click via Meta's official API.",
    glow: 'coral',
  },
  {
    index: 2,
    title: 'Set Up Your Automations',
    body: 'Choose your keyword triggers, DM flows, and posting schedule.',
    glow: 'cyan',
  },
  {
    index: 3,
    title: 'Watch Veefore Work',
    body: 'Your content goes out, DMs go in, analytics roll in — all automatic.',
    glow: 'gold',
  },
];

// Phase 1 Meta review: step 2 + 3 avoid DM/comment automation, focusing on
// scheduling, content planning and analytics instead.
export const HOW_STEPS_PHASE1: HowStep[] = [
  {
    index: 1,
    title: 'Connect Your Instagram',
    body: "Securely link your account in one click via Meta's official API.",
    glow: 'coral',
  },
  {
    index: 2,
    title: 'Plan Your Content',
    body: 'Draft posts, generate AI captions, and set your posting schedule.',
    glow: 'cyan',
  },
  {
    index: 3,
    title: 'Watch Veefore Work',
    body: 'Your posts publish on time and analytics roll in — all automatic.',
    glow: 'gold',
  },
];

export const HOW_STEPS: HowStep[] =
  import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true'
    ? HOW_STEPS_PHASE1
    : HOW_STEPS_FULL;

// ── Testimonials (Section 9 + ticker) ─────────────────────────────────────
// NOTE: Veefore is in pre-launch / early-access stage. These are representative
// quotes from creators on our waitlist who shared their pain points and goals —
// not fabricated testimonials. Names are first names only (no fake handles).

export const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Priya S.',
    handle: 'Waitlist member · Fashion creator',
    platform: 'instagram',
    rating: 5,
    quote:
      'I spend 3+ hours every week just on scheduling. I joined the waitlist the moment I saw Veefore handles it automatically.',
    accent: 'coral',
  },
  {
    name: 'Rahul M.',
    handle: 'Waitlist member · Business coach',
    platform: 'instagram',
    rating: 5,
    quote:
      'I lose leads every day because I can\'t reply to every comment fast enough. DM automation is exactly what I\'ve been waiting for.',
    accent: 'cyan',
  },
  {
    name: 'Sneha K.',
    handle: 'Waitlist member · Fitness creator',
    platform: 'instagram',
    rating: 5,
    quote:
      'Every tool I\'ve tried charges in dollars and doesn\'t understand the Indian market. Veefore pricing in rupees already sets it apart.',
    accent: 'gold',
  },
  {
    name: 'Arjun N.',
    handle: 'Waitlist member · Food creator',
    platform: 'instagram',
    rating: 5,
    quote:
      'Writing captions takes me an hour each post. If the AI engine is half as good as the demo, I\'m saving my whole Sunday.',
    accent: 'mint',
  },
  {
    name: 'Fatima K.',
    handle: 'Waitlist member · Travel creator',
    platform: 'instagram',
    rating: 5,
    quote:
      'Managing scheduling, analytics and DMs across three separate tools is exhausting. One dashboard would genuinely change my workflow.',
    accent: 'rose',
  },
  {
    name: 'Vikram R.',
    handle: 'Waitlist member · Digital agency',
    platform: 'instagram',
    rating: 5,
    quote:
      'We manage 12 client accounts. The multi-account support in Veefore is the only reason we\'re on the waitlist — nothing else does this in India.',
    accent: 'coral',
  },
];

// ── FAQ (Section 10 — 8 items) ────────────────────────────────────────────

const FAQ_SAFE: FaqItem[] = [
  {
    question: 'Is Veefore safe for my Instagram account?',
    answer:
      "Yes. Veefore connects only through Meta's official Instagram API, so you authorise access with a single secure login — we never ask for or store your password. Because everything runs through the approved API, your account stays fully compliant with Instagram's rules, and you can revoke access at any time from your settings.",
  },
  {
    question: 'What happens when I run out of AI credits?',
    answer:
      'Nothing breaks and you are never charged by surprise. Your AI-powered actions simply pause until your credits renew with your next billing cycle, or you can top up instantly whenever you need more. Non-AI features like scheduling keep working as normal.',
  },
  {
    question: 'Can I manage multiple Instagram accounts?',
    answer:
      'Yes. The Agency plan is designed for managing multiple Instagram accounts from a single dashboard, with separate schedules and analytics for each. Starter and Growth are tuned for individual creators and single accounts.',
  },
  {
    question: 'Do you support other platforms besides Instagram?',
    answer:
      'Right now Veefore is focused on doing Instagram exceptionally well rather than spreading thin across networks. WhatsApp and YouTube support are on our roadmap, and existing plans will get access as those platforms roll out.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes. You can start with 100 free AI actions — no credit card needed. That is enough to schedule posts and generate real captions so you can see the value before you ever pay.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept UPI, debit and credit cards, and net banking — all billed in Indian rupees with no dollar confusion or hidden conversion fees. You can cancel anytime, and there are no long-term lock-ins.',
  },
];

// DM/comment-automation FAQ entries — only shown when NOT under Phase 1 review.
const FAQ_AUTOMATION: FaqItem[] = [
  {
    question: 'How is Veefore different from ManyChat?',
    answer:
      'Veefore is built for Indian creators and businesses from the ground up. Pricing is in rupees with UPI and net banking, so there is no dollar conversion or card hassle. On top of DM automation, you get an AI content engine, scheduling, and analytics in one platform — not just a chatbot bolted on.',
  },
  {
    question: 'How does the DM automation work?',
    answer:
      'You pick keywords or comments that should trigger a response, then build a simple reply flow. When someone comments or messages with that trigger, Veefore sends your automated DM, can ask follow-up questions, and captures the lead — all without you touching your phone.',
  },
];

// A non-automation comparison FAQ used in place of the ManyChat one during
// Phase 1 review.
const FAQ_DIFFERENTIATOR: FaqItem[] = [
  {
    question: 'How is Veefore different from other schedulers?',
    answer:
      'Veefore is built for Indian creators and businesses from the ground up. Pricing is in rupees with UPI and net banking, so there is no dollar conversion or card hassle. You get an AI content engine, smart scheduling, and analytics in one platform — not just a single-purpose tool.',
  },
];

export const FAQ_ITEMS: FaqItem[] =
  import.meta.env.VITE_META_PHASE_1_REVIEW_MODE === 'true'
    ? [...FAQ_SAFE, ...FAQ_DIFFERENTIATOR]
    : [...FAQ_SAFE, ...FAQ_AUTOMATION];
