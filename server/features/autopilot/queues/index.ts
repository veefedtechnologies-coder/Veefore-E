/**
 * Auto Pilot — BullMQ queues barrel.
 *
 * Each queue is null-safe without Redis with a lazily-initialised worker.
 * Populated incrementally:
 *   • autopilot-brief — brief send + escalating reminders (Task 10.2).
 *   • autopilot-automation — engagement-rule activate/deactivate lifecycle (Task 15.1).
 * Later tasks add: autopilotLoopQueue.
 */
export * from './briefSchedule'
export * from './autopilotBriefQueue'
export * from './autopilotAutomationQueue'
