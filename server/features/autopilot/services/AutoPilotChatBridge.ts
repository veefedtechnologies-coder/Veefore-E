/**
 * Auto Pilot — AutoPilotChatBridge.
 *
 * The Operating Loop runs in BullMQ workers, outside the VeeGPT HTTP request
 * that owns the NDJSON stream, so it cannot write to that live stream. Instead
 * this bridge pushes narration and Approval Cards into a dedicated **per-mission
 * Auto Pilot conversation** via two channels (design decision 1):
 *
 *   (a) **persistence** — a `ChatMessage` is appended to the mission's Auto
 *       Pilot conversation carrying an optional `autopilotCard` payload (the
 *       Approval_Card / Content_Brief_Card / etc.), so the message is there on
 *       the next chat load even if nobody is currently connected (R16.2);
 *
 *   (b) **live delivery** — the same message is broadcast over
 *       `RealtimeService.broadcastToWorkspace(...)` so a connected client shows
 *       it within seconds, mirroring the existing notification worker (R16.3).
 *
 * Persistence is the authoritative channel: the message is persisted first and
 * the live broadcast is best-effort (a broadcast failure never loses the
 * message, which the client will still see on next load). The per-mission
 * conversation is created lazily and **idempotently** — repeated narrate/push
 * calls reuse the same conversation rather than spawning a new one each tick.
 *
 * Every collaborator (conversation store, message store, realtime broadcaster,
 * id generator, clock) is injected as a port with a MongoDB/RealtimeService
 * default, so the routing logic is fully unit-testable without a database or a
 * live socket server.
 *
 * Satisfies Requirements: 16.2, 16.3
 */

import { logger } from '../../../config/logger'

/** WebSocket event name for a live Auto Pilot chat message (narration/card). */
export const AUTOPILOT_CHAT_EVENT = 'autopilot_message'

/** Default title for a mission's Auto Pilot conversation. */
export const AUTOPILOT_CONVERSATION_TITLE = 'Auto Pilot'

/**
 * The mission context the bridge needs to open (or reuse) a conversation and
 * scope the live broadcast. The caller (controller/worker) resolves the owning
 * `userId` since a `ChatConversation` is owned by a user.
 */
export interface ChatBridgeMission {
  /** The Auto Pilot mission id (1:1 with its conversation). */
  missionId: string
  /** Workspace the mission — and its broadcast — is scoped to. */
  workspaceId: string
  /** Owning user (a conversation belongs to a user). */
  userId: string
}

/**
 * An Auto Pilot card payload persisted on the message and delivered live. The
 * `kind` discriminates the client renderer (`approval`, `content-brief`, …);
 * any additional fields carry the card contents.
 */
export interface AutoPilotCard {
  kind: string
  [key: string]: unknown
}

/** The subset of an Approval needed to render an Approval_Card in chat. */
export interface ApprovalCardInput {
  /** The approval record id (so the client can act on it). */
  approvalId: string
  /** What is awaiting a decision. */
  itemType: 'content-slot' | 'caption' | 'automation' | 'plan' | 'budget'
  /** The underlying item reference (slot/caption/etc.). */
  itemRef?: string
  /** Optional human-readable narration shown alongside the card. */
  text?: string
  /** The Approval_Card contents (caption, media, decision options, …). */
  payload?: Record<string, unknown>
}

/** A reference to a chat conversation (its numeric public id). */
export interface ConversationRef {
  id: number
}

/** Persistence port for the per-mission Auto Pilot conversation. */
export interface AutoPilotConversationStore {
  /** Find the conversation linked to a mission, or `null` if none exists yet. */
  findByMission(missionId: string): Promise<ConversationRef | null>
  /** Create the mission's conversation and return its reference. */
  create(input: {
    id: number
    missionId: string
    workspaceId: string
    userId: string
    title: string
  }): Promise<ConversationRef>
}

/** The message the bridge appends to a conversation. */
export interface AutoPilotMessageInput {
  id: number
  conversationId: number
  role: 'assistant'
  content: string
  autopilotCard?: AutoPilotCard
}

/** A reference to an appended chat message. */
export interface AppendedMessage {
  id: number
  conversationId: number
}

/** Persistence port for appending an Auto Pilot chat message. */
export interface AutoPilotMessageStore {
  append(message: AutoPilotMessageInput): Promise<AppendedMessage>
}

/** Live-delivery port (defaults to `RealtimeService.broadcastToWorkspace`). */
export interface RealtimeBroadcaster {
  broadcastToWorkspace(workspaceId: string, event: string, data: unknown): void
}

/** Injectable dependencies for the bridge. */
export interface AutoPilotChatBridgeOptions {
  conversationStore?: AutoPilotConversationStore
  messageStore?: AutoPilotMessageStore
  broadcaster?: RealtimeBroadcaster
  /** Numeric public-id generator for new conversations/messages. */
  generateId?: () => number
  /** Clock (injectable for deterministic tests). */
  now?: () => number
}

/** The result of pushing narration or a card into the chat. */
export interface ChatPushResult {
  /** The conversation the message landed in. */
  conversationId: number
  /** The appended message id (e.g. to store on the approval — R16.2). */
  messageId: number
  /** Whether the live broadcast succeeded (persistence always succeeds first). */
  broadcast: boolean
}

/** Matches the existing chat id scheme (`Date.now() % 1e9 + rand`). */
function defaultGenerateId(): number {
  return (Date.now() % 1_000_000_000) + Math.floor(Math.random() * 1000)
}

/**
 * Bridges the background Operating Loop into the VeeGPT chat: ensures a
 * per-mission conversation, appends persisted narration/approval messages, and
 * live-broadcasts them (R16.2, R16.3).
 */
export class AutoPilotChatBridge {
  private readonly conversationStore: AutoPilotConversationStore
  private readonly messageStore: AutoPilotMessageStore
  private readonly broadcaster: RealtimeBroadcaster
  private readonly generateId: () => number
  private readonly now: () => number

  /**
   * Single-flight guard so concurrent narrate/push calls for the same mission
   * do not each create a duplicate conversation (idempotency).
   */
  private readonly ensuring = new Map<string, Promise<ConversationRef>>()

  constructor(options: AutoPilotChatBridgeOptions = {}) {
    this.conversationStore = options.conversationStore ?? chatModelConversationStore
    this.messageStore = options.messageStore ?? chatModelMessageStore
    this.broadcaster = options.broadcaster ?? realtimeBroadcaster
    this.generateId = options.generateId ?? defaultGenerateId
    this.now = options.now ?? (() => Date.now())
  }

  /**
   * Ensure the mission's Auto Pilot conversation exists and return it. Idempotent:
   * an existing conversation is reused; concurrent callers share one create via
   * the single-flight guard, and a create that loses a race falls back to the
   * winner's conversation.
   */
  async ensureConversation(mission: ChatBridgeMission): Promise<ConversationRef> {
    const existing = await this.conversationStore.findByMission(mission.missionId)
    if (existing) return existing

    const inFlight = this.ensuring.get(mission.missionId)
    if (inFlight) return inFlight

    const createPromise = (async () => {
      // Re-check inside the critical section in case another call just created it.
      const raced = await this.conversationStore.findByMission(mission.missionId)
      if (raced) return raced
      return this.conversationStore.create({
        id: this.generateId(),
        missionId: mission.missionId,
        workspaceId: mission.workspaceId,
        userId: mission.userId,
        title: AUTOPILOT_CONVERSATION_TITLE,
      })
    })()

    this.ensuring.set(mission.missionId, createPromise)
    try {
      return await createPromise
    } finally {
      this.ensuring.delete(mission.missionId)
    }
  }

  /**
   * Narrate an Operating Loop decision as a plain assistant message in the
   * mission's Auto Pilot conversation (R16.2), broadcast live (R16.3).
   */
  async narrate(mission: ChatBridgeMission, text: string): Promise<ChatPushResult> {
    return this.push(mission, text, undefined)
  }

  /**
   * Push an Approval_Card into the mission's Auto Pilot conversation (R16.3):
   * persist a message carrying the card, then broadcast it. Returns the appended
   * message id so the caller can record it on the Approval (R16.2).
   */
  async pushApprovalCard(
    mission: ChatBridgeMission,
    approval: ApprovalCardInput,
  ): Promise<ChatPushResult> {
    const card: AutoPilotCard = {
      kind: 'approval',
      approvalId: approval.approvalId,
      itemType: approval.itemType,
      ...(approval.itemRef ? { itemRef: approval.itemRef } : {}),
      ...(approval.payload ?? {}),
    }
    const text =
      approval.text ?? `Approval needed for ${approval.itemType.replace('-', ' ')}.`
    return this.push(mission, text, card)
  }

  /**
   * Core path shared by narration and cards: ensure the conversation, persist
   * the message (authoritative), then best-effort broadcast for live delivery.
   */
  private async push(
    mission: ChatBridgeMission,
    text: string,
    card: AutoPilotCard | undefined,
  ): Promise<ChatPushResult> {
    const conversation = await this.ensureConversation(mission)

    // (a) Persistence — authoritative channel (R16.2).
    const appended = await this.messageStore.append({
      id: this.generateId(),
      conversationId: conversation.id,
      role: 'assistant',
      // ChatMessage.content is required; keep a non-empty label for card-only pushes.
      content: text && text.length > 0 ? text : ' ',
      autopilotCard: card,
    })

    // (b) Live delivery — best-effort (R16.3). A failure never loses the message.
    const broadcast = this.tryBroadcast(mission, {
      conversationId: conversation.id,
      messageId: appended.id,
      missionId: mission.missionId,
      role: 'assistant',
      content: text,
      autopilotCard: card,
      at: this.now(),
    })

    return { conversationId: conversation.id, messageId: appended.id, broadcast }
  }

  /** Broadcast the message live; swallow (log) errors so persistence stands. */
  private tryBroadcast(mission: ChatBridgeMission, data: Record<string, unknown>): boolean {
    try {
      this.broadcaster.broadcastToWorkspace(
        mission.workspaceId,
        AUTOPILOT_CHAT_EVENT,
        data,
      )
      return true
    } catch (error) {
      logger.warn('Auto Pilot chat broadcast failed (message persisted)', {
        component: 'autopilot.AutoPilotChatBridge',
        missionId: mission.missionId,
        workspaceId: mission.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Default MongoDB / RealtimeService-backed ports.
 * ------------------------------------------------------------------------- */

/** Conversation store backed by the existing `ChatConversation` model. */
export const chatModelConversationStore: AutoPilotConversationStore = {
  async findByMission(missionId) {
    const { ChatConversation } = await import('../../../models/Chat')
    const doc = await ChatConversation.findOne({ autopilotMissionId: missionId })
      .select('id')
      .lean()
      .exec()
    return doc ? { id: (doc as { id: number }).id } : null
  },
  async create({ id, missionId, workspaceId, userId, title }) {
    const { ChatConversation } = await import('../../../models/Chat')
    const doc = await ChatConversation.create({
      id,
      userId,
      workspaceId,
      title,
      autopilotMissionId: missionId,
      messageCount: 0,
      lastMessageAt: new Date(),
    })
    return { id: doc.id }
  },
}

/** Message store backed by the existing `ChatMessage` model. */
export const chatModelMessageStore: AutoPilotMessageStore = {
  async append(message) {
    const { ChatMessage, ChatConversation } = await import('../../../models/Chat')
    const doc = await ChatMessage.create({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      autopilotCard: message.autopilotCard,
      tokensUsed: 0,
    })
    // Keep the conversation's counters fresh so it sorts/reads correctly.
    await ChatConversation.updateOne(
      { id: message.conversationId },
      { $inc: { messageCount: 1 }, lastMessageAt: new Date(), updatedAt: new Date() },
    ).exec()
    return { id: doc.id, conversationId: message.conversationId }
  },
}

/** Live-delivery port backed by the static `RealtimeService`. */
export const realtimeBroadcaster: RealtimeBroadcaster = {
  broadcastToWorkspace(workspaceId, event, data) {
    // Lazy import keeps the socket server out of the unit-test path.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RealtimeService } = require('../../../services/realtime')
    RealtimeService.broadcastToWorkspace(workspaceId, event, data)
  },
}

/** Shared default instance wired to MongoDB + RealtimeService. */
export const autoPilotChatBridge = new AutoPilotChatBridge()
