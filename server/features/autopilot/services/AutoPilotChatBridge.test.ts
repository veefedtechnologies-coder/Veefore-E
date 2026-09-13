/**
 * Tests for AutoPilotChatBridge (chat narration + approval cards → VeeGPT chat).
 *
 * Unit tests pin the concrete behaviours the bridge guarantees for R16.2/R16.3:
 *   - ensure-conversation is idempotent: an existing per-mission conversation is
 *     reused, a missing one is created exactly once (even under concurrency);
 *   - narrate/pushApprovalCard append exactly one persisted `ChatMessage`, and a
 *     card push carries the `autopilotCard` payload on the message;
 *   - every push live-broadcasts the message over the RealtimeService port
 *     scoped to the mission's workspace, and a broadcast failure never loses the
 *     persisted message.
 *
 * The bridge is exercised through injected in-memory ports, so no MongoDB or
 * socket server is required.
 *
 * Satisfies Requirements: 16.2, 16.3
 */

import { describe, it, expect, vi } from 'vitest'
import {
  AutoPilotChatBridge,
  AUTOPILOT_CHAT_EVENT,
  AUTOPILOT_CONVERSATION_TITLE,
  type AppendedMessage,
  type ApprovalCardInput,
  type AutoPilotConversationStore,
  type AutoPilotMessageInput,
  type AutoPilotMessageStore,
  type ChatBridgeMission,
  type ConversationRef,
  type RealtimeBroadcaster,
} from './AutoPilotChatBridge'

const mission: ChatBridgeMission = {
  missionId: 'mission-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
}

/** In-memory conversation store recording finds/creates. */
function memoryConversationStore(seed?: Record<string, ConversationRef>) {
  const byMission = new Map<string, ConversationRef>(Object.entries(seed ?? {}))
  const store = {
    creates: 0,
    finds: 0,
    byMission,
    async findByMission(missionId: string) {
      store.finds++
      return byMission.get(missionId) ?? null
    },
    async create(input: { id: number; missionId: string; title: string }) {
      store.creates++
      const ref: ConversationRef = { id: input.id }
      byMission.set(input.missionId, ref)
      return ref
    },
  }
  return store as AutoPilotConversationStore & typeof store
}

/** In-memory message store capturing appended messages. */
function memoryMessageStore() {
  const appended: AutoPilotMessageInput[] = []
  const store: AutoPilotMessageStore & { appended: AutoPilotMessageInput[] } = {
    appended,
    async append(message: AutoPilotMessageInput): Promise<AppendedMessage> {
      appended.push(message)
      return { id: message.id, conversationId: message.conversationId }
    },
  }
  return store
}

/** Broadcaster spy capturing (workspaceId, event, data). */
function spyBroadcaster() {
  const calls: Array<{ workspaceId: string; event: string; data: any }> = []
  const broadcaster: RealtimeBroadcaster & { calls: typeof calls } = {
    calls,
    broadcastToWorkspace(workspaceId, event, data) {
      calls.push({ workspaceId, event, data })
    },
  }
  return broadcaster
}

/** A monotonic id generator so appended ids are deterministic and unique. */
function seqIds(start = 1000) {
  let n = start
  return () => n++
}

describe('AutoPilotChatBridge.ensureConversation — idempotency (R16.2)', () => {
  it('reuses an existing per-mission conversation without creating a new one', async () => {
    const conversationStore = memoryConversationStore({ 'mission-1': { id: 42 } })
    const bridge = new AutoPilotChatBridge({
      conversationStore,
      messageStore: memoryMessageStore(),
      broadcaster: spyBroadcaster(),
    })

    const first = await bridge.ensureConversation(mission)
    const second = await bridge.ensureConversation(mission)

    expect(first.id).toBe(42)
    expect(second.id).toBe(42)
    expect(conversationStore.creates).toBe(0)
  })

  it('creates the conversation exactly once when none exists', async () => {
    const conversationStore = memoryConversationStore()
    const bridge = new AutoPilotChatBridge({
      conversationStore,
      messageStore: memoryMessageStore(),
      broadcaster: spyBroadcaster(),
      generateId: seqIds(500),
    })

    const first = await bridge.ensureConversation(mission)
    const second = await bridge.ensureConversation(mission)

    expect(first.id).toBe(500)
    expect(second.id).toBe(500)
    expect(conversationStore.creates).toBe(1)
  })

  it('creates the conversation only once under concurrent calls (single-flight)', async () => {
    const conversationStore = memoryConversationStore()
    const bridge = new AutoPilotChatBridge({
      conversationStore,
      messageStore: memoryMessageStore(),
      broadcaster: spyBroadcaster(),
      generateId: seqIds(700),
    })

    const [a, b, c] = await Promise.all([
      bridge.ensureConversation(mission),
      bridge.ensureConversation(mission),
      bridge.ensureConversation(mission),
    ])

    expect(a.id).toBe(b.id)
    expect(b.id).toBe(c.id)
    expect(conversationStore.creates).toBe(1)
  })

  it('creates a conversation titled "Auto Pilot" for the mission owner', async () => {
    const conversationStore = memoryConversationStore()
    const createSpy = vi.spyOn(conversationStore, 'create')
    const bridge = new AutoPilotChatBridge({
      conversationStore,
      messageStore: memoryMessageStore(),
      broadcaster: spyBroadcaster(),
      generateId: seqIds(900),
    })

    await bridge.ensureConversation(mission)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 900,
        missionId: 'mission-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        title: AUTOPILOT_CONVERSATION_TITLE,
      }),
    )
  })
})

describe('AutoPilotChatBridge.narrate — append + broadcast (R16.2, R16.3)', () => {
  it('appends exactly one assistant message with the narration text and no card', async () => {
    const messageStore = memoryMessageStore()
    const bridge = new AutoPilotChatBridge({
      conversationStore: memoryConversationStore({ 'mission-1': { id: 10 } }),
      messageStore,
      broadcaster: spyBroadcaster(),
      generateId: seqIds(1),
    })

    const result = await bridge.narrate(mission, 'Planned 3 posts for this week.')

    expect(messageStore.appended).toHaveLength(1)
    const msg = messageStore.appended[0]
    expect(msg.conversationId).toBe(10)
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('Planned 3 posts for this week.')
    expect(msg.autopilotCard).toBeUndefined()
    expect(result.messageId).toBe(msg.id)
    expect(result.conversationId).toBe(10)
  })

  it('live-broadcasts the narration to the mission workspace', async () => {
    const broadcaster = spyBroadcaster()
    const bridge = new AutoPilotChatBridge({
      conversationStore: memoryConversationStore({ 'mission-1': { id: 10 } }),
      messageStore: memoryMessageStore(),
      broadcaster,
      generateId: seqIds(1),
      now: () => 1234,
    })

    const result = await bridge.narrate(mission, 'Sensed analytics.')

    expect(result.broadcast).toBe(true)
    expect(broadcaster.calls).toHaveLength(1)
    const call = broadcaster.calls[0]
    expect(call.workspaceId).toBe('ws-1')
    expect(call.event).toBe(AUTOPILOT_CHAT_EVENT)
    expect(call.data).toMatchObject({
      conversationId: 10,
      missionId: 'mission-1',
      role: 'assistant',
      content: 'Sensed analytics.',
      at: 1234,
    })
  })
})

describe('AutoPilotChatBridge.pushApprovalCard — autopilotCard payload (R16.2, R16.3)', () => {
  const approval: ApprovalCardInput = {
    approvalId: 'appr-1',
    itemType: 'caption',
    itemRef: 'slot-9',
    text: 'Approve this caption?',
    payload: { caption: 'Sunset vibes 🌅', hashtags: ['#sunset'] },
  }

  it('appends a message carrying the approval card payload', async () => {
    const messageStore = memoryMessageStore()
    const bridge = new AutoPilotChatBridge({
      conversationStore: memoryConversationStore({ 'mission-1': { id: 5 } }),
      messageStore,
      broadcaster: spyBroadcaster(),
      generateId: seqIds(1),
    })

    const result = await bridge.pushApprovalCard(mission, approval)

    expect(messageStore.appended).toHaveLength(1)
    const msg = messageStore.appended[0]
    expect(msg.content).toBe('Approve this caption?')
    expect(msg.autopilotCard).toEqual({
      kind: 'approval',
      approvalId: 'appr-1',
      itemType: 'caption',
      itemRef: 'slot-9',
      caption: 'Sunset vibes 🌅',
      hashtags: ['#sunset'],
    })
    // The appended message id is returned so it can be stored on the Approval (R16.2).
    expect(result.messageId).toBe(msg.id)
  })

  it('broadcasts the card live with the autopilotCard attached', async () => {
    const broadcaster = spyBroadcaster()
    const bridge = new AutoPilotChatBridge({
      conversationStore: memoryConversationStore({ 'mission-1': { id: 5 } }),
      messageStore: memoryMessageStore(),
      broadcaster,
      generateId: seqIds(1),
    })

    await bridge.pushApprovalCard(mission, approval)

    expect(broadcaster.calls).toHaveLength(1)
    expect(broadcaster.calls[0].event).toBe(AUTOPILOT_CHAT_EVENT)
    expect((broadcaster.calls[0].data as any).autopilotCard.kind).toBe('approval')
    expect((broadcaster.calls[0].data as any).autopilotCard.approvalId).toBe('appr-1')
  })

  it('defaults the narration text when none is provided, and never leaves content empty', async () => {
    const messageStore = memoryMessageStore()
    const bridge = new AutoPilotChatBridge({
      conversationStore: memoryConversationStore({ 'mission-1': { id: 5 } }),
      messageStore,
      broadcaster: spyBroadcaster(),
      generateId: seqIds(1),
    })

    await bridge.pushApprovalCard(mission, {
      approvalId: 'appr-2',
      itemType: 'content-slot',
    })

    const msg = messageStore.appended[0]
    expect(msg.content).toContain('content slot')
    expect(msg.content.length).toBeGreaterThan(0)
    expect(msg.autopilotCard).toMatchObject({ kind: 'approval', approvalId: 'appr-2' })
  })
})

describe('AutoPilotChatBridge — persistence stands when broadcast fails (R16.2)', () => {
  it('still persists the message and reports broadcast=false without throwing', async () => {
    const messageStore = memoryMessageStore()
    const throwingBroadcaster: RealtimeBroadcaster = {
      broadcastToWorkspace() {
        throw new Error('socket server down')
      },
    }
    const bridge = new AutoPilotChatBridge({
      conversationStore: memoryConversationStore({ 'mission-1': { id: 8 } }),
      messageStore,
      broadcaster: throwingBroadcaster,
      generateId: seqIds(1),
    })

    const result = await bridge.narrate(mission, 'Measured progress.')

    // Message persisted (authoritative channel) even though live delivery failed.
    expect(messageStore.appended).toHaveLength(1)
    expect(result.broadcast).toBe(false)
    expect(result.messageId).toBe(messageStore.appended[0].id)
  })
})
