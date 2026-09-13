/**
 * useMissionSetupAI
 *
 * AI-driven Auto Pilot setup. The user describes their mission in natural
 * language; the server ({@link interpretSetup}) runs an AI model that extracts
 * whatever mission settings it can, validates them, and returns a friendly
 * reply plus a DYNAMIC form spec for whatever is still missing/worth improving.
 * This hook owns the conversation, the accumulated values, the current slide-up
 * form spec, and the launch. It never asks a fixed list of questions — the model
 * decides what's needed each turn.
 *
 * The slide-up form the client renders is driven entirely by `formFields`
 * returned from the server (missing required + AI-recommended optional). When
 * the user fills it, values merge locally and required-completeness is
 * re-checked against {@link REQUIRED_SETUP_FIELDS} so launch never depends on
 * the model alone.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  adviseSetup,
  createMission,
  interpretSetup,
  REQUIRED_SETUP_FIELDS,
  type Mission,
  type SetupFieldSpec,
  type SetupValues,
} from '../api/autopilotApi'
import { buildPayloadFromSetupValues } from './missionForm'

export interface SetupChatMessage {
  id: number
  role: 'bot' | 'user'
  text: string
}

export interface UseMissionSetupAIOptions {
  workspaceId?: string
  accountId?: string | null
  platform?: string
  onCreated?: (mission: Mission) => void
  /** Injectable for tests. */
  interpret?: typeof interpretSetup
  submitMission?: typeof createMission
}

export interface UseMissionSetupAI {
  messages: SetupChatMessage[]
  values: SetupValues
  formFields: SetupFieldSpec[]
  missingRequired: (keyof SetupValues)[]
  readyToLaunch: boolean
  started: boolean
  loading: boolean
  submitting: boolean
  /** Cadence advice shown once the mission is ready (or null). */
  frequencySuggestion: FrequencySuggestion | null
  /** Send a natural-language message to the AI interpreter. */
  sendPrompt: (text: string) => void
  /** Merge slide-up form values, re-check completeness locally. */
  applyForm: (patch: SetupValues) => void
  /** Hide the slide-up form without discarding values. */
  dismissForm: () => void
  /** Accept the recommended cadence (bumps postingCount to it, per week). */
  applyFrequencyBoost: () => void
  /** Dismiss the cadence suggestion, keeping the user's chosen rate. */
  dismissFrequencySuggestion: () => void
  /** Create the mission from the collected values. */
  launch: () => void
}

function localMissing(values: SetupValues): (keyof SetupValues)[] {
  return REQUIRED_SETUP_FIELDS.filter((k) => {
    const v = values[k]
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
  })
}

/** A data-grounded cadence recommendation (from the server plan advisor). */
export interface FrequencySuggestion {
  recommendedPerWeek: number
  currentPerWeek: number
  mode: 'copilot' | 'autopilot'
  rationale: string
}

export function useMissionSetupAI({
  workspaceId,
  accountId,
  platform = 'instagram',
  onCreated,
  interpret = interpretSetup,
  submitMission = createMission,
}: UseMissionSetupAIOptions): UseMissionSetupAI {
  const idRef = useRef(1)
  const nextId = () => idRef.current++

  const [messages, setMessages] = useState<SetupChatMessage[]>([])
  const [values, setValues] = useState<SetupValues>({})
  const [formFields, setFormFields] = useState<SetupFieldSpec[]>([])
  const [missingRequired, setMissingRequired] = useState<(keyof SetupValues)[]>(REQUIRED_SETUP_FIELDS)
  const [readyToLaunch, setReadyToLaunch] = useState(false)
  const [started, setStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [frequencySuggestion, setFrequencySuggestion] = useState<FrequencySuggestion | null>(null)
  // Guards so we don't re-advise / repeat the advice message on every render.
  const suggestionHandledRef = useRef(false)
  const adviceRequestedRef = useRef(false)
  // Show the "I analyzed @account" insights line only once.
  const analyzedRef = useRef(false)

  const pushBot = (text: string) =>
    setMessages((prev) => [...prev, { id: nextId(), role: 'bot', text }])
  const pushUser = (text: string) =>
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }])

  /**
   * Once the mission is complete, ask the server plan advisor (which reads the
   * account's DB analytics) whether the cadence is enough + for tips. Copilot →
   * surface an interactive cadence suggestion; Autopilot → notify. Runs once per
   * readiness unless the cadence changes.
   */
  const runAdvice = useCallback(
    async (v: SetupValues) => {
      try {
        const advice = await adviseSetup({ values: v, accountId: accountId ?? undefined, workspaceId })
        setFrequencySuggestion(advice.cadence)
        if (!suggestionHandledRef.current) {
          suggestionHandledRef.current = true
          if (advice.cadence) {
            pushBot(
              advice.cadence.mode === 'autopilot'
                ? `${advice.cadence.rationale} You set ${advice.cadence.currentPerWeek}/week — on Autopilot I’ll stay within your guardrails, but you can raise the cap below.`
                : `${advice.cadence.rationale} You set ${advice.cadence.currentPerWeek}/week — want me to bump it to ${advice.cadence.recommendedPerWeek}?`,
            )
          }
          if (advice.tips.length) {
            pushBot(`A few tips to hit your goal:\n${advice.tips.map((t) => `• ${t}`).join('\n')}`)
          }
        }
      } catch {
        // Advice is best-effort; the mission can still launch without it.
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId],
  )

  // Trigger the advisor when the mission first becomes launch-ready.
  useEffect(() => {
    if (!readyToLaunch) {
      setFrequencySuggestion(null)
      suggestionHandledRef.current = false
      return
    }
    if (adviceRequestedRef.current) return
    adviceRequestedRef.current = true
    void runAdvice(values)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToLaunch])

  const sendPrompt = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || loading || submitting) return
      setStarted(true)
      pushUser(text)
      setLoading(true)
      void (async () => {
        try {
          const res = await interpret({
            message: text,
            currentValues: values,
            accountId: accountId ?? undefined,
            workspaceId,
          })
          setValues(res.values)
          setFormFields(res.formFields)
          setMissingRequired(res.missingRequired)
          setReadyToLaunch(res.readyToLaunch)
          // Prove the analysis happened: on the first turn, surface the real
          // DB numbers for the selected account before the AI's reply.
          if (res.accountContext && !analyzedRef.current) {
            analyzedRef.current = true
            const c = res.accountContext
            const bits: string[] = []
            if (typeof c.followers === 'number') bits.push(`${c.followers.toLocaleString()} followers`)
            if (typeof c.posts === 'number') bits.push(`${c.posts.toLocaleString()} posts`)
            if (typeof c.engagementRate === 'number')
              bits.push(`${c.engagementRate.toFixed(1)}% engagement`)
            if (c.bestTimes && c.bestTimes.length) bits.push(`best time ${c.bestTimes[0]}`)
            if (bits.length) {
              pushBot(
                `📊 I analyzed ${c.username ? `@${c.username}` : 'your account'} — ${bits.join(' · ')}. I’ll factor this into your plan.`,
              )
            }
          }
          pushBot(res.reply)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Something went wrong.'
          pushBot(`I hit a problem understanding that (${msg}). You can try again, or fill the form.`)
        } finally {
          setLoading(false)
        }
      })()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, submitting, values, interpret, accountId],
  )

  const applyForm = useCallback((patch: SetupValues) => {
    setValues((prev) => {
      const next: SetupValues = { ...prev, ...patch }
      const miss = localMissing(next)
      setMissingRequired(miss)
      setReadyToLaunch(miss.length === 0)
      // Drop fields that are now satisfied from the visible form.
      setFormFields((fields) =>
        fields.filter((f) => {
          const v = next[f.key]
          return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
        }),
      )
      pushBot(
        miss.length === 0
          ? 'Perfect — that’s everything. Let me double-check your plan…'
          : 'Got it. A couple more details and we’re set.',
      )
      // The readiness effect triggers the data-grounded advisor when miss === 0.
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissForm = useCallback(() => setFormFields([]), [])

  const applyFrequencyBoost = useCallback(() => {
    const rec = frequencySuggestion?.recommendedPerWeek
    if (!rec) return
    setValues((prev) => ({ ...prev, postingCount: rec, postingPer: 'week' }))
    pushBot(`Done — I’ll aim for ${rec} posts/week to hit your goal.`)
    setFrequencySuggestion(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequencySuggestion])

  const dismissFrequencySuggestion = useCallback(() => {
    setFrequencySuggestion(null)
    pushBot('No problem — I’ll keep your posting rate as you set it.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const launch = useCallback(() => {
    if (submitting) return
    const miss = localMissing(values)
    if (miss.length > 0) {
      setMissingRequired(miss)
      setReadyToLaunch(false)
      pushBot('Almost — I still need a few required details. Fill the form and we’ll launch.')
      return
    }
    if (!workspaceId || !accountId) {
      pushBot('I couldn’t find a connected account or workspace to attach this mission to.')
      return
    }
    setSubmitting(true)
    void (async () => {
      try {
        const payload = buildPayloadFromSetupValues(values, { workspaceId, accountId, platform })
        const mission = await submitMission(payload)
        pushBot('Mission created 🎉 Spinning up your Operating Loop now.')
        onCreated?.(mission)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create the mission.'
        pushBot(`I couldn’t launch it: ${msg}. Want to try again?`)
      } finally {
        setSubmitting(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, values, workspaceId, accountId, platform, submitMission, onCreated])

  return {
    messages,
    values,
    formFields,
    missingRequired,
    readyToLaunch,
    started,
    loading,
    submitting,
    frequencySuggestion,
    sendPrompt,
    applyForm,
    dismissForm,
    applyFrequencyBoost,
    dismissFrequencySuggestion,
    launch,
  }
}
