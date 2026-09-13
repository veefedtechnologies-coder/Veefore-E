/**
 * MissionSetupForm
 *
 * The DYNAMIC, modern slide-up sheet that appears above the Auto Pilot composer
 * during setup. It renders only the fields the AI decided are still needed
 * ({@link SetupFieldSpec}[]) — never a fixed form. The design favours simplicity:
 * choice fields are tap-to-select pills (no dropdowns), numbers/text use clean
 * rounded inputs, and a subtle header shows how many required fields remain.
 *
 * Requirements: 1.1, 1.3, 1.4
 */

import React, { useMemo, useState } from 'react'
import {
  Ban,
  CalendarClock,
  Check,
  Globe,
  Hash,
  Layers,
  Palette,
  Repeat,
  Sliders,
  Sparkles,
  Target,
  Wallet,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SetupFieldSpec, SetupValues } from '../api/autopilotApi'

export interface MissionSetupFormProps {
  fields: SetupFieldSpec[]
  values: SetupValues
  onApply: (patch: SetupValues) => void
  onDismiss: () => void
  submitting?: boolean
}

type Draft = Record<string, string>

const FIELD_ICON: Partial<Record<keyof SetupValues, React.ComponentType<{ className?: string }>>> = {
  goalMetric: Target,
  targetValue: Target,
  targetDate: CalendarClock,
  niche: Hash,
  brandVoice: Palette,
  localLanguage: Globe,
  operatingMode: Sliders,
  contentSourcePreference: Layers,
  postingCount: Repeat,
  postingPer: Repeat,
  creditBudget: Wallet,
  bannedTopics: Ban,
}

function seedDraft(fields: SetupFieldSpec[], values: SetupValues): Draft {
  const d: Draft = {}
  for (const f of fields) {
    const v = values[f.key]
    d[f.key] = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v)
  }
  return d
}

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900/60 dark:text-gray-100 dark:focus:bg-slate-900 dark:focus:ring-blue-500/20'

export const MissionSetupForm: React.FC<MissionSetupFormProps> = ({
  fields,
  values,
  onApply,
  onDismiss,
  submitting = false,
}) => {
  const [draft, setDraft] = useState<Draft>(() => seedDraft(fields, values))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const requiredRemaining = useMemo(
    () => fields.filter((f) => f.required && !(draft[f.key] ?? '').trim()).length,
    [fields, draft],
  )

  const set = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleSave = () => {
    const nextErrors: Record<string, string> = {}
    const patch: SetupValues = {}

    for (const f of fields) {
      const raw = (draft[f.key] ?? '').trim()
      if (!raw) {
        if (f.required) nextErrors[f.key] = `${f.label} is required.`
        continue
      }
      switch (f.type) {
        case 'number': {
          const n = Number(raw.replace(/[,\s]/g, ''))
          if (!Number.isFinite(n)) {
            nextErrors[f.key] = `${f.label} must be a number.`
            break
          }
          ;(patch as Record<string, unknown>)[f.key] = Math.round(n)
          break
        }
        case 'tags': {
          ;(patch as Record<string, unknown>)[f.key] = raw
            .split(/[,\n]/)
            .map((t) => t.trim())
            .filter(Boolean)
          break
        }
        default:
          ;(patch as Record<string, unknown>)[f.key] = raw
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    onApply(patch)
  }

  return (
    <div className="mb-2 overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              A few details to finish
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {requiredRemaining > 0
                ? `${requiredRemaining} required ${requiredRemaining === 1 ? 'field' : 'fields'} left`
                : 'All set — add to your mission'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="max-h-[46vh] space-y-4 overflow-y-auto px-5 py-4">
        {fields.map((f) => {
          const Icon = FIELD_ICON[f.key] ?? Sparkles
          return (
            <div key={f.key}>
              <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-200">
                <Icon className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                {f.label}
                {!f.required && (
                  <span className="text-[11px] font-normal text-gray-400">optional</span>
                )}
              </label>

              {f.type === 'select' ? (
                <div className="flex flex-wrap gap-2">
                  {(f.options ?? []).map((o) => {
                    const active = (draft[f.key] ?? '') === o.value
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => set(f.key, o.value)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all ${
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-400/50 dark:bg-blue-500/15 dark:text-blue-300'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900/40 dark:text-gray-300 dark:hover:bg-white/5'
                        }`}
                      >
                        {active && <Check className="h-3.5 w-3.5" />}
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              ) : f.type === 'textarea' ? (
                <textarea
                  className={inputClass}
                  rows={2}
                  placeholder={f.placeholder}
                  value={draft[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : (
                <input
                  className={inputClass}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  placeholder={f.placeholder}
                  value={draft[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}

              {f.help && !errors[f.key] && (
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{f.help}</p>
              )}
              {errors[f.key] && (
                <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{errors[f.key]}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3 dark:border-white/10">
        <Button size="sm" variant="ghost" onClick={onDismiss} disabled={submitting}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={submitting}>
          Add to mission
        </Button>
      </div>
    </div>
  )
}

export default MissionSetupForm
