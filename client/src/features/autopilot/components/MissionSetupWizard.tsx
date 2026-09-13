/**
 * MissionSetupWizard
 *
 * The Mission setup form for VeeGPT Auto Pilot (R1). It captures the Goal
 * (metric + target value + optional target date), niche, brand voice, operating
 * mode, content-source preference, and Guardrails (banned topics, posting
 * frequency, credit budget), validates them client-side against the mission
 * model bounds, and submits `POST /api/v1/autopilot/missions`.
 *
 * On any rejected submission — client validation OR a server error — the form
 * RETAINS the user's entered values and surfaces a message identifying the
 * problem (R1.3, R1.4); nothing is cleared.
 *
 * The network call is injected (`submitMission`, defaulting to the real API) so
 * the component's validation + retained-values behaviour is unit-testable
 * without a live backend. Workspace/account resolution is the parent's job
 * (AutoPilotPage) and passed in as props.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import React, { useState } from 'react'
import { Rocket, AlertCircle, Loader2, Instagram } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createMission, type Mission } from '../api/autopilotApi'
import {
  MISSION_BOUNDS,
  buildCreateMissionPayload,
  defaultMissionFormValues,
  isMissionFormValid,
  validateMissionForm,
  type MissionFormErrors,
  type MissionFormValues,
} from './missionForm'

export interface MissionSetupWizardProps {
  /** Active workspace the mission is bound to. */
  workspaceId?: string
  /** Connected Instagram account id the mission targets. */
  accountId?: string | null
  /** Whether the workspace has a connected Instagram account (R1.6). */
  hasConnectedAccount: boolean
  /** Platform for the mission (v1: instagram). */
  platform?: string
  /** Called with the created mission on success. */
  onCreated?: (mission: Mission) => void
  /** Cancel / back action, when rendered alongside other views. */
  onCancel?: () => void
  /** Injectable submit (defaults to the real API) — enables isolated testing. */
  submitMission?: (payload: ReturnType<typeof buildCreateMissionPayload>) => Promise<Mission>
  /** Seed values (e.g. for re-editing); merged over the defaults. */
  initialValues?: Partial<MissionFormValues>
  /**
   * Render as an inline card (no outer page centering/padding, no big hero
   * header) so the form can live inside the Auto Pilot chat as a bot message.
   */
  embedded?: boolean
}

const fieldError = (errors: MissionFormErrors, field: keyof MissionFormValues) =>
  errors[field] ? (
    <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
      {errors[field]}
    </p>
  ) : null

const labelClass = 'text-gray-900 dark:text-gray-100'
const helpClass = 'text-xs text-gray-500 dark:text-gray-400'
const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export const MissionSetupWizard: React.FC<MissionSetupWizardProps> = ({
  workspaceId,
  accountId,
  hasConnectedAccount,
  platform = 'instagram',
  onCreated,
  onCancel,
  submitMission = createMission,
  initialValues,
  embedded = false,
}) => {
  const [values, setValues] = useState<MissionFormValues>({
    ...defaultMissionFormValues,
    ...initialValues,
  })
  const [errors, setErrors] = useState<MissionFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // R1.6 — cannot create a mission without a connected Instagram account.
  if (!hasConnectedAccount) {
    return (
      <div className={embedded ? 'text-center py-4' : 'max-w-xl mx-auto px-6 py-16 text-center'}>
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-50 dark:bg-pink-900/20 mb-5">
          <Instagram className="h-7 w-7 text-pink-600 dark:text-pink-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Connect an Instagram account
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Auto Pilot needs a connected Instagram account before you can create a
          mission. Connect one in Settings, then come back to set your goal.
        </p>
      </div>
    )
  }

  const update =
    <K extends keyof MissionFormValues>(field: K) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.target.value as MissionFormValues[K]
      setValues((prev) => ({ ...prev, [field]: value }))
      // Clear the field-level error as the user corrects it; keep every other
      // entered value intact.
      setErrors((prev) => {
        if (!prev[field]) return prev
        const next = { ...prev }
        delete next[field]
        return next
      })
    }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitError(null)

    const nextErrors = validateMissionForm(values)
    if (!isMissionFormValid(nextErrors)) {
      // Reject the submission but RETAIN the entered values (R1.3, R1.4).
      setErrors(nextErrors)
      setSubmitError('Please fix the highlighted fields before creating your mission.')
      return
    }
    setErrors({})

    if (!workspaceId || !accountId) {
      setSubmitError('No active workspace or connected account was found.')
      return
    }

    const payload = buildCreateMissionPayload(values, { workspaceId, accountId, platform })

    setSubmitting(true)
    try {
      const mission = await submitMission(payload)
      onCreated?.(mission)
    } catch (err) {
      // Server rejected the submission — keep the form values so the user can
      // correct and retry (R1.3, R1.4).
      const message = err instanceof Error ? err.message : 'Failed to create the mission.'
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={embedded ? 'space-y-8' : 'max-w-2xl mx-auto px-6 py-10 space-y-8'}
    >
      {!embedded && (
        <header className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20 mb-4">
            <Rocket className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Create a mission</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Set a goal and your guardrails. Auto Pilot plans, creates, and schedules
            content to reach it.
          </p>
        </header>
      )}

      {submitError && (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* ── Goal ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Goal
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ap-goal-metric" className={labelClass}>
              Metric
            </Label>
            <select
              id="ap-goal-metric"
              className={`${selectClass} mt-1`}
              value={values.goalMetric}
              onChange={update('goalMetric')}
            >
              <option value="followers">Followers</option>
              <option value="engagement">Engagement</option>
              <option value="reach">Reach</option>
            </select>
          </div>

          <div>
            <Label htmlFor="ap-target-value" className={labelClass}>
              Target value
            </Label>
            <Input
              id="ap-target-value"
              className="mt-1"
              type="number"
              inputMode="numeric"
              min={MISSION_BOUNDS.targetValue.min}
              max={MISSION_BOUNDS.targetValue.max}
              placeholder="10000"
              value={values.targetValue}
              onChange={update('targetValue')}
              aria-invalid={Boolean(errors.targetValue)}
            />
            {fieldError(errors, 'targetValue')}
          </div>
        </div>

        <div>
          <Label htmlFor="ap-target-date" className={labelClass}>
            Target date <span className={helpClass}>(optional)</span>
          </Label>
          <Input
            id="ap-target-date"
            className="mt-1"
            type="date"
            value={values.targetDate}
            onChange={update('targetDate')}
            aria-invalid={Boolean(errors.targetDate)}
          />
          {fieldError(errors, 'targetDate')}
        </div>
      </section>

      {/* ── Brand ────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Brand
        </h2>

        <div>
          <Label htmlFor="ap-niche" className={labelClass}>
            Niche
          </Label>
          <Input
            id="ap-niche"
            className="mt-1"
            maxLength={MISSION_BOUNDS.niche.max}
            placeholder="e.g. vegan meal prep for busy parents"
            value={values.niche}
            onChange={update('niche')}
            aria-invalid={Boolean(errors.niche)}
          />
          {fieldError(errors, 'niche')}
        </div>

        <div>
          <Label htmlFor="ap-brand-voice" className={labelClass}>
            Brand voice
          </Label>
          <Textarea
            id="ap-brand-voice"
            className="mt-1"
            rows={4}
            maxLength={MISSION_BOUNDS.brandVoice.max}
            placeholder="Warm, upbeat, and practical. Speak like a friendly coach; avoid jargon."
            value={values.brandVoice}
            onChange={update('brandVoice')}
            aria-invalid={Boolean(errors.brandVoice)}
          />
          <p className={`mt-1 ${helpClass}`}>
            {values.brandVoice.trim().length}/{MISSION_BOUNDS.brandVoice.max}
          </p>
          {fieldError(errors, 'brandVoice')}
        </div>

        <div>
          <Label htmlFor="ap-local-language" className={labelClass}>
            Local language <span className={helpClass}>(optional, defaults to English)</span>
          </Label>
          <Input
            id="ap-local-language"
            className="mt-1"
            placeholder="e.g. Spanish"
            value={values.localLanguage}
            onChange={update('localLanguage')}
          />
        </div>
      </section>

      {/* ── Operating mode ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Operating mode
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ap-operating-mode" className={labelClass}>
              Mode
            </Label>
            <select
              id="ap-operating-mode"
              className={`${selectClass} mt-1`}
              value={values.operatingMode}
              onChange={update('operatingMode')}
            >
              <option value="copilot">Copilot — approve everything</option>
              <option value="autopilot">Autopilot — run within guardrails</option>
            </select>
          </div>

          <div>
            <Label htmlFor="ap-content-source" className={labelClass}>
              Content source
            </Label>
            <select
              id="ap-content-source"
              className={`${selectClass} mt-1`}
              value={values.contentSourcePreference}
              onChange={update('contentSourcePreference')}
            >
              <option value="user-first">Your media first, AI as backup</option>
              <option value="ai-first">AI-generated first</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Guardrails ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Guardrails
        </h2>

        <div>
          <Label htmlFor="ap-banned-topics" className={labelClass}>
            Banned topics <span className={helpClass}>(comma separated)</span>
          </Label>
          <Textarea
            id="ap-banned-topics"
            className="mt-1"
            rows={2}
            placeholder="politics, competitor names, discount codes"
            value={values.bannedTopics}
            onChange={update('bannedTopics')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="ap-posting-count" className={labelClass}>
              Max posts
            </Label>
            <Input
              id="ap-posting-count"
              className="mt-1"
              type="number"
              inputMode="numeric"
              min={MISSION_BOUNDS.postingCount.min}
              value={values.postingCount}
              onChange={update('postingCount')}
              aria-invalid={Boolean(errors.postingCount)}
            />
            {fieldError(errors, 'postingCount')}
          </div>

          <div>
            <Label htmlFor="ap-posting-per" className={labelClass}>
              Per
            </Label>
            <select
              id="ap-posting-per"
              className={`${selectClass} mt-1`}
              value={values.postingPer}
              onChange={update('postingPer')}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
            </select>
          </div>

          <div>
            <Label htmlFor="ap-credit-budget" className={labelClass}>
              Credit budget
            </Label>
            <Input
              id="ap-credit-budget"
              className="mt-1"
              type="number"
              inputMode="numeric"
              min={MISSION_BOUNDS.creditBudget.min}
              max={MISSION_BOUNDS.creditBudget.max}
              value={values.creditBudget}
              onChange={update('creditBudget')}
              aria-invalid={Boolean(errors.creditBudget)}
            />
            {fieldError(errors, 'creditBudget')}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating…
            </>
          ) : (
            'Create mission'
          )}
        </Button>
      </div>
    </form>
  )
}

export default MissionSetupWizard
