/**
 * WidgetActionsMenu — the consistent per-widget action menu (05-widget-library.md
 * Ch 16 Widget Interactions): refresh, export, AI explain, fullscreen, and
 * drill-down. Only actions with a handler/target are shown; the menu itself is
 * omitted entirely when there are no actions.
 */

import { useLocation } from 'wouter'
import { Download, Maximize2, MoreHorizontal, RefreshCw, Sparkles, ArrowUpRight } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { FOCUS_RING_CLASS } from '../design-system/tokens'
import type { DrillDownTarget } from '../dashboard'

interface WidgetActionsMenuProps {
  onRefresh?: () => void
  onExport?: () => void
  onExplain?: () => void
  onFullscreen?: () => void
  drillDown?: DrillDownTarget
}

export function WidgetActionsMenu({
  onRefresh,
  onExport,
  onExplain,
  onFullscreen,
  drillDown,
}: WidgetActionsMenuProps) {
  const [, setLocation] = useLocation()

  const hasAny = onRefresh || onExport || onExplain || onFullscreen || drillDown
  if (!hasAny) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Widget actions"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200',
          FOCUS_RING_CLASS
        )}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      >
        {drillDown && (
          <DropdownMenuItem onClick={() => setLocation(drillDown.path)} className="gap-2">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            {drillDown.label ?? 'View details'}
          </DropdownMenuItem>
        )}
        {onExplain && (
          <DropdownMenuItem onClick={onExplain} className="gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Explain with AI
          </DropdownMenuItem>
        )}
        {onRefresh && (
          <DropdownMenuItem onClick={onRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </DropdownMenuItem>
        )}
        {onExport && (
          <DropdownMenuItem onClick={onExport} className="gap-2">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export
          </DropdownMenuItem>
        )}
        {onFullscreen && (
          <DropdownMenuItem onClick={onFullscreen} className="gap-2">
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            Fullscreen
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
