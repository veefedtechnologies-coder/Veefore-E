/**
 * Tests for the FcmSender port default (Task 5.2).
 *
 * The unconfigured default must be inert: `isConfigured()` returns false and
 * `send()` reports "not sent" without throwing, so the NotificationDispatcher
 * can retry, fall back to email, or degrade to in-app-only (R15.2/R15.4).
 *
 * Satisfies Requirements: 15.4
 */

import { describe, it, expect } from 'vitest'
import { UnconfiguredFcmSender, unconfiguredFcmSender, type FcmSender } from './FcmSender'

describe('UnconfiguredFcmSender', () => {
  it('reports itself as not configured', () => {
    expect(new UnconfiguredFcmSender().isConfigured()).toBe(false)
  })

  it('send() resolves false without throwing', async () => {
    const sender = new UnconfiguredFcmSender()
    await expect(
      sender.send('device-token', { title: 'Auto Pilot', body: 'Review please', link: '/autopilot' }),
    ).resolves.toBe(false)
  })

  it('exposes a shared inert instance implementing the port', async () => {
    const sender: FcmSender = unconfiguredFcmSender
    expect(sender.isConfigured()).toBe(false)
    await expect(sender.send('t', { title: 's', body: 'b' })).resolves.toBe(false)
  })
})
