import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ChatConversation, ChatMessage, UserMemory } from '../server/models/Chat';
import { planLongTermWindow, LONG_TERM_VERBATIM, type Msg } from '../server/routes/veegpt-memory.logic';

// The models may be bound to a different mongoose instance than the one this
// test would import directly (the project has both a root and a server-level
// mongoose install). Use the SAME instance the models are bound to so our
// connection actually backs their queries.
const mongoose = ChatConversation.base;

/**
 * Integration test against a real (in-memory) MongoDB. This exercises the exact
 * Mongoose models and the same persistence operations the chat route performs:
 *  - conversation summary defaults + persistence
 *  - the long-term summarization fold loop (using the real planLongTermWindow)
 *  - the cross-chat UserMemory upsert ($set/$addToSet/$setOnInsert) and its
 *    userId+workspaceId isolation (unique index)
 * The AI provider is stubbed with a deterministic fake summarizer.
 */

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await ChatConversation.deleteMany({});
  await ChatMessage.deleteMany({});
  await UserMemory.deleteMany({});
}, 30_000);

async function seedMessages(convId: number, n: number) {
  const docs = Array.from({ length: n }, (_, i) => ({
    id: convId * 100000 + i,
    conversationId: convId,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`,
    tokensUsed: 0,
    createdAt: new Date(Date.now() + i * 1000), // strictly increasing
  }));
  await ChatMessage.insertMany(docs);
}

/** Deterministic fake summarizer (stand-in for aiServiceManager.generateText). */
function fakeSummarize(previous: string, batch: Msg[]): string {
  const ids = batch.map((m) => m.content).join(',');
  return previous ? `${previous}|${ids}` : ids;
}

describe('ChatConversation summary persistence', () => {
  it('new conversation defaults: empty summary, zero summarized count', async () => {
    await ChatConversation.create({
      id: 1, userId: 'u1', workspaceId: 'w1', title: 'New chat', messageCount: 0,
    });
    const conv = await ChatConversation.findOne({ id: 1 }).lean();
    expect((conv as any).memorySummary).toBe('');
    expect((conv as any).summarizedMessageCount).toBe(0);
  });

  it('rolling fold loop persists summary + advances count, with no data loss', async () => {
    const convId = 7;
    await ChatConversation.create({ id: convId, userId: 'u1', workspaceId: 'w1', title: 't', messageCount: 0 });
    await seedMessages(convId, 100);

    // Replicate the route's long-term build step using the REAL model reads and
    // the REAL planning logic.
    const conv = await ChatConversation.findOne({ id: convId }).lean();
    let summary = (conv as any).memorySummary || '';
    let summarizedCount = (conv as any).summarizedMessageCount || 0;

    const all = await ChatMessage.find({ conversationId: convId }).sort({ createdAt: 1 }).lean();
    const ordered: Msg[] = all.map((m) => ({ role: m.role, content: m.content }));
    const plan = planLongTermWindow(ordered, summarizedCount);

    expect(plan.needsSummarization).toBe(true);
    summary = fakeSummarize(summary, plan.toSummarize);
    summarizedCount = plan.newSummarizedCount;
    await ChatConversation.updateOne(
      { id: convId },
      { memorySummary: summary, summarizedMessageCount: summarizedCount },
    );

    const after = await ChatConversation.findOne({ id: convId }).lean();
    // 100 messages: overflow = 100 - LONG_TERM_VERBATIM folded into the summary.
    const expectedFolded = 100 - LONG_TERM_VERBATIM;
    expect((after as any).summarizedMessageCount).toBe(expectedFolded);
    expect((after as any).memorySummary).toContain('m0');
    expect((after as any).memorySummary).toContain(`m${expectedFolded - 1}`);
    // The verbatim history keeps exactly the newest LONG_TERM_VERBATIM, no overlap.
    expect(plan.history).toHaveLength(LONG_TERM_VERBATIM);
    expect(plan.history[0].content).toBe(`m${expectedFolded}`);
    expect(plan.history[LONG_TERM_VERBATIM - 1].content).toBe('m99');
  });

  it('second pass after more messages folds only the new overflow (no re-fold)', async () => {
    const convId = 8;
    const alreadyFolded = 60;
    await ChatConversation.create({
      id: convId, userId: 'u1', workspaceId: 'w1', title: 't', messageCount: 0,
      memorySummary: 'prior-summary', summarizedMessageCount: alreadyFolded,
    });
    const total = 130;
    await seedMessages(convId, total);

    const conv = await ChatConversation.findOne({ id: convId }).lean();
    const all = await ChatMessage.find({ conversationId: convId }).sort({ createdAt: 1 }).lean();
    const ordered: Msg[] = all.map((m) => ({ role: m.role, content: m.content }));
    const plan = planLongTermWindow(ordered, (conv as any).summarizedMessageCount);

    // unsummarized = total - alreadyFolded; overflow = unsummarized - LONG_TERM_VERBATIM.
    const unsummarized = total - alreadyFolded;
    const expectedOverflow = unsummarized - LONG_TERM_VERBATIM;
    expect(plan.needsSummarization).toBe(true);
    expect(plan.toSummarize.map((m) => m.content)[0]).toBe(`m${alreadyFolded}`); // first NEW unsummarized
    expect(plan.toSummarize).toHaveLength(expectedOverflow);
    expect(plan.newSummarizedCount).toBe(alreadyFolded + expectedOverflow);
    // History starts right after the newly folded block — never re-includes folded msgs.
    expect(plan.history[0].content).toBe(`m${alreadyFolded + expectedOverflow}`);
    expect(plan.history).toHaveLength(LONG_TERM_VERBATIM);
  });
});

describe('UserMemory cross-chat layer (item-based)', () => {
  it('stores discrete items scoped to userId+workspaceId', async () => {
    await UserMemory.updateOne(
      { userId: 'u1', workspaceId: 'w1' },
      {
        $set: {
          items: [
            { id: 'a', text: 'Name is Alice', createdAt: new Date() },
            { id: 'b', text: 'Niche is fitness', createdAt: new Date() },
          ],
          updatedAt: new Date(),
        },
        $addToSet: { processedConversationIds: 101 },
        $setOnInsert: { userId: 'u1', workspaceId: 'w1', createdAt: new Date() },
      },
      { upsert: true },
    );
    const mem = await UserMemory.findOne({ userId: 'u1', workspaceId: 'w1' }).lean();
    expect((mem as any).items).toHaveLength(2);
    expect((mem as any).items.map((i: any) => i.text)).toContain('Name is Alice');
    expect((mem as any).processedConversationIds).toContain(101);
  });

  it('deletes a single item by id with $pull', async () => {
    await UserMemory.create({
      userId: 'u1', workspaceId: 'w1',
      items: [
        { id: 'a', text: 'fact a', createdAt: new Date() },
        { id: 'b', text: 'fact b', createdAt: new Date() },
      ],
    });
    await UserMemory.updateOne({ userId: 'u1', workspaceId: 'w1' }, { $pull: { items: { id: 'a' } } });
    const mem = await UserMemory.findOne({ userId: 'u1', workspaceId: 'w1' }).lean();
    expect((mem as any).items).toHaveLength(1);
    expect((mem as any).items[0].id).toBe('b');
  });

  it('does not duplicate processed conversation ids', async () => {
    const where = { userId: 'u1', workspaceId: 'w1' };
    const op = (convId: number) =>
      UserMemory.updateOne(
        where,
        { $addToSet: { processedConversationIds: convId }, $setOnInsert: { ...where, createdAt: new Date() } },
        { upsert: true },
      );
    await op(1);
    await op(1); // same again
    await op(2);
    const mem = await UserMemory.findOne(where).lean();
    expect((mem as any).processedConversationIds.sort()).toEqual([1, 2]);
  });

  it('isolates memory between users and between workspaces', async () => {
    const mk = (userId: string, workspaceId: string, text: string) =>
      UserMemory.updateOne(
        { userId, workspaceId },
        { $set: { items: [{ id: 'x', text, createdAt: new Date() }] }, $setOnInsert: { userId, workspaceId, createdAt: new Date() } },
        { upsert: true },
      );
    await mk('u1', 'w1', 'alice-w1');
    await mk('u1', 'w2', 'alice-w2');
    await mk('u2', 'w1', 'bob-w1');

    expect((await UserMemory.findOne({ userId: 'u1', workspaceId: 'w1' }).lean() as any).items[0].text).toBe('alice-w1');
    expect((await UserMemory.findOne({ userId: 'u1', workspaceId: 'w2' }).lean() as any).items[0].text).toBe('alice-w2');
    expect((await UserMemory.findOne({ userId: 'u2', workspaceId: 'w1' }).lean() as any).items[0].text).toBe('bob-w1');
    expect(await UserMemory.countDocuments({})).toBe(3);
  });

  it('enforces a unique (userId, workspaceId) index', async () => {
    await UserMemory.init(); // ensure indexes are built
    await UserMemory.create({ userId: 'u1', workspaceId: 'w1', items: [] });
    await expect(
      UserMemory.create({ userId: 'u1', workspaceId: 'w1', items: [] }),
    ).rejects.toThrow();
  });
});
