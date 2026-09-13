/**
 * VeeGPT usage panel (spec §44).
 *
 * Shows the user their AI usage in plain language:
 *   Monthly VeeGPT · 5-hour capacity · Premium AI · Deep Research · Autopilot
 *
 * Two rules from the spec shape this:
 *   1. "Do not expose unnecessarily technical provider pricing." No dollars, no
 *      token counts, no per-model tables — just used/total in VGU and a bar.
 *   2. §42 language over numbers where a warning applies: the server's notice is
 *      shown verbatim rather than re-derived here.
 *
 * All data comes from GET /api/chat/limits, the same read-only snapshot the chat
 * composer polls, so this panel can never disagree with what the user is actually
 * allowed to do.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Window {
  used: number;
  limit: number | null;
  remaining: number | null;
  resetAt: number;
}

interface FeatureLine {
  feature: string;
  label: string;
  usedVGU: number;
  maxVGU: number | null;
  remainingVGU: number | null;
}

interface LimitsResponse {
  plan: string | null;
  session: Window | null;
  monthly: Window | null;
  features?: FeatureLine[];
  notice?: {
    band: 'none' | 'heavy' | 'approaching' | 'almost' | 'reached';
    message: string | null;
  } | null;
  upgrade?: { available: boolean; recommendedPlan: string | null } | null;
}

/** A relative reset phrase, e.g. "in 3 days", "in 4h". */
function resetPhrase(resetAt?: number): string {
  if (!resetAt) return '';
  const secs = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
  if (secs >= 36 * 3600) return `in ${Math.round(secs / 86400)} days`;
  if (secs >= 3600) return `in ${Math.round(secs / 3600)}h`;
  return `in ${Math.max(1, Math.round(secs / 60))} min`;
}

/** One used/total row with a bar. `limit === null` renders as "Unlimited". */
function UsageRow({
  label,
  used,
  limit,
  resetAt,
}: {
  label: string;
  used: number;
  limit: number | null;
  resetAt?: number;
}): JSX.Element {
  const unlimited = limit == null;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  // Bar colour tracks the §42 bands so the panel reads the same as the warnings.
  const barColor =
    pct >= 95
      ? 'bg-red-500'
      : pct >= 85
        ? 'bg-amber-500'
        : pct >= 70
          ? 'bg-yellow-400'
          : 'bg-blue-500';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-medium text-slate-200">{label}</p>
        <p className="text-[12px] tabular-nums text-slate-400">
          {unlimited ? (
            'Unlimited'
          ) : (
            <>
              {Math.round(used)} / {Math.round(limit)}
              <span className="ml-1 text-slate-500">VGU</span>
            </>
          )}
        </p>
      </div>
      {!unlimited && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {resetAt && (
        <p className="mt-1 text-[11px] text-slate-500">Resets {resetPhrase(resetAt)}</p>
      )}
    </div>
  );
}

export function VeeGPTUsagePanel(): JSX.Element | null {
  const { data } = useQuery<LimitsResponse>({
    queryKey: ['/api/chat/limits'],
    queryFn: () => apiRequest('/api/chat/limits'),
    staleTime: 30_000,
  });

  // No plan resolved (signed out / still loading) → render nothing rather than an
  // empty shell.
  if (!data || !data.plan || (!data.monthly && !data.session)) return null;

  const featureLine = (f: string) => data.features?.find(x => x.feature === f);
  const research = featureLine('veegpt.deep_research');
  const autopilot = featureLine('veegpt.autopilot');

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">VeeGPT usage</h3>
        {data.upgrade?.available && data.upgrade.recommendedPlan && (
          <a
            href="/settings/billing"
            className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Upgrade to {data.upgrade.recommendedPlan}
          </a>
        )}
      </div>

      {/* §42 plain-language notice, when the server sent one. */}
      {data.notice?.message && data.notice.band !== 'none' && (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-[13px] font-medium leading-snug text-amber-200">
          {data.notice.message}
        </p>
      )}

      <div className="space-y-4">
        {data.monthly && (
          <UsageRow
            label="Monthly VeeGPT"
            used={data.monthly.used}
            limit={data.monthly.limit}
            resetAt={data.monthly.resetAt}
          />
        )}
        {data.session && (
          <UsageRow
            label="5-hour capacity"
            used={data.session.used}
            limit={data.session.limit}
            resetAt={data.session.resetAt}
          />
        )}
        {research && (
          <UsageRow label="Deep Research" used={research.usedVGU} limit={research.maxVGU} />
        )}
        {autopilot && (
          <UsageRow label="Autopilot" used={autopilot.usedVGU} limit={autopilot.maxVGU} />
        )}
      </div>

      <p className="mt-4 text-[11px] leading-4 text-slate-500">
        VGU (VeeGPT Usage Units) measure AI usage across every model and feature.
        Heavier models and research use more per request.
      </p>
    </div>
  );
}

export default VeeGPTUsagePanel;
