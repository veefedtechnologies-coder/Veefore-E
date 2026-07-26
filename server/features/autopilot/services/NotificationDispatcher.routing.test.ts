/**
 * Notification routing matrix tests for the NotificationDispatcher (Task 5.3).
 *
 * Where NotificationDispatcher.test.ts (Task 5.2) covers the core contract,
 * this suite exercises the full mobile / web / degraded routing matrix of
 * Requirement 15, asserting channel selection, retry-then-fallback behaviour,
 * payload shape, and graceful degradation — all with injected stub ports so no
 * Redis / FCM / email transport is touched.
 *
 * Satisfies Requirements: 15.2, 15.4 (plus routing coverage for 15.3/15.5/15.6/15.7)
 */

import { describe, it, expect, vi } from 'vitest'
import {
  NotificationDispatcher,
  type NotificationChannel,
  type UserInputNotification,
} from './NotificationDispatcher'
import type { EmailNotifier, FcmSender, FcmPushMessage } from '../ports'

const baseInput: UserInputNotification = {
  userId: 'u1',
  workspaceId: 'w1',
  title: 'Auto Pilot needs you',
  message: 'Please review the pending brief.',
  link: '/autopilot',
  email: 'creator@example.com',
}

/** Email stub with a configurable outcome; records calls for assertions. */
function stubEmail(sendResult: boolean, configured = true): EmailNotifier {
  return {
    isConfigured: () => configured,
    send: vi.fn(async () => sendResult),
  }
}

/** FCM stub with a configurable outcome; records calls for assertions. */
function stubFcm(sendResult: boolean, configured = true): FcmSender {
  return {
    isConfigured: () => configured,
    send: vi.fn(async () => sendResult),
  }
}

describe('NotificationDispatcher routing matrix (R15)', () => {
  // ── Mobile path ──────────────────────────────────────────────────────────
  describe('mobile session', () => {
    it('delivers in-app inbox + FCM push on the happy path (R15.3)', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(true)
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm, email })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'mobile',
        deviceToken: 'device-123',
      })

      expect(result).toEqual({ delivered: ['in-app', 'fcm'], undelivered: false })
      expect(enqueueInApp).toHaveBeenCalledTimes(1)
      expect(fcm.send).toHaveBeenCalledTimes(1)
      // No email fallback needed when FCM delivers.
      expect(email.send).not.toHaveBeenCalled()
    })

    it('pushes FCM with the notification title/body/link payload (R15.3)', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(true)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm })

      await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'mobile',
        deviceToken: 'device-abc',
      })

      const expectedMessage: FcmPushMessage = {
        title: baseInput.title,
        body: baseInput.message,
        link: baseInput.link,
      }
      expect(fcm.send).toHaveBeenCalledWith('device-abc', expectedMessage)
    })

    it('retries FCM up to maxAttempts then falls back to email (R15.4)', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(false) // every push fails
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({
        enqueueInApp,
        fcm,
        email,
        maxAttempts: 3,
      })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'mobile',
        deviceToken: 'device-123',
      })

      expect(fcm.send).toHaveBeenCalledTimes(3)
      expect(email.send).toHaveBeenCalledTimes(1)
      expect(email.send).toHaveBeenCalledWith(
        baseInput.email,
        baseInput.title,
        baseInput.message,
      )
      expect(result).toEqual({ delivered: ['in-app', 'email'], undelivered: false })
    })

    it('treats a thrown FCM error as a failed attempt and falls back to email (R15.4)', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm: FcmSender = {
        isConfigured: () => true,
        send: vi.fn(async () => {
          throw new Error('fcm upstream 503')
        }),
      }
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({
        enqueueInApp,
        fcm,
        email,
        maxAttempts: 3,
      })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'mobile',
        deviceToken: 'device-123',
      })

      expect(fcm.send).toHaveBeenCalledTimes(3)
      expect(result.delivered).toEqual(['in-app', 'email'])
      expect(result.undelivered).toBe(false)
    })

    it('skips FCM (no push) when the user has no registered device token', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(true)
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm, email })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'mobile',
        deviceToken: null,
      })

      expect(fcm.send).not.toHaveBeenCalled()
      // In-app delivered, so no email fallback either.
      expect(email.send).not.toHaveBeenCalled()
      expect(result).toEqual({ delivered: ['in-app'], undelivered: false })
    })

    it('skips FCM when the transport is unconfigured, delivering in-app only', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(false, /* configured */ false)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'mobile',
        deviceToken: 'device-123',
      })

      expect(fcm.send).not.toHaveBeenCalled()
      expect(result).toEqual({ delivered: ['in-app'], undelivered: false })
    })
  })

  // ── Web path ─────────────────────────────────────────────────────────────
  describe('web session', () => {
    it('delivers to the in-app inbox only and never web-pushes (R15.5/R15.7)', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(true)
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm, email })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'web',
        // A device token must NOT trigger a push on web (no browser web-push).
        deviceToken: 'device-should-be-ignored',
      })

      expect(result).toEqual({ delivered: ['in-app'], undelivered: false })
      expect(fcm.send).not.toHaveBeenCalled()
      expect(email.send).not.toHaveBeenCalled()
      // 'fcm' is never a delivered channel for a web session (R15.7).
      expect(result.delivered).not.toContain<NotificationChannel>('fcm')
    })

    it('defaults an unspecified session context to web (in-app only, R15.7)', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(true)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm })

      const result = await dispatcher.dispatch({
        ...baseInput,
        deviceToken: 'device-123',
      })

      expect(fcm.send).not.toHaveBeenCalled()
      expect(result.delivered).toEqual(['in-app'])
    })

    it('treats an unknown session context like web (in-app only, R15.7)', async () => {
      const enqueueInApp = vi.fn(async () => true)
      const fcm = stubFcm(true)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'unknown',
        deviceToken: 'device-123',
      })

      expect(fcm.send).not.toHaveBeenCalled()
      expect(result.delivered).toEqual(['in-app'])
    })

    it('retries the in-app enqueue up to maxAttempts before succeeding (R15.2)', async () => {
      const enqueueInApp = vi
        .fn<[], Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
      const dispatcher = new NotificationDispatcher({ enqueueInApp, maxAttempts: 3 })

      const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

      expect(enqueueInApp).toHaveBeenCalledTimes(3)
      expect(result).toEqual({ delivered: ['in-app'], undelivered: false })
    })

    it('falls back to email as last resort when the inbox enqueue fails on web', async () => {
      const enqueueInApp = vi.fn(async () => false) // inbox never accepts
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({
        enqueueInApp,
        email,
        maxAttempts: 3,
      })

      const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

      expect(enqueueInApp).toHaveBeenCalledTimes(3)
      expect(email.send).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ delivered: ['email'], undelivered: false })
    })
  })

  // ── webEmailFallback (unread-15m path, R15.6) ─────────────────────────────
  describe('webEmailFallback (R15.6)', () => {
    it('sends the email and reports delivery when configured', async () => {
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({ email })

      const result = await dispatcher.webEmailFallback(baseInput)

      expect(email.send).toHaveBeenCalledWith(
        baseInput.email,
        baseInput.title,
        baseInput.message,
      )
      expect(result).toEqual({ delivered: ['email'], undelivered: false })
    })

    it('reports undelivered when the email transport is unconfigured', async () => {
      const email = stubEmail(false, /* configured */ false)
      const dispatcher = new NotificationDispatcher({ email })

      const result = await dispatcher.webEmailFallback(baseInput)

      expect(email.send).not.toHaveBeenCalled()
      expect(result).toEqual({ delivered: [], undelivered: true })
    })

    it('reports undelivered when no email address is present', async () => {
      const email = stubEmail(true)
      const dispatcher = new NotificationDispatcher({ email })

      const result = await dispatcher.webEmailFallback({ ...baseInput, email: null })

      expect(email.send).not.toHaveBeenCalled()
      expect(result).toEqual({ delivered: [], undelivered: true })
    })

    it('reports undelivered without throwing when the email transport rejects', async () => {
      const email: EmailNotifier = {
        isConfigured: () => true,
        send: vi.fn(async () => {
          throw new Error('smtp timeout')
        }),
      }
      const dispatcher = new NotificationDispatcher({ email })

      const result = await dispatcher.webEmailFallback(baseInput)

      expect(result).toEqual({ delivered: [], undelivered: true })
    })
  })

  // ── Degraded / undelivered path (R15.2) ───────────────────────────────────
  describe('degraded path', () => {
    it('records undelivered without throwing when every channel fails on web (R15.2)', async () => {
      const enqueueInApp = vi.fn(async () => false)
      const email = stubEmail(false, /* configured */ false)
      const dispatcher = new NotificationDispatcher({
        enqueueInApp,
        email,
        maxAttempts: 3,
      })

      const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

      expect(enqueueInApp).toHaveBeenCalledTimes(3)
      expect(email.send).not.toHaveBeenCalled() // unconfigured → not attempted
      expect(result).toEqual({ delivered: [], undelivered: true })
    })

    it('records undelivered when every channel fails on mobile (R15.2/R15.4)', async () => {
      const enqueueInApp = vi.fn(async () => false)
      const fcm = stubFcm(false) // push fails on every attempt
      const email = stubEmail(false) // configured but declines
      const dispatcher = new NotificationDispatcher({
        enqueueInApp,
        fcm,
        email,
        maxAttempts: 2,
      })

      const result = await dispatcher.dispatch({
        ...baseInput,
        sessionContext: 'mobile',
        deviceToken: 'device-123',
      })

      expect(enqueueInApp).toHaveBeenCalledTimes(2)
      expect(fcm.send).toHaveBeenCalledTimes(2)
      // Email is attempted once (mobile FCM exhausted) but declines.
      expect(email.send).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ delivered: [], undelivered: true })
    })

    it('never throws when transports reject and still reports undelivered (R15.2)', async () => {
      const enqueueInApp = vi.fn(async () => {
        throw new Error('redis down')
      })
      const email: EmailNotifier = {
        isConfigured: () => true,
        send: vi.fn(async () => {
          throw new Error('email provider down')
        }),
      }
      const dispatcher = new NotificationDispatcher({
        enqueueInApp,
        email,
        maxAttempts: 2,
      })

      const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

      expect(enqueueInApp).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ delivered: [], undelivered: true })
    })
  })
})
