/**
 * Auto Pilot — EmailNotifier port.
 *
 * A thin, pluggable transport port for the email fallback path required by
 * Notifications (R15.4/R15.6): when FCM push retries are exhausted, or a web
 * in-app inbox notification stays unread for 15 minutes, the notification is
 * sent by email.
 *
 * The repo has no email transport yet, so the shipped default
 * ({@link UnconfiguredEmailNotifier}) is inert — `isConfigured()` returns
 * `false` and `send()` is a no-op that reports "not sent". The
 * `NotificationDispatcher` (Task 5.2) checks `isConfigured()` and degrades to
 * in-app-only delivery, recording the notification as `undelivered` rather than
 * failing the Operating Loop (R15.2). Wiring a real transport (e.g. SES/Resend)
 * is a one-file change behind this port.
 *
 * Satisfies Requirements: 15.3
 */

/** Pluggable email transport for Auto Pilot's fallback notifications. */
export interface EmailNotifier {
  /**
   * Whether a real email transport is configured. When `false`, callers must
   * treat email as unavailable and degrade gracefully (never throw).
   */
  isConfigured(): boolean

  /**
   * Send an email. Resolves `true` when the transport accepted the message,
   * `false` when it was not sent (including the unconfigured default).
   * Implementations should not throw for ordinary delivery failures — they
   * resolve `false` so the caller can fall back and continue.
   */
  send(to: string, subject: string, body: string): Promise<boolean>
}

/**
 * Default {@link EmailNotifier} used until a transport is wired.
 *
 * Inert by design: `isConfigured()` is always `false` and `send()` always
 * resolves `false` without performing any I/O.
 */
export class UnconfiguredEmailNotifier implements EmailNotifier {
  isConfigured(): boolean {
    return false
  }

  async send(_to: string, _subject: string, _body: string): Promise<boolean> {
    return false
  }
}

/** Shared inert instance for callers that just need the default port. */
export const unconfiguredEmailNotifier: EmailNotifier = new UnconfiguredEmailNotifier()
