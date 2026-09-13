import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { resolveVideoEditorGate, type ResolveVideoEditorGateInput } from '../gating';
import type { VideoEditorBrandProfile } from '../../types';

const brand: VideoEditorBrandProfile = {
  workspaceId: 'ws_1',
  name: 'Acme',
  theme: 'space',
  aiPersonality: 'creative',
};

/** A fully-available context (workspace present, subscription resolved). */
function availableInput(overrides: Partial<ResolveVideoEditorGateInput> = {}): ResolveVideoEditorGateInput {
  return {
    workspaceLoading: false,
    hasActiveWorkspace: true,
    subscriptionLoading: false,
    subscriptionError: false,
    subscriptionTier: 'creator',
    creditBalance: 120,
    brandProfile: brand,
    ...overrides,
  };
}

describe('resolveVideoEditorGate', () => {
  it('reports loading while the workspace is still loading', () => {
    const gate = resolveVideoEditorGate(availableInput({ workspaceLoading: true }));
    expect(gate.status).toBe('loading');
    expect(gate.canConsumeCredits).toBe(false);
  });

  it('does not open the editor when there is no active workspace (Req 1.6)', () => {
    const gate = resolveVideoEditorGate(
      availableInput({ hasActiveWorkspace: false, brandProfile: null }),
    );
    expect(gate.status).toBe('no-workspace');
    expect(gate.canConsumeCredits).toBe(false);
    expect(gate.contextAvailable).toBe(false);
  });

  it('opens the editor and applies context when tier, credits, and brand are present (Req 1.4)', () => {
    const gate = resolveVideoEditorGate(availableInput());
    expect(gate.status).toBe('ready');
    expect(gate.contextAvailable).toBe(true);
    expect(gate.canConsumeCredits).toBe(true);
    expect(gate.contextResolving).toBe(false);
  });

  it('blocks credit-consuming actions when the subscription context errors (Req 1.5)', () => {
    const gate = resolveVideoEditorGate(
      availableInput({ subscriptionError: true, subscriptionTier: null, creditBalance: null }),
    );
    expect(gate.status).toBe('ready'); // editor still opens; session not terminated
    expect(gate.contextAvailable).toBe(false);
    expect(gate.canConsumeCredits).toBe(false);
  });

  it('blocks credit-consuming actions when the credit balance is missing (Req 1.5)', () => {
    const gate = resolveVideoEditorGate(availableInput({ creditBalance: null }));
    expect(gate.status).toBe('ready');
    expect(gate.canConsumeCredits).toBe(false);
  });

  it('blocks credit-consuming actions when the brand profile is missing (Req 1.5)', () => {
    const gate = resolveVideoEditorGate(availableInput({ brandProfile: null }));
    expect(gate.status).toBe('ready');
    expect(gate.canConsumeCredits).toBe(false);
  });

  it('marks context as resolving (not an error) while the subscription still loads', () => {
    const gate = resolveVideoEditorGate(
      availableInput({ subscriptionLoading: true, subscriptionTier: null, creditBalance: null }),
    );
    expect(gate.status).toBe('ready');
    expect(gate.contextResolving).toBe(true);
    expect(gate.contextAvailable).toBe(false);
    expect(gate.canConsumeCredits).toBe(false);
  });

  it('never allows credits without an active workspace, regardless of subscription (Req 1.5, 1.6)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.option(fc.string(), { nil: null }),
        fc.option(fc.integer(), { nil: null }),
        (subscriptionLoading, subscriptionError, tier, credits) => {
          const gate = resolveVideoEditorGate({
            workspaceLoading: false,
            hasActiveWorkspace: false,
            subscriptionLoading,
            subscriptionError,
            subscriptionTier: tier,
            creditBalance: credits,
            brandProfile: null,
          });
          return gate.status === 'no-workspace' && gate.canConsumeCredits === false;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('only permits credits when the full context is available (canConsumeCredits ⟹ contextAvailable)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.option(fc.string(), { nil: null }),
        fc.option(fc.integer(), { nil: null }),
        fc.boolean(),
        (
          workspaceLoading,
          hasActiveWorkspace,
          subscriptionLoading,
          subscriptionError,
          tier,
          credits,
          hasBrand,
        ) => {
          const gate = resolveVideoEditorGate({
            workspaceLoading,
            hasActiveWorkspace,
            subscriptionLoading,
            subscriptionError,
            subscriptionTier: tier,
            creditBalance: credits,
            brandProfile: hasBrand ? brand : null,
          });
          // canConsumeCredits implies contextAvailable is true.
          return !gate.canConsumeCredits || gate.contextAvailable;
        },
      ),
      { numRuns: 200 },
    );
  });
});
