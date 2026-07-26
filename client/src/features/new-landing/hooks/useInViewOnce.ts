import { useEffect, useRef, useState } from 'react'

/**
 * One-shot in-view detection via `IntersectionObserver`.
 *
 * Attach the returned ref to an element; the hook sets `inView` to `true` the
 * first time that element intersects the viewport, then disconnects the
 * observer so the value never reverts (a one-shot reveal trigger).
 *
 * SSR-safe and progressively enhanced: when `IntersectionObserver` is
 * unavailable (SSR or unsupported browsers), `inView` defaults to `true` so
 * content is always shown rather than hidden behind an animation that can
 * never fire.
 *
 * Requirements: 23.1, 23.2
 *
 * @typeParam T - The element type the ref is attached to.
 * @param options - Optional `IntersectionObserverInit` (root, rootMargin, threshold).
 * @returns A tuple of `[ref, inView]` — attach `ref` to the target element.
 */
export function useInViewOnce<T extends Element = HTMLElement>(
  options?: IntersectionObserverInit
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState<boolean>(() => {
    // When IntersectionObserver is unavailable, reveal content immediately.
    return typeof IntersectionObserver === 'undefined'
  })

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const element = ref.current
    if (!element) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
          break
        }
      }
    }, options)

    observer.observe(element)

    return () => observer.disconnect()
    // `options` is read once when the observer is created; callers should pass a
    // stable object. Re-running on identity change is acceptable and harmless.
  }, [options])

  return [ref, inView]
}
