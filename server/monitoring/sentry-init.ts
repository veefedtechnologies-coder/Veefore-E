import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node'
let SentryReady = false

export async function initializeSentry() {
  const dsn = process.env.SENTRY_DSN || ''
  if (!dsn) { try { console.log('[Sentry] DSN not set') } catch {} ; return }
  try {
    let integrations: any[] = []
    try {
      const profilingMod: any = await import('@sentry/profiling-node')
      const nodeProfilingIntegration = profilingMod?.nodeProfilingIntegration
      if (nodeProfilingIntegration) integrations.push(nodeProfilingIntegration())
    } catch {}
    Sentry.init({ dsn, environment: process.env.NODE_ENV, tracesSampleRate: 0.2, profilesSampleRate: 0.1, integrations, debug: true, beforeSend: (event: any) => { try { console.log('[Sentry] event', event?.event_id || event?.message || event?.transaction) } catch {} return event } })
    SentryReady = true
    try { Sentry.captureMessage('sentry-initialized'); await Sentry.flush(2000) } catch {}
    process.on('uncaughtException', (err) => { try { Sentry.captureException(err) } catch {} })
    process.on('unhandledRejection', (err) => { try { Sentry.captureException(err as any) } catch {} })
  } catch {}
}

export async function attachSentryRequestMiddleware(app: any) {
  const dsn = process.env.SENTRY_DSN || ''
  if (!dsn) return
  try {
    const SentryAny: any = Sentry as any
    app.use((req: Request, res: Response, next: NextFunction) => {
      try {
        SentryAny.addBreadcrumb({ category: 'request', message: req.method + ' ' + req.path, level: 'info' })
      } catch {}
      next()
    })
  } catch {}
}

export async function attachSentryExpressHandlers(app: any) {
  const dsn = process.env.SENTRY_DSN || ''
  if (!dsn) return
  try {
    const SentryAny: any = Sentry as any
    if (SentryAny?.Handlers?.requestHandler) {
      app.use(SentryAny.Handlers.requestHandler())
    }
    if (SentryAny?.Handlers?.tracingHandler) {
      app.use(SentryAny.Handlers.tracingHandler())
    }
    if (SentryAny?.Handlers?.errorHandler) {
      app.use(SentryAny.Handlers.errorHandler())
    }
  } catch {}
}

export async function sentryCaptureException(err: any) {
  const dsn = process.env.SENTRY_DSN || ''
  if (!dsn) return
  try {
    const SentryAny: any = Sentry as any
    const eventId = SentryAny.captureException(err)
    try { await SentryAny.flush(2000) } catch {}
    return eventId
  } catch {}
}

export function isSentryReady() { return !!SentryReady }
export async function sentryCaptureMessage(message: string) {
  const dsn = process.env.SENTRY_DSN || ''
  if (!dsn) return
  try {
    const SentryAny: any = Sentry as any
    SentryAny.captureMessage(message)
    try { await SentryAny.flush(2000) } catch {}
  } catch {}
}

export async function sentryDirectTest(message: string) {
  const dsn = process.env.SENTRY_DSN || ''
  if (!dsn) return { ok: false, reason: 'dsn_missing' }
  try {
    const u = new URL(dsn)
    const projectId = (u.pathname || '').replace('/', '')
    const host = u.host
    const key = u.username
    const url = `https://${host}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`
    const event = { timestamp: Date.now() / 1000, level: 'error', message, platform: 'node', environment: process.env.NODE_ENV || 'development' }
    const header = { dsn, sent_at: new Date().toISOString() }
    const itemHeader = { type: 'event', content_type: 'application/json' }
    const envelope = `${JSON.stringify(header)}\n${JSON.stringify(itemHeader)}\n${JSON.stringify(event)}`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: envelope })
    return { ok: res.ok, status: res.status }
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'error' }
  }
}
