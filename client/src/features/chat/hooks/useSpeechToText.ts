/**
 * useSpeechToText — voice dictation via the browser-native Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition).
 *
 * This is the standard, permission-correct approach: calling `recognition.start()`
 * from a user gesture makes the BROWSER prompt for microphone access through the
 * OS permission dialog. We never touch getUserMedia directly or bypass anything.
 *
 * Usage:
 *   const stt = useSpeechToText({
 *     onText: (text) => setInput(base + text),   // live transcript (interim+final)
 *     onStart: () => { baseRef.current = currentInput },
 *   })
 *   stt.toggle()  // start/stop from a click
 */

import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = any

function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return undefined
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
}

export interface UseSpeechToTextOptions {
  /** Called with the running transcript (interim + final) for the session. */
  onText: (transcript: string) => void
  /** Called the moment recognition successfully starts (after permission). */
  onStart?: () => void
  /** Called when recognition ends (manually, on silence, or on error). */
  onEnd?: () => void
  /** BCP-47 language tag; defaults to the browser language. */
  lang?: string
}

export interface UseSpeechToTextReturn {
  /** Whether the browser supports the Web Speech API at all. */
  supported: boolean
  /** True while actively listening. */
  listening: boolean
  /** Last error code (e.g. 'not-allowed', 'no-speech', 'unsupported'). */
  error: string | null
  start: () => void
  stop: () => void
  toggle: () => void
}

export function useSpeechToText(options: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const { onText, onStart, onEnd, lang } = options
  const supported = !!getSpeechRecognition()
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // Keep callbacks in refs so the recognition handlers always call the latest.
  const cbRef = useRef({ onText, onStart, onEnd })
  useEffect(() => { cbRef.current = { onText, onStart, onEnd } }, [onText, onStart, onEnd])

  const stop = useCallback(() => {
    try { recognitionRef.current?.stop() } catch { /* noop */ }
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) { setError('unsupported'); return }
    if (recognitionRef.current) { try { recognitionRef.current.abort() } catch { /* noop */ } }
    setError(null)
    try {
      const rec: SpeechRecognitionLike = new SR()
      rec.lang = lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US'
      rec.interimResults = true
      rec.continuous = false
      rec.maxAlternatives = 1

      let finalTranscript = ''
      rec.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0]?.transcript || ''
          if (event.results[i].isFinal) finalTranscript += chunk
          else interim += chunk
        }
        cbRef.current.onText((finalTranscript + interim).replace(/\s+/g, ' ').trim())
      }
      rec.onerror = (event: any) => {
        // 'not-allowed' / 'service-not-allowed' = permission denied/blocked.
        setError(event?.error || 'error')
      }
      rec.onend = () => {
        setListening(false)
        recognitionRef.current = null
        cbRef.current.onEnd?.()
      }

      recognitionRef.current = rec
      // start() triggers the browser's native mic-permission prompt.
      rec.start()
      setListening(true)
      cbRef.current.onStart?.()
    } catch (err: any) {
      setError(err?.message || 'failed')
      setListening(false)
      recognitionRef.current = null
    }
  }, [lang])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // Clean up on unmount.
  useEffect(() => () => { try { recognitionRef.current?.abort() } catch { /* noop */ } }, [])

  return { supported, listening, error, start, stop, toggle }
}
