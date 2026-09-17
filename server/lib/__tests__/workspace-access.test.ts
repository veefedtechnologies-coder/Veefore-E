import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';

/**
 * Requirement 15.5 — a user must not be able to access a workspace they are not a
 * member of. This covers the shared authorization decision used by the routes
 * where a fixed-source middleware guard cannot be applied (workspace discovered
 * after a DB lookup, or arriving in one of several mutually exclusive fields).
 */

function reqWithUser(userId?: string): Request {
  return { user: userId ? { id: userId } : undefined } as unknown as Request;
}

/** Mock the legacy storage layer's workspace listing. */
function mockWorkspaces(impl: (userId: string) => Promise<any> | any) {
  vi.doMock('../../mongodb-storage', () => ({
    storage: {
      getWorkspacesByUserId: (uid: string) => Promise.resolve(impl(uid)),
    },
  }));
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('userCanAccessWorkspace', () => {
  it('grants access to a workspace the user belongs to', async () => {
    mockWorkspaces(() => [{ id: 'ws-1' }, { id: 'ws-2' }]);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), 'ws-2')).resolves.toBe(true);
  });

  it('DENIES access to another tenant workspace', async () => {
    mockWorkspaces(() => [{ id: 'ws-1' }]);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), 'ws-999')).resolves.toBe(false);
  });

  it('matches on _id as well as id', async () => {
    // Mongo documents surface `_id`; the legacy layer returns a mix.
    mockWorkspaces(() => [{ _id: 'ws-7' }]);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), 'ws-7')).resolves.toBe(true);
  });

  it('compares ids as strings so an ObjectId does not slip through', async () => {
    mockWorkspaces(() => [{ id: { toString: () => 'ws-3' } }]);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), 'ws-3')).resolves.toBe(true);
  });

  it('denies an unauthenticated request', async () => {
    mockWorkspaces(() => [{ id: 'ws-1' }]);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser(undefined), 'ws-1')).resolves.toBe(false);
  });

  it.each([undefined, null, '', '   '])('denies a blank workspace id (%s)', async (value) => {
    mockWorkspaces(() => [{ id: 'ws-1' }]);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), value as any)).resolves.toBe(false);
  });

  it('FAILS CLOSED when the storage lookup throws', async () => {
    // An availability problem must never widen access.
    mockWorkspaces(() => {
      throw new Error('db down');
    });
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), 'ws-1')).resolves.toBe(false);
  });

  it('fails closed when the lookup returns a non-array', async () => {
    mockWorkspaces(() => null);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), 'ws-1')).resolves.toBe(false);
  });

  it('denies when the user has no workspaces at all', async () => {
    mockWorkspaces(() => []);
    const { userCanAccessWorkspace } = await import('../workspace-access');
    await expect(userCanAccessWorkspace(reqWithUser('u1'), 'ws-1')).resolves.toBe(false);
  });
});

describe('listAccessibleWorkspaceIds', () => {
  it('returns the caller\u2019s own workspace ids', async () => {
    mockWorkspaces(() => [{ id: 'ws-1' }, { _id: 'ws-2' }]);
    const { listAccessibleWorkspaceIds } = await import('../workspace-access');
    await expect(listAccessibleWorkspaceIds(reqWithUser('u1'))).resolves.toEqual(['ws-1', 'ws-2']);
  });

  it('returns an empty list for an unauthenticated request', async () => {
    mockWorkspaces(() => [{ id: 'ws-1' }]);
    const { listAccessibleWorkspaceIds } = await import('../workspace-access');
    await expect(listAccessibleWorkspaceIds(reqWithUser(undefined))).resolves.toEqual([]);
  });

  it('fails closed to an empty list on error', async () => {
    mockWorkspaces(() => {
      throw new Error('db down');
    });
    const { listAccessibleWorkspaceIds } = await import('../workspace-access');
    await expect(listAccessibleWorkspaceIds(reqWithUser('u1'))).resolves.toEqual([]);
  });

  it('drops entries with no usable id', async () => {
    mockWorkspaces(() => [{ id: 'ws-1' }, {}, { id: '' }]);
    const { listAccessibleWorkspaceIds } = await import('../workspace-access');
    await expect(listAccessibleWorkspaceIds(reqWithUser('u1'))).resolves.toEqual(['ws-1']);
  });
});
