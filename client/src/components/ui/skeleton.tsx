import { cn } from "@/lib/utils"

/**
 * Skeleton primitive — the single, documented placeholder building block for the
 * Veefore skeleton loading system. Import path: `@/components/ui/skeleton`.
 *
 * Renders exactly one shimmering placeholder block. Shape/border-radius is chosen
 * by `variant`; color and animation come from the global `.vf-skeleton` class and
 * per-theme CSS variables defined in `index.css` (no inline `<style>` or inline
 * `animation` is ever emitted). Always `aria-hidden`, and renders zero text glyphs.
 *
 * See spec: pixel-perfect-skeleton-loading (R1, R6, R7, R11).
 */

/** The frozen nine-member set of supported skeleton variants (R1.2). */
export const SKELETON_VARIANTS = [
  'text', 'avatar', 'button', 'card', 'chart',
  'table', 'circle', 'rectangle', 'pill',
] as const

export type SkeletonVariant = typeof SKELETON_VARIANTS[number]

/** Variant applied when none is supplied or an unknown value is given (R1.4, R1.5). */
export const DEFAULT_VARIANT: SkeletonVariant = 'rectangle'

/**
 * Maps each supported variant to its default shape / border-radius utility classes.
 * Consumer `className` always wins over these via tailwind-merge last-wins (R1.6).
 */
export const VARIANT_BASE_CLASS: Record<SkeletonVariant, string> = {
  text: 'h-4 rounded',
  avatar: 'rounded-full aspect-square',
  button: 'h-10 rounded-md',
  card: 'rounded-xl',
  chart: 'rounded-md',
  table: 'rounded-md',
  circle: 'rounded-full',
  rectangle: 'rounded-md',
  pill: 'h-6 rounded-full',
}

/** Global shimmer base class (keyframes + theme colors live in index.css). */
export const BASE_SHIMMER_CLASS = 'vf-skeleton'

/**
 * Normalizes an arbitrary value to a supported variant. Any value not in the
 * supported set (unknown strings, numbers, null, undefined, objects) falls back
 * to `rectangle` so the primitive always renders a visible block (R1.4, R1.5).
 */
export function normalizeVariant(v: unknown): SkeletonVariant {
  return (typeof v === 'string' && (SKELETON_VARIANTS as readonly string[]).includes(v))
    ? (v as SkeletonVariant)
    : DEFAULT_VARIANT
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual shape. Defaults to 'rectangle'. Unknown values fall back to 'rectangle'. */
  variant?: SkeletonVariant
  className?: string
}

function Skeleton({ variant, className, children: _children, ...props }: SkeletonProps) {
  // `children` are intentionally dropped: the painted output must contain zero
  // final-component text glyphs (R1.8, R1.9).
  return (
    <div
      aria-hidden="true"
      className={cn(
        BASE_SHIMMER_CLASS,
        VARIANT_BASE_CLASS[normalizeVariant(variant)],
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
