export function initSentryBrowser(dsn: string) {
  try {
    const script = document.createElement('script')
    script.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.min.js'
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      try {
        ;(window as any).Sentry?.init({ dsn, tracesSampleRate: 0.2 })
      } catch {}
    }
    script.onerror = () => {}
    document.head.appendChild(script)
  } catch {}
}

export function addBasicBreadcrumbs() {
  try {
    const Sentry = (window as any).Sentry
    if (!Sentry) return
    window.addEventListener('click', (e) => {
      try {
        const target = e.target as HTMLElement
        const text = target?.innerText?.slice(0, 60) || target?.tagName
        Sentry.addBreadcrumb({ category: 'ui.click', message: text, level: 'info' })
      } catch {}
    })
    const origPush = history.pushState
    history.pushState = function (...args: any[]) {
      try { Sentry.addBreadcrumb({ category: 'navigation', message: location.pathname, level: 'info' }) } catch {}
      // @ts-ignore
      return origPush.apply(this, args)
    }
    window.addEventListener('popstate', () => {
      try { Sentry.addBreadcrumb({ category: 'navigation', message: location.pathname, level: 'info' }) } catch {}
    })
  } catch {}
}
