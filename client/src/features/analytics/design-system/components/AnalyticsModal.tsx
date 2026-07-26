/**
 * AnalyticsModal — the standard analytics dialog, built on the shared Dialog
 * primitive (04-dashboard-architecture.md — Modals). Used for export, share,
 * schedule report, and detail views. Provides consistent sizing, header
 * (title + description), body, and an optional footer.
 *
 * Accessibility (focus trap, Escape, labelling) is handled by the underlying
 * Radix dialog (CODING_RULES Rule 14).
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

interface AnalyticsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  size?: ModalSize
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AnalyticsModal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  children,
  className,
}: AnalyticsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
          SIZE_CLASS[size],
          className
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2">{children}</div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
