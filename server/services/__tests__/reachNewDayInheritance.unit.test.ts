/**
 * Regression tests for the reach "new-day zero" bug.
 *
 * Bug: account-level reach (reach / reachDay / reachWeek / reachDays28) is a
 * rolling de-duplicated window value Meta returns per sync — NOT a per-day-zero
 * counter. On the first sync of a new calendar day the analytics record was
 * created with reach=0, and because most smart-polling jobs (followers / likes /
 * new_posts) legitimately pass reach=undefined, "preserve current value" kept
 * that 0 until the next account-insights poll — making "Monthly Reach" flash to
 * 0 each day.
 *
 * Fix (correct-by-construction): a new-day record INHERITS the prior record's
 * reach values at creation (AnalyticsRepository.getOrCreateForDate). With that,
 * recordMetrics' plain "preserve current" logic keeps the inherited value when
 * a job omits reach, and the account-insights job still overwrites it with the
 * fresh value. No carry-forward special-casing is needed in recordMetrics.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    db: { query: vi.fn(), error: vi.fn() },
  },
}));

import { AnalyticsRepository } from '../../repositories/AnalyticsRepository';

describe('AnalyticsRepository.getOrCreateForDate — reach inheritance', () => {
  let repo: AnalyticsRepository;

  beforeEach(() => {
    repo = new AnalyticsRepository();
    vi.restoreAllMocks();
  });

  it('inherits prior reach values when creating a brand-new day record', async () => {
    // No record exists for today.
    vi.spyOn(repo as any, 'findOne').mockResolvedValue(null);
    // Prior day has real reach.
    vi.spyOn(repo, 'findOneBeforeDate').mockResolvedValue({
      reach: 510, reachDay: 0, reachWeek: 0, reachDays28: 413,
    } as any);
    const createSpy = vi.spyOn(repo as any, 'create').mockImplementation(async (doc: any) => doc);

    await repo.getOrCreateForDate('ws', 'instagram', new Date('2026-06-23T08:00:00Z'), 'acc');

    const created = createSpy.mock.calls[0][0] as any;
    expect(created.reach).toBe(510);
    expect(created.reachDays28).toBe(413); // inherited, NOT 0
  });

  it('defaults reach to 0 when there is no prior record', async () => {
    vi.spyOn(repo as any, 'findOne').mockResolvedValue(null);
    vi.spyOn(repo, 'findOneBeforeDate').mockResolvedValue(null);
    const createSpy = vi.spyOn(repo as any, 'create').mockImplementation(async (doc: any) => doc);

    await repo.getOrCreateForDate('ws', 'instagram', new Date('2026-06-23T08:00:00Z'), 'acc');

    const created = createSpy.mock.calls[0][0] as any;
    expect(created.reach).toBe(0);
    expect(created.reachDays28).toBeUndefined(); // omitted → schema default 0, not a stale value
  });

  it('does not create (or inherit) when a record already exists for the day', async () => {
    vi.spyOn(repo as any, 'findOne').mockResolvedValue({ reach: 450, reachDays28: 450 } as any);
    const beforeSpy = vi.spyOn(repo, 'findOneBeforeDate');
    const createSpy = vi.spyOn(repo as any, 'create');

    const result = await repo.getOrCreateForDate('ws', 'instagram', new Date('2026-06-23T08:00:00Z'), 'acc');

    expect(createSpy).not.toHaveBeenCalled();
    expect(beforeSpy).not.toHaveBeenCalled();
    expect((result as any).reachDays28).toBe(450);
  });
});

describe('AnalyticsService.recordMetrics — reach preserve (no carry-forward needed)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('preserves the (inherited) current reach when a job omits reach', async () => {
    vi.doMock('../../repositories/AnalyticsRepository', () => ({
      analyticsRepository: {
        // New-day record already carries the inherited 413 thanks to getOrCreateForDate.
        getOrCreateForDate: vi.fn().mockResolvedValue({
          _id: 'today', date: new Date('2026-06-23T00:00:00Z'),
          posts: 26, reach: 510, reachDay: 0, reachWeek: 0, reachDays28: 413,
        }),
        findOneBeforeDate: vi.fn().mockResolvedValue({ date: new Date('2026-06-22'), posts: 26 }),
        updateMetrics: vi.fn().mockImplementation(async (_id: string, data: any) => ({ _id, ...data })),
      },
    }));
    vi.doMock('../../repositories/SocialAccountRepository', () => ({ socialAccountRepository: {} }));
    vi.doMock('../../config/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), db: { query: vi.fn(), error: vi.fn() } },
    }));

    const { AnalyticsService } = await import('../AnalyticsService');
    const { analyticsRepository } = await import('../../repositories/AnalyticsRepository');
    const svc = new AnalyticsService();

    // A non-reach job (e.g. followers) → reach* omitted.
    await svc.recordMetrics({ workspaceId: 'ws', platform: 'instagram', accountId: 'acc', followers: 2 });

    const written = (analyticsRepository.updateMetrics as any).mock.calls[0][1];
    expect(written.reachDays28).toBe(413); // preserved from the inherited record
  });

  it('overwrites reach with a fresh value from the account-insights job', async () => {
    vi.doMock('../../repositories/AnalyticsRepository', () => ({
      analyticsRepository: {
        getOrCreateForDate: vi.fn().mockResolvedValue({
          _id: 'today', date: new Date('2026-06-23T00:00:00Z'),
          posts: 26, reach: 510, reachDays28: 413,
        }),
        findOneBeforeDate: vi.fn().mockResolvedValue({ date: new Date('2026-06-22'), posts: 26 }),
        updateMetrics: vi.fn().mockImplementation(async (_id: string, data: any) => ({ _id, ...data })),
      },
    }));
    vi.doMock('../../repositories/SocialAccountRepository', () => ({ socialAccountRepository: {} }));
    vi.doMock('../../config/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), db: { query: vi.fn(), error: vi.fn() } },
    }));

    const { AnalyticsService } = await import('../AnalyticsService');
    const { analyticsRepository } = await import('../../repositories/AnalyticsRepository');
    const svc = new AnalyticsService();

    await svc.recordMetrics({ workspaceId: 'ws', platform: 'instagram', accountId: 'acc', reachDays28: 520 });

    const written = (analyticsRepository.updateMetrics as any).mock.calls[0][1];
    expect(written.reachDays28).toBe(520);
  });
});

describe('AnalyticsService.recordMetrics — reach carry-forward (write-path guard)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const setupMocks = (currentRecord: any, prior: any) => {
    vi.doMock('../../repositories/AnalyticsRepository', () => ({
      analyticsRepository: {
        getOrCreateForDate: vi.fn().mockResolvedValue(currentRecord),
        findOneBeforeDate: vi.fn().mockResolvedValue(prior),
        updateMetrics: vi.fn().mockImplementation(async (_id: string, data: any) => ({ _id, ...data })),
      },
    }));
    vi.doMock('../../repositories/SocialAccountRepository', () => ({ socialAccountRepository: {} }));
    vi.doMock('../../config/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), db: { query: vi.fn(), error: vi.fn() } },
    }));
  };

  it('carries forward prior reach when current record is 0 and input omits reach (transient-failure guard)', async () => {
    // Simulates a record that somehow has 0 (e.g. legacy/un-inherited) + a job
    // that omitted reach. Carry-forward must restore the prior good value.
    setupMocks(
      { _id: 'today', date: new Date('2026-06-23T00:00:00Z'), posts: 26, reach: 0, reachDay: 0, reachWeek: 0, reachDays28: 0 },
      { date: new Date('2026-06-22'), posts: 26, reach: 510, reachDays28: 413 }
    );
    const { AnalyticsService } = await import('../AnalyticsService');
    const { analyticsRepository } = await import('../../repositories/AnalyticsRepository');
    const svc = new AnalyticsService();

    await svc.recordMetrics({ workspaceId: 'ws', platform: 'instagram', accountId: 'acc', followers: 2 });

    const written = (analyticsRepository.updateMetrics as any).mock.calls[0][1];
    expect(written.reachDays28).toBe(413);
  });

  it('writes a genuine Meta 0 when reach is explicitly provided as 0', async () => {
    setupMocks(
      { _id: 'today', date: new Date('2026-06-23T00:00:00Z'), posts: 26, reachDays28: 413 },
      { date: new Date('2026-06-22'), posts: 26, reachDays28: 413 }
    );
    const { AnalyticsService } = await import('../AnalyticsService');
    const { analyticsRepository } = await import('../../repositories/AnalyticsRepository');
    const svc = new AnalyticsService();

    await svc.recordMetrics({ workspaceId: 'ws', platform: 'instagram', accountId: 'acc', reachDays28: 0 });

    const written = (analyticsRepository.updateMetrics as any).mock.calls[0][1];
    expect(written.reachDays28).toBe(0);
  });

  it('keeps an already-set value on the current record instead of reverting to prior', async () => {
    setupMocks(
      { _id: 'today', date: new Date('2026-06-23T00:00:00Z'), posts: 26, reachDays28: 450 },
      { date: new Date('2026-06-22'), posts: 26, reachDays28: 413 }
    );
    const { AnalyticsService } = await import('../AnalyticsService');
    const { analyticsRepository } = await import('../../repositories/AnalyticsRepository');
    const svc = new AnalyticsService();

    await svc.recordMetrics({ workspaceId: 'ws', platform: 'instagram', accountId: 'acc', followers: 2 });

    const written = (analyticsRepository.updateMetrics as any).mock.calls[0][1];
    expect(written.reachDays28).toBe(450);
  });
});
