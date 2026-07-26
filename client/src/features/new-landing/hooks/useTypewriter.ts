import { useEffect, useRef, useState } from 'react'

/**
 * Options controlling the {@link useTypewriter} animation.
 */
export interface UseTypewriterOptions {
  /** Milliseconds between typing each character. Default `80`. */
  typeSpeed?: number
  /** Milliseconds between deleting each character. Default `40`. */
  backSpeed?: number
  /** Milliseconds to pause once a word is fully typed. Default `1500`. */
  pause?: number
  /** When `true`, animation is disabled and the first word is shown statically. */
  reducedMotion?: boolean
  /** When `true` (default), cycles through the words indefinitely. */
  loop?: boolean
}

/**
 * Looping typewriter animation — a dependency-free replacement for Typed.js.
 *
 * Cycles through `words`, typing each one character-by-character, pausing, then
 * deleting it before advancing to the next word. Returns the current display
 * string for the consuming component to render.
 *
 * When `reducedMotion` is `true`, no animation runs and the first word is
 * returned statically (Requirement 21.1). All timers are cleared on unmount and
 * whenever the inputs change, so no callback fires after teardown.
 *
 * Requirements: 23.1, 23.2
 *
 * @param words - The list of words/phrases to cycle through.
 * @param opts - Typing/deleting speeds, pause duration, motion and loop flags.
 * @returns The current string to display.
 */
export function useTypewriter(words: string[], opts?: UseTypewriterOptions): string {
  const {
    typeSpeed = 80,
    backSpeed = 40,
    pause = 1500,
    reducedMotion = false,
    loop = true,
  } = opts ?? {}

  const firstWord = words.length > 0 ? words[0] : ''
  const [display, setDisplay] = useState<string>(reducedMotion ? firstWord : '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Reduced motion: show the first word statically, run no timers.
    if (reducedMotion || words.length === 0) {
      setDisplay(firstWord)
      return
    }

    let wordIndex = 0
    let charIndex = 0
    let deleting = false

    const clear = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const tick = () => {
      const word = words[wordIndex]

      if (!deleting) {
        charIndex += 1
        setDisplay(word.slice(0, charIndex))

        if (charIndex >= word.length) {
          // Fully typed: if there is nowhere to go, stop here.
          const lastWord = wordIndex === words.length - 1
          if (lastWord && !loop) {
            return
          }
          // Pause, then begin deleting.
          deleting = true
          timerRef.current = setTimeout(tick, pause)
          return
        }

        timerRef.current = setTimeout(tick, typeSpeed)
        return
      }

      // Deleting.
      charIndex -= 1
      setDisplay(word.slice(0, Math.max(0, charIndex)))

      if (charIndex <= 0) {
        deleting = false
        wordIndex = (wordIndex + 1) % words.length
        timerRef.current = setTimeout(tick, typeSpeed)
        return
      }

      timerRef.current = setTimeout(tick, backSpeed)
    }

    setDisplay('')
    timerRef.current = setTimeout(tick, typeSpeed)

    return clear
  }, [words, typeSpeed, backSpeed, pause, reducedMotion, loop, firstWord])

  return display
}
