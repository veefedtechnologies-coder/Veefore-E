/**
 * Canonical list of content niches used across the app.
 *
 * This is the single source of truth for the niche selector shown in onboarding
 * and Settings. The selected value powers AI recommendations, caption
 * generation, the analytics banner, growth insights, and social listening.
 */
export interface NicheOption {
  value: string;
  label: string;
}

export const NICHE_OPTIONS: NicheOption[] = [
  { value: 'tech', label: 'Tech & AI' },
  { value: 'business', label: 'Business & Entrepreneurship' },
  { value: 'marketing', label: 'Marketing & Social Media' },
  { value: 'finance', label: 'Finance & Investing' },
  { value: 'fitness', label: 'Fitness & Health' },
  { value: 'food', label: 'Food & Cooking' },
  { value: 'travel', label: 'Travel' },
  { value: 'fashion', label: 'Fashion & Beauty' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'education', label: 'Education' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'real-estate', label: 'Real Estate' },
];

/** Human-friendly label for a niche value (falls back to the raw value). */
export function nicheLabel(value?: string): string {
  if (!value) return 'Not set';
  return NICHE_OPTIONS.find((n) => n.value === value)?.label || value;
}

/**
 * Return the canonical niche options, guaranteeing the currently-stored value
 * is always present as a selectable option.
 *
 * This matters because the niche was historically a free-text field, so a user
 * may have a stored value (e.g. "fitness coaching") that isn't one of the
 * predefined options. Without this, a radix Select would render blank for that
 * value and look like the niche was never saved.
 */
export function nicheOptionsWith(currentValue?: string): NicheOption[] {
  const value = (currentValue || '').trim();
  if (!value) return NICHE_OPTIONS;
  if (NICHE_OPTIONS.some((n) => n.value === value)) return NICHE_OPTIONS;
  // Prepend the stored value so it can be displayed and re-selected.
  return [{ value, label: nicheLabel(value) }, ...NICHE_OPTIONS];
}

