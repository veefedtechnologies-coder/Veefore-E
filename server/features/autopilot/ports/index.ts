/**
 * Auto Pilot — ports barrel.
 *
 * Pluggable transport ports for Auto Pilot. Exposes the {@link EmailNotifier}
 * port (Task 5.1) and the {@link FcmSender} port (Task 5.2) — thin transports
 * that each degrade gracefully to an inert no-op when nothing is configured.
 */
export {
  type EmailNotifier,
  UnconfiguredEmailNotifier,
  unconfiguredEmailNotifier,
} from './EmailNotifier'
export {
  type FcmSender,
  type FcmPushMessage,
  UnconfiguredFcmSender,
  unconfiguredFcmSender,
} from './FcmSender'
