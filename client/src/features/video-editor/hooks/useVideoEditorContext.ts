/**
 * useVideoEditorContext — loads the active workspace context and resolves the
 * editor's gate (Requirements 1.4–1.7).
 *
 * Reuses the existing client services rather than adding parallel data sources:
 *   - {@link useCurrentWorkspace} (`@/components/WorkspaceSwitcher`) for the
 *     active workspace + brand profile.
 *   - {@link useSubscription} (`@/hooks/useSubscription`) for the subscription
 *     tier and current credit balance.
 *
 * All access-control decisions remain server-authoritative; this hook only
 * surfaces enough context to render state and to gate credit-consuming actions
 * client-side (Req 1.5). The credit-estimate confirmation UI (task 23.5) reads
 * `gate.canConsumeCredits` before executing a generative operation.
 */

import { useMemo } from 'react';
import { useSearch } from 'wouter';

import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher';
import useSubscription from '@/hooks/useSubscription';

import type {
  VideoEditorBrandProfile,
  VideoEditorContextValue,
  VideoEditorWorkspaceContext,
} from '../types';
import { resolveVideoEditorGate } from '../utils/gating';
import { parseAttachedSource } from '../utils/attachedSource';

export function useVideoEditorContext(): VideoEditorContextValue {
  const { currentWorkspace, isLoading: workspaceLoading } = useCurrentWorkspace();
  const {
    plan: subscriptionTier,
    aiCredits,
    isLoading: subscriptionLoading,
    error: subscriptionError,
  } = useSubscription();

  const search = useSearch();

  // Brand profile is derived from the active workspace record (Req 1.4). It is
  // only available once a workspace is present.
  const brandProfile: VideoEditorBrandProfile | null = useMemo(() => {
    if (!currentWorkspace?.id) return null;
    return {
      workspaceId: currentWorkspace.id,
      name: currentWorkspace.name,
      theme: currentWorkspace.theme,
      aiPersonality: currentWorkspace.aiPersonality,
    };
  }, [currentWorkspace]);

  const creditBalance = aiCredits?.remaining ?? null;

  const gate = useMemo(
    () =>
      resolveVideoEditorGate({
        workspaceLoading,
        hasActiveWorkspace: !!currentWorkspace?.id,
        subscriptionLoading,
        subscriptionError: !!subscriptionError,
        subscriptionTier: subscriptionTier ?? null,
        creditBalance,
        brandProfile,
      }),
    [
      workspaceLoading,
      currentWorkspace?.id,
      subscriptionLoading,
      subscriptionError,
      subscriptionTier,
      creditBalance,
      brandProfile,
    ],
  );

  const context: VideoEditorWorkspaceContext = useMemo(
    () => ({
      workspaceId: currentWorkspace?.id ?? null,
      workspaceName: currentWorkspace?.name ?? null,
      subscriptionTier: subscriptionTier ?? null,
      creditBalance,
      brandProfile,
    }),
    [currentWorkspace?.id, currentWorkspace?.name, subscriptionTier, creditBalance, brandProfile],
  );

  const attachedSource = useMemo(() => parseAttachedSource(search), [search]);

  return { gate, context, attachedSource };
}
