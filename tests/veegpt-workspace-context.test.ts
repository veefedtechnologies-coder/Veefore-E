import { describe, it, expect } from 'vitest';
import {
  renderWorkspaceContext,
  type WorkspaceContextSnapshot,
} from '../server/services/WorkspaceContextService';

function snap(overrides: Partial<WorkspaceContextSnapshot> = {}): WorkspaceContextSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    signature: 'sig',
    user: {},
    workspace: {},
    socialAccounts: [],
    recentContent: [],
    recommendations: [],
    performanceInsight: null,
    ...overrides,
  };
}

describe('renderWorkspaceContext', () => {
  it('returns empty string for null', () => {
    expect(renderWorkspaceContext(null)).toBe('');
  });

  it('renders user identity and profile', () => {
    const out = renderWorkspaceContext(
      snap({
        user: {
          name: 'Alice',
          username: 'alice',
          plan: 'pro',
          niche: 'fitness',
          targetAudience: 'gym-goers',
          primaryObjective: 'growth',
        },
      }),
    );
    expect(out).toContain('Alice');
    expect(out).toContain('alice');
    expect(out).toContain('pro');
    expect(out).toContain('niche: fitness');
    expect(out).toContain('goal: growth');
    // Name question is answerable.
    expect(out.toLowerCase()).toContain('what is my name');
  });

  it('separates the Veefore username from the social account handle', () => {
    const out = renderWorkspaceContext(
      snap({
        user: { name: 'Alice', username: 'alice_vee' },
        socialAccounts: [{ platform: 'instagram', username: 'alice.official', followersCount: 1000 }],
      }),
    );
    // Veefore username is flagged as NOT the social handle.
    expect(out).toContain('alice_vee');
    expect(out).toContain('NOT their social media handle');
    // Instagram handle is clearly labelled.
    expect(out).toContain('instagram account handle: @alice.official');
  });

  it('renders social accounts with stats and top countries', () => {
    const out = renderWorkspaceContext(
      snap({
        socialAccounts: [
          {
            platform: 'instagram',
            username: 'alice',
            isVerified: true,
            followersCount: 12000,
            mediaCount: 240,
            engagementRate: 4.2,
            avgLikes: 500,
            avgReach: 8000,
            audienceCountry: { India: 60, US: 30, UK: 10 },
          },
        ],
      }),
    );
    expect(out).toContain('instagram account handle: @alice');
    expect(out).toContain('12000 followers');
    expect(out).toContain('4.2% engagement');
    expect(out).toContain('Top audience countries');
    expect(out).toContain('India 60');
  });

  it('renders recent content, recommendations and performance insight', () => {
    const out = renderWorkspaceContext(
      snap({
        recentContent: [
          { title: 'Reel A', likes: 100 },
          { title: 'Reel B', likes: 50 },
        ],
        recommendations: [{ title: 'Post more reels' }, { title: 'Use trending audio' }],
        performanceInsight: { headline: 'Reach up 20% this week' },
      }),
    );
    expect(out).toContain('Recent content:');
    expect(out).toContain('Reel A (100 likes)');
    expect(out).toContain('Active growth recommendations:');
    expect(out).toContain('Post more reels');
    expect(out).toContain('Latest performance insight: Reach up 20% this week');
  });

  it('omits sections that have no data', () => {
    const out = renderWorkspaceContext(snap({ user: { name: 'Bob' } }));
    expect(out).toContain('Bob');
    expect(out).not.toContain('Top audience');
    expect(out).not.toContain('Recent content');
    expect(out).not.toContain('Active growth recommendations');
  });
});
