/**
 * Basic tests for the NotificationDispatcher (Task 5.2).
 *
 * These cover the core routing + degradation contract of Requirement 15; the
 * exhaustive mobile/web/degraded routing matrix is added by Task 5.3.
 *
 * Satisfies Requirements: 15.1, 15.2, 15.4, 15.5, 15.6, 15.7
 */

import { describe, it, expect, vi } from 'vitest'
import { NotificationDispatcher, type UserInputNotification } from './NotificationDispatcher'
import type { EmailNotifier, FcmSender } from '../ports'

const baseInput: UserInputNotification = {
  userId: 'u1',
  workspaceId: 'w1',
  title: 'Auto Pilot needs you',
  message: 'Please review the pending brief.',
  link: '/autopilot',
  email: 'creator@example.com',
}

function stubEmail(sendResult: boolean, configured = true): EmailNotifier {
  return {
    isConfigured: () => configured,
    send: vi.fn(async () => sendResult),
  }
}

function stubFcm(sendResult: boolean, configured = true): FcmSender {
  return {
    isConfigured: () => configured,
    send: vi.fn(async () => sendResult),
  }
}

describe('NotificationDispatcher', () => {
  it('web session delivers to the in-app inbox only (R15.5/R15.7)', async () => {
    const enqueueInApp = vi.fn(async () => true)
    const email = stubEmail(true)
    const fcm = stubFcm(true)
    const dispatcher = new NotificationDispatcher({ enqueueInApp, email, fcm })

    const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

    expect(result).toEqual({ delivered: ['in-app'], undelivered: false })
    expect(enqueueInApp).toHaveBeenCalledTimes(1)
    // No FCM push and no email fallback when in-app succeeds on web.
    expect(fcm.send).not.toHaveBeenCalled()
    expect(email.send).not.toHaveBeenCalled()
  })

  it('mobile session pushes FCM in addition to the inbox (R15.3)', async () => {
    const enqueueInApp = vi.fn(async () => true)
    const fcm = stubFcm(true)
    const email = stubEmail(true)
    const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm, email })

    const result = await dispatcher.dispatch({
      ...baseInput,
      sessionContext: 'mobile',
      deviceToken: 'device-123',
    })

    expect(result.delivered).toEqual(['in-app', 'fcm'])
    expect(result.undelivered).toBe(false)
    expect(fcm.send).toHaveBeenCalledTimes(1)
    expect(email.send).not.toHaveBeenCalled()
  })

  it('retries FCM up to maxAttempts then falls back to email (R15.4)', async () => {
    const enqueueInApp = vi.fn(async () => true)
    const fcm = stubFcm(false) // always fails
    const email = stubEmail(true)
    const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm, email, maxAttempts: 3 })

    const result = await dispatcher.dispatch({
      ...baseInput,
      sessionContext: 'mobile',
      deviceToken: 'device-123',
    })

    expect(fcm.send).toHaveBeenCalledTimes(3)
    expect(email.send).toHaveBeenCalledTimes(1)
    expect(result.delivered).toEqual(['in-app', 'email'])
    expect(result.undelivered).toBe(false)
  })

  it('retries the in-app enqueue up to maxAttempts (R15.2)', async () => {
    const enqueueInApp = vi
      .fn<[], Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const dispatcher = new NotificationDispatcher({ enqueueInApp, maxAttempts: 3 })

    const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

    expect(enqueueInApp).toHaveBeenCalledTimes(3)
    expect(result.delivered).toEqual(['in-app'])
  })

  it('records undelivered without throwing when every channel fails (R15.2)', async () => {
    const enqueueInApp = vi.fn(async () => false)
    const email = stubEmail(false, false) // unconfigured
    const dispatcher = new NotificationDispatcher({ enqueueInApp, email })

    const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

    expect(result).toEqual({ delivered: [], undelivered: true })
  })

  it('does not throw when a transport rejects; treats it as a failed attempt', async () => {
    const enqueueInApp = vi.fn(async () => {
      throw new Error('redis down')
    })
    const email = stubEmail(true)
    const dispatcher = new NotificationDispatcher({ enqueueInApp, email, maxAttempts: 2 })

    const result = await dispatcher.dispatch({ ...baseInput, sessionContext: 'web' })

    expect(enqueueInApp).toHaveBeenCalledTimes(2)
    // In-app failed on all attempts → last-resort email fallback delivers.
    expect(result.delivered).toEqual(['email'])
    expect(result.undelivered).toBe(false)
  })

  it('skips FCM when no device token is present even on mobile', async () => {
    const enqueueInApp = vi.fn(async () => true)
    const fcm = stubFcm(true)
    const dispatcher = new NotificationDispatcher({ enqueueInApp, fcm })

    const result = await dispatcher.dispatch({
      ...baseInput,
      sessionContext: 'mobile',
      deviceToken: null,
    })

    expect(fcm.send).not.toHaveBeenCalled()
    expect(result.delivered).toEqual(['in-app'])
  })

  it('webEmailFallback sends email when configured (R15.6)', async () => {
    const email = stubEmail(true)
    const dispatcher = new NotificationDispatcher({ email })

    const result = await dispatcher.webEmailFallback(baseInput)

    expect(email.send).toHaveBeenCalledWith(
      'creator@example.com',
      baseInput.title,
      baseInput.message,
    )
    expect(result).toEqual({ delivered: ['email'], undelivered: false })
  })

  it('webEmailFallback reports undelivered when email is unconfigured (R15.6)', async () => {
    const email = stubEmail(false, false)
    const dispatcher = new NotificationDispatcher({ email })

    const result = await dispatcher.webEmailFallback(baseInput)

    expect(result).toEqual({ delivered: [], undelivered: true })
  })
})
