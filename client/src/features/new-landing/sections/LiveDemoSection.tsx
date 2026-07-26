import { useCallback, useEffect, useRef, useState } from 'react'

import { useLandingMotion } from '../context/LandingMotionProvider'
import { GlowButton } from '../primitives/GlowButton'
import { CaptionApiError, generateCaptions } from '../api/captions'

/** Niche options offered by the Caption_Demo (Requirement 12.1). */
const NICHES = ['Fashion', 'Food', 'Fitness', 'Business', 'Travel', 'Lifestyle'] as const

/** Tone options offered by the Caption_Demo (Requirement 12.1). */
const TONES = ['Motivational', 'Funny', 'Educational', 'Promotional'] as const

/**
 * Finite states for the Caption_Demo interaction.
 *
 * `idle → validating → loading → success | error`
 *
 * - `idle`       — initial / reset state, no request in flight.
 * - `validating` — the generate control was activated; the topic is being
 *                  checked. An empty/whitespace topic surfaces a prompt and
 *                  returns to `idle` WITHOUT calling the proxy (Req 12.6).
 * - `loading`    — a request is in flight; the shimmer skeleton is shown (Req 12.2).
 * - `success`    — three caption cards are rendered (Req 12.3 / 12.4).
 * - `error`      — the proxy errored or returned no captions; a descriptive
 *                  message and a retry affordance are shown (Req 12.7).
 */
type DemoStatus = 'idle' | 'validating' | 'loading' | 'success' | 'error'

/** Number of skeleton/caption cards the demo renders. */
const CARD_COUNT = 3

/** Inline prompt shown when the topic field is empty (Requirement 12.6). */
const EMPTY_TOPIC_PROMPT = 'Please enter a topic for your post first.'

/** Generic fallback error message when the proxy fails (Requirement 12.7). */
const FALLBACK_ERROR =
  "Something went wrong while generating captions. Please try again."

/** Shared field styling for the topic input and selectors. */
const FIELD_CLASSES =
  'w-full rounded-xl border border-white/10 bg-[#040C18] px-4 py-3 text-white ' +
  'placeholder:text-[#3D5166] outline-none transition-colors duration-200 ' +
  'focus:border-[#4C82F7] focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[#4C82F7] focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-[#0A1F3A]'

/**
 * A single caption result card.
 *
 * Renders dark navy `#071428` with a 3px coral left border and a copy control
 * (📋) in the top-right corner that writes the caption text to the clipboard
 * (Requirements 12.3, 12.4). When motion is allowed, the caption text reveals
 * with a lightweight typewriter effect; under reduced motion the full text is
 * shown immediately (Requirement 21.1).
 */
const CaptionCard: React.FC<{
  caption: string
  index: number
  reducedMotion: boolean
}> = ({ caption, index, reducedMotion }) => {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(reducedMotion ? caption : '')
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Optional typewriter reveal. Cards reveal sequentially via a per-card start
  // delay so they appear "one after another" (matching the brief). Suppressed
  // entirely under reduced motion, which shows the final text immediately.
  useEffect(() => {
    if (reducedMotion) {
      setRevealed(caption)
      return
    }

    setRevealed('')
    let charIndex = 0
    let typeTimer: ReturnType<typeof setTimeout> | null = null

    const typeNext = () => {
      charIndex += 1
      setRevealed(caption.slice(0, charIndex))
      if (charIndex < caption.length) {
        typeTimer = setTimeout(typeNext, 18)
      }
    }

    // Stagger the start of each card's reveal.
    const startTimer = setTimeout(typeNext, index * 350)

    return () => {
      clearTimeout(startTimer)
      if (typeTimer !== null) {
        clearTimeout(typeTimer)
      }
    }
  }, [caption, index, reducedMotion])

  useEffect(
    () => () => {
      if (copyResetRef.current !== null) {
        clearTimeout(copyResetRef.current)
      }
    },
    [],
  )

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(caption)
      setCopied(true)
      if (copyResetRef.current !== null) {
        clearTimeout(copyResetRef.current)
      }
      copyResetRef.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard write can reject (e.g. permissions / insecure context).
      // Fail silently — the caption text remains visible for manual copy.
    }
  }, [caption])

  return (
    <div
      className="relative rounded-xl bg-[#071428] py-5 pl-5 pr-14 text-left"
      style={{ borderLeft: '3px solid #4C82F7' }}
    >
      <p
        className="text-[15px] leading-relaxed text-white"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {revealed}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Caption copied' : 'Copy caption to clipboard'}
        title={copied ? 'Copied!' : 'Copy caption'}
        className="absolute right-3 top-3 rounded-lg border border-white/10 bg-[#040C18] px-2 py-1 text-base leading-none transition-colors duration-200 hover:border-[#4C82F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C82F7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071428]"
      >
        <span aria-hidden="true">{copied ? '✓' : '📋'}</span>
      </button>
    </div>
  )
}

/**
 * A single shimmer skeleton row shown while captions are loading.
 *
 * Uses the scoped `veefShimmer` keyframe over a coral-tinted gradient. Under
 * reduced motion the sweep animation is omitted and a static placeholder is
 * shown instead (Requirement 21.1).
 */
const SkeletonCard: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => (
  <div
    className="h-20 rounded-xl bg-[#071428]"
    style={{ borderLeft: '3px solid #4C82F7' }}
  >
    <div
      className="h-full w-full rounded-r-xl"
      style={
        reducedMotion
          ? { background: 'rgba(255,255,255,0.04)' }
          : {
              backgroundImage:
                'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(76,130,247,0.12) 50%, rgba(255,255,255,0.03) 75%)',
              backgroundSize: '200% 100%',
              animation: 'veefShimmer 1.4s ease-in-out infinite',
            }
      }
    />
  </div>
)

/**
 * Live Demo (Section 7) — a functional AI caption generator.
 *
 * Premium redesign: full-bleed dark section with a glowing AI badge, a
 * two-column layout (inputs left, preview / results right), niche pills
 * instead of a dropdown, and animated caption cards. All logic is preserved
 * exactly — only the presentation layer changed.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 21.1
 */
export const LiveDemoSection: React.FC = () => {
  const { reducedMotion } = useLandingMotion()

  const [topic, setTopic] = useState('')
  const [niche, setNiche] = useState<string>(NICHES[0])
  const [tone, setTone] = useState<string>(TONES[0])

  const [status, setStatus] = useState<DemoStatus>('idle')
  const [captions, setCaptions] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [topicPrompt, setTopicPrompt] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
    },
    [],
  )

  const runGenerate = useCallback(async () => {
    setStatus('validating')
    setTopicPrompt(null)

    if (topic.trim() === '') {
      setTopicPrompt(EMPTY_TOPIC_PROMPT)
      setStatus('idle')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus('loading')
    setErrorMessage(null)
    setCaptions([])

    try {
      const { captions: result } = await generateCaptions(
        { topic: topic.trim(), niche, tone },
        controller.signal,
      )

      if (controller.signal.aborted) return

      if (!Array.isArray(result) || result.length === 0) {
        setErrorMessage('No captions were returned. Please try again.')
        setStatus('error')
        return
      }

      setCaptions(result.slice(0, CARD_COUNT))
      setStatus('success')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const message =
        error instanceof CaptionApiError && error.message
          ? error.message
          : FALLBACK_ERROR
      setErrorMessage(message)
      setStatus('error')
    }
  }, [topic, niche, tone])

  const isBusy = status === 'loading' || status === 'validating'
  const hasResults = status === 'success' && captions.length > 0

  return (
    <section
      id="demo"
      aria-labelledby="demo-title"
      className="relative w-full overflow-hidden px-6 py-24 md:py-36"
    >
      {/* Ambient glow behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 0%, rgba(76,130,247,0.10) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="relative mx-auto max-w-[1120px]">
        {/* Heading */}
        <div className="mb-14 text-center">
          <span
            className="veef-mono inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.18em]"
            style={{
              color: '#4C82F7',
              background: 'rgba(76,130,247,0.10)',
              border: '1px solid rgba(76,130,247,0.25)',
            }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: '#4C82F7', boxShadow: '0 0 8px #4C82F7' }}
            />
            ✦ Live AI demo — no signup needed
          </span>

          <h2
            id="demo-title"
            className="veef-display mt-5 text-[clamp(32px,5vw,56px)] font-extrabold text-[#F5F6F8]"
            style={{ lineHeight: 1.2 }}
          >
            Generate captions that{' '}
            <span
              className="veef-gradient-text inline-block"
              style={{
                background: 'linear-gradient(120deg, #4C82F7, #7FA8FF)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            >
              actually convert
            </span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-[#9BA3B4]"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Type a topic, pick your niche and tone — watch the AI write captions that stop the scroll.
          </p>
        </div>

        {/* Main card */}
        <div
          className="overflow-hidden rounded-3xl"
          style={{
            background: 'linear-gradient(180deg, rgba(14,16,22,0.98) 0%, rgba(8,9,13,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 60px 120px -40px rgba(0,0,0,0.9)',
          }}
        >
          {/* Window chrome bar */}
          <div
            className="flex items-center gap-2 border-b px-5 py-3.5"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: '#FF5F57' }} />
            <span className="h-3 w-3 rounded-full" style={{ background: '#FEBC2E' }} />
            <span className="h-3 w-3 rounded-full" style={{ background: '#28C840' }} />
            <img src="/veefore.svg" alt="Veefore" className="ml-3 h-3.5 w-3.5 object-contain" />
            <span className="veef-mono text-[11px] text-[#5A6172]">ai · caption generator</span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#3FB950', boxShadow: '0 0 6px #3FB950' }} />
              <span className="veef-mono text-[10px]" style={{ color: '#3FB950' }}>ready</span>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
            {/* Left — controls */}
            <div
              className="flex flex-col gap-6 p-6 md:border-r md:p-8"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              {/* Topic input */}
              <div>
                <label
                  htmlFor="demo-topic"
                  className="veef-mono mb-2 block text-[10px] uppercase tracking-[0.16em] text-[#5A6172]"
                >
                  Your topic
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px]"
                    aria-hidden="true"
                  >
                    ✦
                  </span>
                  <input
                    id="demo-topic"
                    type="text"
                    value={topic}
                    onChange={(e) => {
                      setTopic(e.target.value)
                      if (topicPrompt) setTopicPrompt(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && !isBusy && runGenerate()}
                    placeholder="e.g. morning coffee routine for creators"
                    aria-invalid={topicPrompt !== null}
                    aria-describedby={topicPrompt ? 'demo-topic-prompt' : undefined}
                    className="w-full rounded-xl py-3 pl-9 pr-4 text-[14px] text-[#F5F6F8] placeholder:text-[#3A4150] outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: topicPrompt
                        ? '1px solid rgba(255,80,80,0.5)'
                        : '1px solid rgba(255,255,255,0.08)',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(76,130,247,0.6)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = topicPrompt ? 'rgba(255,80,80,0.5)' : 'rgba(255,255,255,0.08)' }}
                  />
                </div>
                {topicPrompt && (
                  <p id="demo-topic-prompt" role="alert" className="mt-1.5 text-[12px] text-[#FF7A7A]">
                    {topicPrompt}
                  </p>
                )}
              </div>

              {/* Niche pills */}
              <div>
                <label className="veef-mono mb-2.5 block text-[10px] uppercase tracking-[0.16em] text-[#5A6172]">
                  Niche
                </label>
                <div className="flex flex-wrap gap-2">
                  {NICHES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNiche(n)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200"
                      style={
                        niche === n
                          ? {
                              background: 'rgba(76,130,247,0.16)',
                              border: '1px solid rgba(76,130,247,0.45)',
                              color: '#7FA8FF',
                            }
                          : {
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: '#9BA3B4',
                            }
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone pills */}
              <div>
                <label className="veef-mono mb-2.5 block text-[10px] uppercase tracking-[0.16em] text-[#5A6172]">
                  Tone
                </label>
                <div className="flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-200"
                      style={
                        tone === t
                          ? {
                              background: 'rgba(94,230,196,0.12)',
                              border: '1px solid rgba(94,230,196,0.35)',
                              color: '#5EE6C4',
                            }
                          : {
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              color: '#9BA3B4',
                            }
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={runGenerate}
                disabled={isBusy}
                aria-busy={status === 'loading'}
                className="mt-auto flex w-full items-center justify-center gap-2.5 rounded-2xl py-3.5 text-[14px] font-semibold text-white transition-all duration-300 disabled:opacity-60"
                style={{
                  background: isBusy
                    ? 'rgba(76,130,247,0.5)'
                    : 'linear-gradient(135deg, #4C82F7, #3A6FE6)',
                  boxShadow: isBusy ? 'none' : '0 0 32px rgba(76,130,247,0.40)',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {status === 'loading' ? (
                  <>
                    <span
                      className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                      style={{ animation: 'spin 0.8s linear infinite' }}
                    />
                    Writing captions…
                  </>
                ) : (
                  <>
                    <span>✦</span>
                    Generate Captions
                    <span className="opacity-70">→</span>
                  </>
                )}
              </button>

              {/* Upsell */}
              <p
                className="text-center text-[11.5px] text-[#5A6172]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                1 of 100 free actions.{' '}
                <span className="font-medium text-[#7FA8FF]">Sign up for unlimited.</span>
              </p>
            </div>

            {/* Right — results */}
            <div className="flex min-h-[320px] flex-col p-6 md:p-8">
              <div
                className="veef-mono mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]"
                style={{ color: '#5A6172' }}
              >
                <span>Generated captions</span>
                {hasResults && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px]"
                    style={{ background: 'rgba(63,185,80,0.14)', color: '#3FB950', border: '1px solid rgba(63,185,80,0.28)' }}
                  >
                    {captions.length} ready
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3" aria-live="polite">
                {/* Idle state */}
                {(status === 'idle' || status === 'validating') && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl py-10 text-center"
                    style={{ border: '1px dashed rgba(255,255,255,0.07)' }}>
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
                      style={{ background: 'rgba(76,130,247,0.10)', border: '1px solid rgba(76,130,247,0.20)' }}
                    >
                      ✦
                    </div>
                    <p className="text-[13px] text-[#5A6172]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      Your captions will appear here
                    </p>
                  </div>
                )}

                {/* Skeleton */}
                {status === 'loading' &&
                  Array.from({ length: CARD_COUNT }).map((_, i) => (
                    <SkeletonCard key={i} reducedMotion={reducedMotion} />
                  ))}

                {/* Results */}
                {hasResults &&
                  captions.map((caption, i) => (
                    <CaptionCard
                      key={`${i}-${caption.slice(0, 16)}`}
                      caption={caption}
                      index={i}
                      reducedMotion={reducedMotion}
                    />
                  ))}

                {/* Error */}
                {status === 'error' && (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-2xl p-5"
                    style={{ background: 'rgba(255,60,60,0.06)', border: '1px solid rgba(255,60,60,0.18)' }}
                  >
                    <p className="text-[13px]" style={{ color: '#FF9090', fontFamily: "'DM Sans', sans-serif" }}>
                      {errorMessage ?? FALLBACK_ERROR}
                    </p>
                    <GlowButton type="button" variant="ghost" onClick={runGenerate} size="sm">
                      Retry
                    </GlowButton>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
