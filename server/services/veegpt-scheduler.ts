/**
 * VGU maintenance scheduler (spec §10 sweeper, §34 outbox drain, §55 repair, §57 alerts).
 *
 * Runs three jobs on a timer so the invariants the rest of the system relies on
 * are actively maintained rather than only checked in probes:
 *
 *   sweep   reclaim reservations whose owner died before reconciling, so a crash
 *           cannot leak a concurrency slot forever (the slot's own TTL is the
 *           backstop; this returns it sooner).
 *   repair  drain the ledger outbox and fix any Redis/ledger divergence, so a
 *           counter and its durable record cannot drift apart unnoticed.
 *   alerts  turn the operational signals (unmetered calls, leaks, divergence,
 *           fallback pricing) into §57 alerts.
 *
 * DESIGN
 *  - Single-flight per job: a run never overlaps its previous run.
 *  - Timers are unref'd, so they never keep the process alive on shutdown.
 *  - Every interval is env-tunable, and the whole scheduler can be disabled with
 *    VGU_SCHEDULER=off (e.g. in tests or a worker-less deployment).
 *  - Repair runs in APPLY mode by default in production — the point is to fix
 *    drift, not just observe it — but that is env-gated so a cautious rollout can
 *    start in observe-only mode.
 */

import { getReservationEngine } from './veegpt-reservation.engine';
import { runRepair, type RepairReport } from './veegpt-repair.service';
import { scanForAlerts } from './veegpt-alerts';
import { VeegptUsageEvent } from './veegpt-ledger';
import logger from '../config/logger';

function envMs(name: string, fallbackMs: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallbackMs;
}

function enabled(): boolean {
  return (process.env.VGU_SCHEDULER || 'on').toLowerCase() !== 'off';
}

/** Reduce a repair report to the counts the alert scan judges. */
function repairSignals(report: RepairReport): {
  reservationLeaks: number;
  reconciliationDivergences: number;
} {
  let reservationLeaks = 0;
  let reconciliationDivergences = 0;
  for (const f of report.findings) {
    if (f.kind === 'stale_reservation' || f.kind === 'orphaned_reservation') {
      reservationLeaks++;
    } else if (
      f.kind === 'drift' ||
      f.kind === 'negative_counter' ||
      f.kind === 'missing_event'
    ) {
      reconciliationDivergences++;
    }
  }
  return { reservationLeaks, reconciliationDivergences };
}

/** Count events priced with the conservative fallback in the last hour. */
async function recentFallbackPriced(): Promise<number> {
  try {
    return await VeegptUsageEvent.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 3600_000) },
      fallbackPricing: true,
    });
  } catch {
    return 0;
  }
}

const timers: NodeJS.Timeout[] = [];
const running = { sweep: false, repairAlerts: false };

/** A single-flight wrapper: skips a tick if the previous one is still running. */
function singleFlight(
  key: keyof typeof running,
  fn: () => Promise<void>
): () => void {
  return () => {
    if (running[key]) return;
    running[key] = true;
    void fn()
      .catch(err =>
        logger.warn(`vgu-scheduler: ${key} tick failed`, {
          err: err instanceof Error ? err.message : String(err),
          module: 'veegpt-scheduler',
        })
      )
      .finally(() => {
        running[key] = false;
      });
  };
}

let started = false;

/**
 * Start the scheduler. Idempotent — a second call is a no-op — so it is safe to
 * call from server startup regardless of how many times initialisation runs.
 */
export function startVGUScheduler(): void {
  if (started || !enabled()) return;
  started = true;

  const sweepInterval = envMs('VGU_SWEEP_INTERVAL_MS', 60_000);
  const repairInterval = envMs('VGU_REPAIR_INTERVAL_MS', 5 * 60_000);
  const applyRepairs = (process.env.VGU_REPAIR_APPLY || 'on').toLowerCase() !== 'off';

  const sweepTick = singleFlight('sweep', async () => {
    const { swept } = await getReservationEngine().sweepExpired();
    if (swept > 0) {
      logger.info('vgu-scheduler: swept expired reservations', {
        swept,
        module: 'veegpt-scheduler',
      });
    }
  });

  const repairAndAlertTick = singleFlight('repairAlerts', async () => {
    // Repair scans stale reservations, duplicate/missing events and drains the
    // outbox on its own; per-user counter checks are targeted and run elsewhere.
    const report = await runRepair({ apply: applyRepairs });
    const signals = repairSignals(report);
    const fallbackPriced = await recentFallbackPriced();
    await scanForAlerts({ repair: { ...signals, fallbackPriced } });
  });

  const sweep = setInterval(sweepTick, sweepInterval);
  const repair = setInterval(repairAndAlertTick, repairInterval);
  sweep.unref?.();
  repair.unref?.();
  timers.push(sweep, repair);

  logger.info('vgu-scheduler: started', {
    sweepIntervalMs: sweepInterval,
    repairIntervalMs: repairInterval,
    applyRepairs,
    module: 'veegpt-scheduler',
  });

  // Run one repair+alert pass shortly after boot so a divergence from a crash the
  // previous run left behind is caught promptly, not only at the first interval.
  const kickoff = setTimeout(repairAndAlertTick, 30_000);
  kickoff.unref?.();
  timers.push(kickoff);
}

/** Stop the scheduler (tests / graceful shutdown). */
export function stopVGUScheduler(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  started = false;
}
