/**
 * Tests for the EmailNotifier port default (Task 5.1).
 *
 * The unconfigured default must be inert: `isConfigured()` returns false and
 * `send()` reports "not sent" without throwing, so the NotificationDispatcher
 * can degrade to in-app-only delivery (R15.2/R15.3).
 *
 * Satisfies Requirements: 15.3
 */

import { describe, it, expect } from 'vitest'
import {
  UnconfiguredEmailNotifier,
  unconfiguredEmailNotifier,
  type EmailNotifier,
} from './EmailNotifier'

describe('UnconfiguredEmailNotifier', () => {
  it('reports itself as not configured', () => {
    const notifier = new UnconfiguredEmailNotifier()
    expect(notifier.isConfigured()).toBe(false)
  })

  it('send() resolves false without throwing', async () => {
    const notifier = new UnconfiguredEmailNotifier()
    await expect(
      notifier.send('creator@example.com', 'Auto Pilot needs you', 'Please review.'),
    ).resolves.toBe(false)
  })

  it('exposes a shared inert instance implementing the port', async () => {
    const notifier: EmailNotifier = unconfiguredEmailNotifier
    expect(notifier.isConfigured()).toBe(false)
    await expect(notifier.send('a@b.co', 's', 'b')).resolves.toBe(false)
  })
})
