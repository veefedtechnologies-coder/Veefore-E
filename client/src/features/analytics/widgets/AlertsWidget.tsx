/**
 * AlertsWidget — a list of alerts inside the standard widget frame
 * (05-widget-library.md Ch 15; 06-dashboard-specifications.md Ch 1 Alerts
 * section). Presentation-only.
 */

import { WidgetFrame } from './WidgetFrame'
import { AlertWidget } from './AlertWidget'
import type { AlertItem, WidgetBaseProps } from './types'

interface AlertsWidgetProps extends WidgetBaseProps {
  alerts?: AlertItem[]
  onDismiss?: (id: string) => void
}

export function AlertsWidget({ alerts = [], onDismiss, ...frame }: AlertsWidgetProps) {
  const state = frame.state ?? (alerts.length > 0 ? 'ready' : 'empty')

  return (
    <WidgetFrame
      {...frame}
      state={state}
      bodyMinHeight={120}
      emptyMessage={frame.emptyMessage ?? 'No alerts right now.'}
    >
      <ul className="space-y-3">
        {alerts.map((alert) => (
          <li key={alert.id}>
            <AlertWidget alert={alert} onDismiss={onDismiss} />
          </li>
        ))}
      </ul>
    </WidgetFrame>
  )
}
