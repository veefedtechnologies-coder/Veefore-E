/**
 * Auto Pilot — Operating Loop stage services barrel.
 *
 * Populated by later tasks with the stage services:
 *   SenseService, StrategyService, PlannerService, GateService, ActService,
 *   MeasureService, LearnService.
 */
export {
  SenseService,
  senseService,
  ANALYTICS_ESCALATION_STREAK,
  DEFAULT_SENSE_ANALYTICS_DAYS,
} from './SenseService'
export type {
  PerformanceSummary,
  ReducedInput,
  AnalyticsSummaryReader,
  TrendResearchRunner,
  SenseMissionInput,
  SenseOptions,
  SenseResult,
  SenseServiceOptions,
} from './SenseService'
export {
  StrategyService,
  strategyService,
  STRATEGY_AI_FEATURE,
  STRATEGY_TIMEOUT_MS,
} from './StrategyService'
export type {
  Strategy,
  StrategyCadence,
  StrategyMissionInput,
  DeriveStrategyOptions,
  DeriveStrategyResult,
  StrategyJSONGenerator,
  StrategyServiceOptions,
} from './StrategyService'
export {
  PlannerService,
  plannerService,
  MIN_PLANNING_HORIZON_DAYS,
  MAX_SLOTS_PER_PLAN,
  DEFAULT_FORMAT_ROTATION,
  FORMAT_COMPLEXITY,
  ACTIVE_SLOT_STATUSES,
} from './PlannerService'
export type {
  PlannerMissionInput,
  PlannedSlot,
  PlanResult,
  PlanOptions,
  PlannerSlotStore,
  PlannerPoolReader,
  PlannerServiceOptions,
} from './PlannerService'
export { GateService, gateService } from './GateService'
export type {
  GateDecision,
  GateMissionInput,
  GateableItem,
  GateRoutedItem,
  RouteResult,
  GateNotifyContext,
  RouteOptions,
  GateApprovalStore,
  GateNotificationDispatcher,
  GateServiceOptions,
} from './GateService'
export {
  ActPublishService,
  actPublishService,
  slotHasMediaOrFallback,
  PRE_PUBLISH_GUARD_LEAD_MS,
  DEFAULT_PUBLISH_MAX_RETRIES,
  CONTENT_TYPE_BY_FORMAT,
} from './ActPublishService'
export type {
  ActMissionInput,
  ActSlotInput,
  ContentDataPayload,
  ContentDocumentInput,
  ContentStore,
  PublishScheduler,
  ActSlotStore,
  ResolvedSlotMedia,
  SlotMediaResolver,
  PrePublishFallbackResolver,
  ActPublishServiceOptions,
  ScheduleForPublishingResult,
  PrePublishGuardResult,
} from './ActPublishService'
export {
  MeasureService,
  measureService,
  extractGoalMetricValue,
  DEFAULT_MEASURE_ANALYTICS_DAYS,
  MEASURED_SLOT_STATUS,
} from './MeasureService'
export type {
  MeasureAnalyticsReader,
  MeasureSlotStore,
  MeasureProgressStore,
  SlotMetrics,
  SlotPerformanceReader,
  MeasureMissionInput,
  MeasureOptions,
  SlotPerformance,
  MeasureResult,
  MeasureServiceOptions,
} from './MeasureService'
