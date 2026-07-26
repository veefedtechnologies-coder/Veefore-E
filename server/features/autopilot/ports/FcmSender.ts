/**
 * Auto Pilot — FcmSender port.
 *
 * A thin, pluggable transport port for the mobile push path required by
 * Notifications (R15.3/R15.4): when a User_Input_Notification targets a user
 * whose active session context is mobile and who has a registered FCM device
 * token, the {@link NotificationDispatcher} pushes through this port.
 *
 * The repo has no server-side FCM transport wired yet (the mobile app registers
 * device tokens, but there is no outbound sender), so the shipped default
 * ({@link UnconfiguredFcmSender}) is inert — `isConfigured()` returns `false`
 * and `send()` is a no-op that reports "not sent". The `NotificationDispatcher`
 * checks `isConfigured()` and, when FCM is unavailable or its retries are
 * exhausted, falls back to email (R15.4) and otherwise degrades to the in-app
 * inbox, recording the notification as `undelivered` rather than failing the
 * Operating Loop (R15.2). Wiring a real transport (e.g. firebase-admin) is a
 * one-file change behind this port.
 *
 * Mirrors the {@link EmailNotifier} port so both fallback transports share the
 * same graceful-degradation contract.
 */

/** A push notification payload for a mobile device. */
export interface FcmPushMessage {
  /** Short notification title. */
  title: string
  /** Notification body text. */
  body: string
  /** Optional deep-link the notification opens. */
  link?: string
}

/** Pluggable FCM push transport for Auto Pilot's mobile notifications. */
export interface FcmSender {
  /**
   * Whether a real FCM transport is configured. When `false`, callers must
   * treat mobile push as unavailable and degrade gracefully (never throw).
   */
  isConfigured(): boolean

  /**
   * Push a notification to a registered device token. Resolves `true` when the
   * transport accepted the message, `false` when it was not sent (including the
   * unconfigured default). Implementations should not throw for ordinary
   * delivery failures — they resolve `false` so the caller can retry and fall
   * back and continue.
   */
  send(deviceToken: string, message: FcmPushMessage): Promise<boolean>
}

/**
 * Default {@link FcmSender} used until a transport is wired.
 *
 * Inert by design: `isConfigured()` is always `false` and `send()` always
 * resolves `false` without performing any I/O.
 */
export class UnconfiguredFcmSender implements FcmSender {
  isConfigured(): boolean {
    return false
  }

  async send(_deviceToken: string, _message: FcmPushMessage): Promise<boolean> {
    return false
  }
}

/** Shared inert instance for callers that just need the default port. */
export const unconfiguredFcmSender: FcmSender = new UnconfiguredFcmSender()
