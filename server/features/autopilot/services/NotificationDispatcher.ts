/**
 * Auto Pilot — NotificationDispatcher.
 *
 * The single place that turns an Auto Pilot "I need the user" signal into an
 * actual delivered notification, routing across the three channels Requirement
 * 15 defines and degrading gracefully when a channel is unavailable:
 *
 *   • **in-app inbox** — every notification is created through the existing
 *     notification queue (`NotificationQueueManager.sendNotification`), which
 *     persists the inbox row and broadcasts it live over `RealtimeService`
 *     (R15.1/R15.5). Because the web service worker is deliberately disabled,
 *     web delivery is in-app + email only — never browser web-push (R15.7).
 *
 *   • **mobile FCM push** — when the user's active session context is mobile
 *     and they have a registered device token, the notification is pushed via
 *     the {@link FcmSender} port (R15.3). FCM push is retried up to
 *     {@link NotificationDispatcherOptions.maxAttempts} times; if it still fails
 *     the dispatcher falls back to email (R15.4).
 *
 *   • **email fallback** — via the {@link EmailNotifier} port, used when mobile
 *     FCM is exhausted (R15.4), when a web in-app notification stays unread for
 *     15 minutes (R15.6, see {@link NotificationDispatcher.webEmailFallback}),
 *     or as a last resort when no other channel delivered.
 *
 * Creating the in-app notification is itself retried up to `maxAttempts` times
 * (R15.2); if every channel fails, the dispatcher records the notification as
 * `undelivered` and returns — it never throws, so the Operating Loop keeps
 * running and the caller preserves its pending-input state (R15.2).
 *
 * All transports are injected as ports with inert defaults (see `ports/`), so
 * this service is fully unit-testable without Redis, FCM, or an email provider,
 * and the routing logic holds even before any transport is wired.
 *
 * Satisfies Requirements: 15.1, 15.2, 15.4, 15.5, 15.6, 15.7
 */

import { logger } from '../../../config/logger'
import {
  NotificationQueueManager,
  type NotificationJobData,
} from '../../../queues/notificationQueue'
import {
  type EmailNotifier,
  unconfiguredEmailNotifier,
  type FcmSender,
  unconfiguredFcmSender,
} from '../ports'

/** The channels a User_Input_Notification can be delivered through (R15). */
export type NotificationChannel = 'fcm' | 'in-app' | 'email'

/**
 * The user's active session context, which decides the primary channel:
 * `mobile` prefers FCM push (R15.3), `web` uses the in-app inbox (R15.5), and
 * `unknown` is treated like web (in-app + email only, R15.7).
 */
export type SessionContext = 'mobile' | 'web' | 'unknown'

/**
 * A notification telling the user Auto Pilot needs their input. This is the
 * structural input the dispatcher routes; it carries everything the three
 * channels need (inbox payload, optional FCM device token, optional email).
 */
export interface UserInputNotification {
  /** The user to notify. */
  userId: string
  /** The workspace the mission (and notification) is scoped to. */
  workspaceId: string
  /** Short notification title. */
  title: string
  /** Notification body/message. */
  message: string
  /** Optional deep-link (e.g. to the Approval_Card / Mission_Control view). */
  link?: string
  /** Inbox severity; defaults to `alert` for user-input prompts. */
  type?: NotificationJobData['type']
  /** Active session context; defaults to `web` (in-app + email only, R15.7). */
  sessionContext?: SessionContext
  /** Registered FCM device token, when the user has a mobile session (R15.3). */
  deviceToken?: string | null
  /** Destination address for the email fallback (R15.4/R15.6). */
  email?: string | null
}

/** The outcome of a dispatch: which channels delivered, and whether none did. */
export interface DispatchResult {
  /** Channels that accepted the notification (in delivery order). */
  delivered: NotificationChannel[]
  /**
   * `true` when no channel delivered the notification (R15.2). The caller must
   * preserve its pending-input state when this is `true`.
   */
  undelivered: boolean
}

/**
 * Enqueues the in-app inbox notification. Defaults to the existing
 * `NotificationQueueManager.sendNotification`, which persists the inbox row and
 * broadcasts it over `RealtimeService`. Resolves `true` when accepted.
 */
export type InAppEnqueuer = (data: NotificationJobData) => Promise<boolean>

/** Tunable behaviour for the dispatcher. */
export interface NotificationDispatcherOptions {
  /** In-app enqueue transport (defaults to `NotificationQueueManager`). */
  enqueueInApp?: InAppEnqueuer
  /** Mobile FCM push transport (defaults to the inert unconfigured sender). */
  fcm?: FcmSender
  /** Email fallback transport (defaults to the inert unconfigured notifier). */
  email?: EmailNotifier
  /**
   * Max delivery attempts for the in-app enqueue (R15.2) and FCM push (R15.4).
   * Defaults to 3, matching the notification queue's own attempt budget.
   */
  maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Routes User_Input_Notifications across FCM, the in-app inbox, and email, with
 * retries and graceful degradation per Requirement 15.
 */
export class NotificationDispatcher {
  private readonly enqueueInApp: InAppEnqueuer
  private readonly fcm: FcmSender
  private readonly email: EmailNotifier
  private readonly maxAttempts: number

  constructor(options: NotificationDispatcherOptions = {}) {
    this.enqueueInApp =
      options.enqueueInApp ??
      ((data) => NotificationQueueManager.sendNotification(data))
    this.fcm = options.fcm ?? unconfiguredFcmSender
    this.email = options.email ?? unconfiguredEmailNotifier
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS))
  }

  /**
   * Route and deliver a User_Input_Notification.
   *
   * Flow (R15):
   *   1. Create the in-app inbox notification through the queue, retrying up to
   *      `maxAttempts` times (R15.1/R15.2). This is the persistent inbox record
   *      and the live web delivery (R15.5/R15.7).
   *   2. If the session is mobile with a registered device token and FCM is
   *      configured, push via FCM with up to `maxAttempts` attempts (R15.3). If
   *      every attempt fails, fall back to email (R15.4).
   *   3. If nothing has delivered yet, attempt the email fallback as a last
   *      resort so a configured email transport can still reach the user.
   *
   * Never throws: any transport error is caught and treated as a failed
   * channel. When no channel delivers, the result is `{ undelivered: true }`
   * and the caller preserves its pending-input state (R15.2).
   */
  async dispatch(userInput: UserInputNotification): Promise<DispatchResult> {
    const delivered: NotificationChannel[] = []
    const sessionContext = userInput.sessionContext ?? 'web'

    // 1) In-app inbox (R15.1/R15.2/R15.5/R15.7) — retried up to maxAttempts.
    const inAppDelivered = await this.withRetry(
      () => this.enqueueInApp(this.toJobData(userInput)),
      'in-app',
      userInput,
    )
    if (inAppDelivered) delivered.push('in-app')

    // 2) Mobile FCM push (R15.3) with fallback to email on exhaustion (R15.4).
    let fcmAttempted = false
    let fcmDelivered = false
    if (
      sessionContext === 'mobile' &&
      typeof userInput.deviceToken === 'string' &&
      userInput.deviceToken.length > 0 &&
      this.fcm.isConfigured()
    ) {
      fcmAttempted = true
      const deviceToken = userInput.deviceToken
      fcmDelivered = await this.withRetry(
        () =>
          this.fcm.send(deviceToken, {
            title: userInput.title,
            body: userInput.message,
            link: userInput.link,
          }),
        'fcm',
        userInput,
      )
      if (fcmDelivered) delivered.push('fcm')
    }

    // 3) Email fallback (R15.4 mobile-exhausted, or last-resort when nothing
    //    delivered). Only meaningful when a transport is configured.
    const needEmailFallback =
      (fcmAttempted && !fcmDelivered) || delivered.length === 0
    if (needEmailFallback) {
      const emailDelivered = await this.trySendEmail(userInput)
      if (emailDelivered) delivered.push('email')
    }

    const undelivered = delivered.length === 0
    if (undelivered) {
      // R15.2: record undelivered; caller preserves pending-input state. Never throw.
      logger.warn('Auto Pilot notification undelivered on all channels', {
        component: 'autopilot.NotificationDispatcher',
        userId: userInput.userId,
        workspaceId: userInput.workspaceId,
        sessionContext,
      })
    }

    return { delivered, undelivered }
  }

  /**
   * R15.6: email fallback for a web in-app notification that has remained
   * unread for 15 minutes. Called by the scheduled follow-up once the unread
   * window elapses (the 15-minute timing and unread check live in the queue /
   * caller); this method performs the email send and reports the outcome.
   *
   * Never throws. Returns `{ delivered: ['email'], undelivered: false }` when
   * the email is sent, otherwise `{ delivered: [], undelivered: true }`.
   */
  async webEmailFallback(userInput: UserInputNotification): Promise<DispatchResult> {
    const emailDelivered = await this.trySendEmail(userInput)
    return emailDelivered
      ? { delivered: ['email'], undelivered: false }
      : { delivered: [], undelivered: true }
  }

  /**
   * Attempt the email fallback. Returns `false` (without throwing) when email
   * is unconfigured, no address is present, the transport declines, or it
   * errors — so the caller can degrade to `undelivered` (R15.2).
   */
  private async trySendEmail(userInput: UserInputNotification): Promise<boolean> {
    const to = userInput.email
    if (!this.email.isConfigured() || typeof to !== 'string' || to.length === 0) {
      return false
    }
    try {
      return await this.email.send(to, userInput.title, userInput.message)
    } catch (error) {
      logger.error('Auto Pilot email fallback failed', error, {
        component: 'autopilot.NotificationDispatcher',
        userId: userInput.userId,
        workspaceId: userInput.workspaceId,
      })
      return false
    }
  }

  /** Map a User_Input_Notification onto the notification-queue job shape. */
  private toJobData(userInput: UserInputNotification): NotificationJobData {
    return {
      userId: userInput.userId,
      workspaceId: userInput.workspaceId,
      type: userInput.type ?? 'alert',
      title: userInput.title,
      message: userInput.message,
      link: userInput.link,
    }
  }

  /**
   * Run a boolean-returning delivery `attempt` up to `maxAttempts` times,
   * treating both a `false` result and a thrown error as a failed attempt.
   * Returns `true` on the first success, `false` if every attempt fails.
   * Never throws.
   */
  private async withRetry(
    attempt: () => Promise<boolean>,
    channel: NotificationChannel,
    userInput: UserInputNotification,
  ): Promise<boolean> {
    for (let i = 1; i <= this.maxAttempts; i++) {
      try {
        if (await attempt()) return true
      } catch (error) {
        logger.warn('Auto Pilot notification channel attempt threw', {
          component: 'autopilot.NotificationDispatcher',
          userId: userInput.userId,
          workspaceId: userInput.workspaceId,
          channel,
          attempt: i,
          maxAttempts: this.maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return false
  }
}

/** Shared default instance using the inert ports (no Redis/FCM/email wired). */
export const notificationDispatcher = new NotificationDispatcher()
