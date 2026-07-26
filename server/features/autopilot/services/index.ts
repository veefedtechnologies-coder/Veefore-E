/**
 * Auto Pilot — services barrel.
 *
 * Populated by later tasks with the orchestrator and supporting services:
 *   AutoPilotOrchestrator, ContentSourceResolver, LeadTimeEstimator,
 *   ContentBriefService, AutomationDecisionService, MediaPoolService,
 *   GuardrailService, CreditBudgetService, NotificationDispatcher,
 *   AutoPilotChatBridge, AutoPilotAuditService.
 */
export {
  LeadTimeEstimator,
  leadTimeEstimator,
  DEFAULT_LEAD_TIME_CONFIG,
} from './LeadTimeEstimator'
export type { LeadTimeConfig, ContentComplexity } from './LeadTimeEstimator'
export {
  GuardrailService,
  guardrailService,
  maxCountInAnyWindow,
  scheduleRespectsCap,
} from './GuardrailService'
export type {
  FrequencyCapGuardrail,
  GuardrailMissionInput,
  GuardrailAction,
  GuardrailCheck,
  GuardrailViolation,
  GuardrailViolationKind,
} from './GuardrailService'
export {
  CreditBudgetService,
  creditBudgetService,
  DEFAULT_AUTOPILOT_COST_TABLE,
} from './CreditBudgetService'
export type { AutoPilotCostTable, ProjectableItem } from './CreditBudgetService'
export {
  NotificationDispatcher,
  notificationDispatcher,
} from './NotificationDispatcher'
export type {
  NotificationChannel,
  SessionContext,
  UserInputNotification,
  DispatchResult,
  InAppEnqueuer,
  NotificationDispatcherOptions,
} from './NotificationDispatcher'
export {
  AutoPilotAuditService,
  autoPilotAuditService,
} from './AutoPilotAuditService'
export {
  MediaPoolService,
  mediaPoolService,
  MAX_MEDIA_SIZE_BYTES,
  SUPPORTED_MEDIA_TYPES,
} from './MediaPoolService'
export {
  ContentBriefService,
  contentBriefService,
  BRIEF_AI_FEATURE,
  BRIEF_TIMEOUT_MS,
  DEFAULT_BRIEF_LANGUAGE,
  FALLBACK_DEADLINE_OFFSET_MS,
  DEFAULT_FORMAT_COMPLEXITY,
} from './ContentBriefService'
export type {
  BriefMissionInput,
  BriefSlotInput,
  BriefEscalationTarget,
  GenerateBriefOptions,
  BriefContent,
  GenerateBriefResult,
  BriefJSONGenerator,
  BriefStore,
  ContentBriefServiceOptions,
} from './ContentBriefService'
export {
  BriefResolutionService,
  briefResolutionService,
  DEFAULT_RESCHEDULE_STEP_MS,
  BACKUP_MEDIA_TYPE_BY_FORMAT,
} from './BriefResolutionService'
export type {
  ResolutionBriefView,
  ResolutionSlotView,
  ResolutionSlotPatch,
  ResolutionBriefStore,
  ResolutionSlotStore,
  GeneratedBackupMedia,
  BackupMediaGenerator,
  Rescheduler,
  DeliveredMediaInput,
  DeliverBriefResult,
  ResolveUndeliveredResult,
  ResolveOptions,
  BriefResolutionServiceOptions,
} from './BriefResolutionService'
export {
  ContentSourceResolver,
  contentSourceResolver,
  PREFERENCE_ORDER,
  ACCEPTED_MEDIA_TYPES_BY_FORMAT,
} from './ContentSourceResolver'
export type {
  ContentSource,
  ResolverMissionInput,
  ResolverSlotInput,
  ResolverPoolItem,
  CanGenerateAi,
  ContentSourceResolverOptions,
} from './ContentSourceResolver'
export type {
  MediaRejectionReason,
  MediaUploadInput,
  MediaValidationResult,
  AddMediaResult,
  GeneratedMediaInput,
  AssignToSlotResult,
} from './MediaPoolService'
export {
  MediaGenerationAdapter,
  mediaGenerationAdapter,
  MEDIA_AI_FEATURE,
  DEFAULT_IMAGE_STYLE,
  MEDIA_TYPE_BY_FORMAT,
} from './MediaGenerationAdapter'
export type {
  ImageGenerator,
  VideoGenerator,
  GeneratedMedia,
  GenerateMediaInput,
  GenerateMediaResult,
  MediaGenerationAdapterOptions,
  BackupGenerateInput,
} from './MediaGenerationAdapter'
export {
  CaptionService,
  captionService,
  buildHashtags,
  extractHashtags,
  CAPTION_AI_FEATURE,
  VISION_TIMEOUT_MS,
  VISION_RETRIES,
  MAX_CAPTION_REVISIONS,
  MAX_CAPTION_LENGTH,
  MAX_HASHTAGS,
  DEFAULT_CAPTION_LANGUAGE,
  VISION_MEDIA_TYPE_BY_FORMAT,
} from './CaptionService'
export type {
  CaptionMissionInput,
  CaptionSlotInput,
  CaptionEscalationTarget,
  GenerateCaptionOptions,
  GenerateCaptionResult,
  CaptionEscalationReason,
  VisionAnalyzer,
  CaptionGenerator,
  CaptionServiceOptions,
} from './CaptionService'
export type {
  AuditRecordInput,
  AuditEscalationTarget,
  AuditResult,
  AuditWriter,
  AuditDocumentInput,
  EscalationDispatcher,
  AutoPilotAuditServiceOptions,
} from './AutoPilotAuditService'
export {
  AutomationDecisionService,
  automationDecisionService,
  AUTOMATION_AI_FEATURE,
  AUTOMATION_TIMEOUT_MS,
  AUTOMATION_TYPES,
} from './AutomationDecisionService'
export type {
  AutomationType,
  AutomationDmButton,
  AutomationDecision,
  AutomationDecisionMissionInput,
  AutomationDecisionSlotInput,
  DecideOptions,
  AutomationJSONGenerator,
  AutomationDecisionServiceOptions,
} from './AutomationDecisionService'

export {
  ApprovalLifecycleService,
  approvalLifecycleService,
  isExecutable,
} from './ApprovalLifecycleService'
export type {
  ApprovalMissionView,
  ApprovalMissionLookup,
  ApprovalLifecycleStore,
  SlotFallbackResolver,
  ApprovalNotifyContext,
  EditRevalidation,
  ApprovalActionOptions,
  ApproveResult,
  EditResult,
  RejectResult,
  ExpireResult,
  ApprovalLifecycleServiceOptions,
} from './ApprovalLifecycleService'

// Operating Loop stage services (SENSE, THINK, PLAN, …).
export * from './stages'
