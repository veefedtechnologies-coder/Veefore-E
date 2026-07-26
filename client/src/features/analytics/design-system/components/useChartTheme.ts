/**
 * useChartTheme — resolves theme-aware axis/grid colours for charts. Recharts
 * renders SVG, which cannot use Tailwind `dark:` classes for stroke/fill, so we
 * derive concrete colours from the active theme (CODING_RULES Rule 5 theme-aware).
 */

import { useTheme } from '@/hooks/useTheme'
import { CHART_AXIS } from '../tokens'

export function useChartTheme() {
  const { currentTheme } = useTheme()
  const isDark = currentTheme !== 'light'
  return {
    isDark,
    axis: isDark ? CHART_AXIS.dark : CHART_AXIS.light,
  }
}
