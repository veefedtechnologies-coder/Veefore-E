import { renderToStaticMarkup } from 'react-dom/server'
import { AppShellSkeleton } from '@/components/skeletons/AppShellSkeleton'
import type { ShellChrome } from '@/lib/bootstrap'

/**
 * SSR entry (Phase 3 of SSR_INSTANT_LOAD_PLAN.md): renders the route-aware app
 * shell skeleton to a static HTML string so the server can inline real shell
 * pixels inside `<div id="root">…</div>` for the first byte.
 *
 * `chrome` (optional) carries the seeded header identity (welcome name, avatar,
 * active workspace) so the SSR header renders REAL on first byte. The client
 * re-derives the same chrome from the injected bootstrap, so the loading shell
 * matches the SSR markup exactly (no swap).
 *
 * The client mounts with `createRoot` (NOT hydrate): React clears `#root` and
 * renders the SAME `AppShellSkeleton`, so the static markup is replaced
 * seamlessly with no hydration coupling. FAIL-OPEN: any render error returns an
 * empty string so the server simply serves the normal (empty-#root) document.
 */
export function renderAppShell(pathname: string, chrome?: ShellChrome): string {
  try {
    return renderToStaticMarkup(<AppShellSkeleton pathname={pathname} chrome={chrome} />)
  } catch {
    return ''
  }
}
