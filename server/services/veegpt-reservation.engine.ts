/**
 * VGU reservation engine — the ONE authoritative quota gate.
 *
 * WHY LUA
 * -------
 * The previous implementation did `GET counter` → compare → `INCRBY`. Between
 * the GET and the INCRBY, other requests read the same value, so N concurrent
 * requests each saw "budget available" and all proceeded. With 100 VGU left,
 * five simultaneous 30-VGU requests all passed and executed 150 VGU of work.
 *
 * Every check and every counter write for a reservation therefore happens inside
 * a SINGLE Lua script. Redis runs it atomically, so exactly the requests that fit
 * succeed and the rest are refused — no interleaving is possible.
 *
 * WHAT IS ENFORCED ATOMICALLY (all in one script)
 *   1. rolling 5-hour window        (true sliding window, not a fixed reset)
 *   2. billing-period total         (the subscription's own period)
 *   3. model tier VGU sub-budget    (premium/ultra cannot eat the whole plan)
 *   4. model tier request allowance (Free's 5 premium previews)
 *   5. per-feature period cap       (deep research, autopilot)
 *   6. workspace pool               (Business shared budget)
 *   7. per-seat share of that pool  (one seat cannot drain the team)
 *   8. concurrency slot             (simultaneous in-flight AI operations)
 *
 * LIFECYCLE
 *   reserve()   → RESERVED   (atomic; returns a reservationId)
 *   commit()    → RECONCILED (adjust to measured actual usage; frees the slot)
 *   release()   → RELEASED   (provider failed with no usage; refunds fully)
 *   sweep()     → EXPIRED    (a crashed worker's reservation is reclaimed)
 *
 * IDEMPOTENCY
 * A `requestId` maps to its reservation, so a retry of the same logical request
 * re-uses the reservation instead of double-charging. commit/release are
 * idempotent at the data layer: calling either twice has the same effect as once.
 */

import { getRedisClient } from '../lib/redis';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { PlanId } from '../config/plan-config';
import {
  AUTOPILOT_FEATURE,
  burstWindowSec,
  DEEP_RESEARCH_FEATURE,
  featureConcurrencyLimit,
  featureMonthlyCap,
  featureMonthlyRequestCap,
  featureSpec,
  policyForPlan,
  type ResolvedPolicy,
  reservationTtlSec,
  roundVGU,
  seatMonthlyCap,
  tierAllocation,
  tierFiveHourCap,
  UNLIMITED,
  VGU_ERROR,
  type ModelTier,
  type VGUErrorCode,
} from '../config/veegpt-vgu.config';
import {
  resolveBillingPeriod,
  type BillingPeriod,
} from './veegpt-billing-period';
import {
  adminConcurrencyFactor,
  adminGate,
} from './veegpt-admin-controls';
import { priceFor } from '../config/veegpt-pricing.registry';
import logger from '../config/logger';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const K = {
  /** ZSET score=ms, member=reservationId — entries inside the rolling window. */
  window: (u: string) => `vgu:win:${u}`,
  /** HASH reservationId → vgu, the amount for each windowed entry. */
  amounts: (u: string) => `vgu:amt:${u}`,
  /** HASH of period counters: total, tv:<tier>, tr:<tier>, ft:<feature>. */
  period: (u: string, p: string) => `vgu:per:${u}:${p}`,
  /** HASH of the shared workspace pool for pooled plans. */
  pool: (w: string, p: string) => `vgu:pool:${w}:${p}`,
  /** ZSET score=expiryMs, member=reservationId — in-flight concurrency slots. */
  concurrency: (u: string) => `vgu:conc:${u}`,
  /**
   * ZSET score=expiryMs, member=reservationId — in-flight slots for a POOLED
   * WORKSPACE (spec §39). Separate from the per-user set because a per-seat limit
   * does not bound a team: 10 Business seats at 10 concurrent each is 100
   * simultaneous provider calls, not the 10 the spec allows per workspace.
   */
  workspaceConcurrency: (w: string) => `vgu:wconc:${w}`,
  /**
   * ZSET score=expiryMs, member=reservationId — in-flight slots for ONE FEATURE.
   *
   * Separate from the plan-wide slot because the two bound different things: the
   * plan limit says how much a user may run at once in TOTAL, this says how many
   * of one expensive feature. Deep research declares 1 — a user may have a chat
   * turn and a research job open at the same time, but not three research jobs.
   */
  featureConcurrency: (u: string, f: string) => `vgu:fconc:${u}:${f}`,
  /**
   * ZSET score=ms, member=reservationId — rolling-window entries for ONE TIER.
   * HASH reservationId → vgu — the amount for each tier-windowed entry.
   *
   * Used only for tiers that carry a per-tier 5-hour sub-cap (ultra). It mirrors
   * the plan-wide window (window/amounts) but scoped to the tier, so ultra can be
   * limited to a fraction of the burst without touching the overall window.
   */
  windowTier: (u: string, t: string) => `vgu:winT:${u}:${t}`,
  amountsTier: (u: string, t: string) => `vgu:amtT:${u}:${t}`,
  /** HASH — the reservation record itself. */
  reservation: (r: string) => `vgu:res:${r}`,
  /**
   * STRING requestId → reservationId, for idempotency. Namespaced PER USER.
   *
   * A global namespace was a bypass: `requestId` comes from a client-supplied
   * `x-request-id` header, so one user could present another user's id (or two
   * clients could collide) and reuse a reservation they never paid for.
   */
  idem: (userId: string, rq: string) => `vgu:idem:${userId}:${rq}`,
  /** ZSET score=expiryMs, member=reservationId — all open reservations. */
  open: 'vgu:open',
};

export const RESERVATION_KEYS = K;

// ---------------------------------------------------------------------------
// Lua: reserve
// ---------------------------------------------------------------------------

/**
 * KEYS 1 window, 2 amounts, 3 period, 4 pool, 5 concurrency, 6 reservation,
 *      7 idem, 8 open, 9 workspaceConcurrency
 * ARGV 1 nowMs, 2 windowStartMs, 3 reservationId, 4 requestId, 5 vgu,
 *      6 tier, 7 feature, 8 cap5h, 9 capPeriod, 10 capSeat, 11 capPool,
 *      12 capTierVGU, 13 capTierReq, 14 capFeature, 15 concLimit,
 *      16 concTtlMs, 17 resTtlSec, 18 periodTtlSec, 19 pooled(0|1),
 *      20 meta JSON, 21 wsConcLimit, 22 idemTrusted(0|1)
 *
 * Returns { okFlag, code, reservationId, used5h, usedPeriod, usedTier,
 *           usedTierReq, usedFeature, usedPool, inflight, wsInflight }
 * `-1` for any cap means unlimited.
 */
const RESERVE_LUA = `
local winZ, amtH, perH, poolH, concZ, resH, idemK, openZ, wconcZ, fconcZ, winTZ, amtTH =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10], KEYS[11], KEYS[12]

local now        = tonumber(ARGV[1])
local winStart   = tonumber(ARGV[2])
local resId      = ARGV[3]
local requestId  = ARGV[4]
local vgu        = tonumber(ARGV[5])
local tier       = ARGV[6]
local feature    = ARGV[7]
local cap5h      = tonumber(ARGV[8])
local capPeriod  = tonumber(ARGV[9])
local capSeat    = tonumber(ARGV[10])
local capPool    = tonumber(ARGV[11])
local capTierV   = tonumber(ARGV[12])
local capTierR   = tonumber(ARGV[13])
local capFeat    = tonumber(ARGV[14])
local concLimit  = tonumber(ARGV[15])
local concTtlMs  = tonumber(ARGV[16])
local resTtlSec  = tonumber(ARGV[17])
local perTtlSec  = tonumber(ARGV[18])
local pooled     = tonumber(ARGV[19])
local meta       = ARGV[20]
local wsConcLimit= tonumber(ARGV[21])
local idemTrusted= tonumber(ARGV[22])
local featConcLim= tonumber(ARGV[23])
local nested     = tonumber(ARGV[24])
local capTier5h  = tonumber(ARGV[25])
-- Per-FEATURE monthly REQUEST-COUNT cap (distinct from the VGU cap). This is what
-- makes "Free = 1 deep research, Creator = 2" hold regardless of how few VGU each
-- job happens to cost: a VGU cap alone would let many cheap jobs through.
local capFeatR   = tonumber(ARGV[26])

-- ── Idempotency: the same logical request must never charge twice ──────────
-- An idempotency hit is only honoured while its reservation RECORD still exists.
-- If the record is gone (evicted, expired early, or deleted by an operator) but
-- the pointer survives, honouring it would return a reservation that commit()
-- cannot find — so the request would run and be charged NOTHING. Falling through
-- to a fresh reservation is the safe reading: at worst the same logical request is
-- charged once more, never zero.
-- Honoured ONLY while the prior reservation is still IN FLIGHT. That is what a
-- retry actually is: the first attempt never reached a terminal state, so the
-- second must reuse its reservation instead of charging again.
--
-- Once the reservation has reconciled, the same id presented again is a NEW
-- operation: it will run and consume real tokens, so charging nothing for it
-- would be an under-charge. Worse, requestId comes from a CLIENT-SUPPLIED header,
-- so honouring a terminal reservation meant a client could replay one id forever
-- and get unlimited free AI. Both holes close here.
-- (No backticks in this comment: the script lives in a JS template literal.)
if requestId ~= '' then
  local prior = redis.call('GET', idemK)
  if prior then
    local priorStatus = redis.call('HGET', 'vgu:res:' .. prior, 'status')
    -- An in-flight reservation is always reused: that is what a retry IS.
    -- A TERMINAL one is reused only for a server-generated id, where the same id
    -- provably means the same operation. For a client-supplied id it is not
    -- reused, because that was the unlimited-free-AI replay hole.
    -- An orphaned pointer (record gone) is never reused: commit() could not find
    -- it, so the request would run and be charged nothing.
    if priorStatus == 'RESERVED' or (idemTrusted == 1 and priorStatus) then
      return { 1, 'IDEMPOTENT', prior, 0, 0, 0, 0, 0, 0, 0, 0, 0 }
    end
    redis.call('DEL', idemK)
  end
end

-- ── Prune the rolling window (true sliding: old usage simply leaves) ───────
local stale = redis.call('ZRANGEBYSCORE', winZ, '-inf', '(' .. winStart)
if #stale > 0 then
  -- Chunked so a very long tail cannot blow the Lua stack via unpack().
  local i = 1
  while i <= #stale do
    local chunk = {}
    for j = i, math.min(i + 199, #stale) do chunk[#chunk + 1] = stale[j] end
    redis.call('HDEL', amtH, unpack(chunk))
    i = i + 200
  end
  redis.call('ZREMRANGEBYSCORE', winZ, '-inf', '(' .. winStart)
end

-- ── Current usage in the rolling window ───────────────────────────────────
local used5h = 0
local live = redis.call('ZRANGEBYSCORE', winZ, winStart, '+inf')
if #live > 0 then
  local i = 1
  while i <= #live do
    local chunk = {}
    for j = i, math.min(i + 199, #live) do chunk[#chunk + 1] = live[j] end
    local vals = redis.call('HMGET', amtH, unpack(chunk))
    for k = 1, #vals do
      if vals[k] then used5h = used5h + tonumber(vals[k]) end
    end
    i = i + 200
  end
end

-- ── Per-tier rolling 5-hour usage (only when this tier has a 5h sub-cap) ───
-- Mirrors the plan-wide window above, scoped to the tier's own window, so a
-- costly tier (ultra) can be capped at a fraction of the burst. Skipped entirely
-- when capTier5h < 0, so tiers without a sub-cap add zero overhead.
local usedTier5h = 0
if capTier5h >= 0 then
  local staleT = redis.call('ZRANGEBYSCORE', winTZ, '-inf', '(' .. winStart)
  if #staleT > 0 then
    local i = 1
    while i <= #staleT do
      local chunk = {}
      for j = i, math.min(i + 199, #staleT) do chunk[#chunk + 1] = staleT[j] end
      redis.call('HDEL', amtTH, unpack(chunk))
      i = i + 200
    end
    redis.call('ZREMRANGEBYSCORE', winTZ, '-inf', '(' .. winStart)
  end
  local liveT = redis.call('ZRANGEBYSCORE', winTZ, winStart, '+inf')
  if #liveT > 0 then
    local i = 1
    while i <= #liveT do
      local chunk = {}
      for j = i, math.min(i + 199, #liveT) do chunk[#chunk + 1] = liveT[j] end
      local vals = redis.call('HMGET', amtTH, unpack(chunk))
      for k = 1, #vals do
        if vals[k] then usedTier5h = usedTier5h + tonumber(vals[k]) end
      end
      i = i + 200
    end
  end
end

-- ── Period counters ───────────────────────────────────────────────────────
local pv = redis.call('HMGET', perH, 'total', 'tv:' .. tier, 'tr:' .. tier, 'ft:' .. feature, 'fr:' .. feature)
local usedPeriod  = tonumber(pv[1]) or 0
local usedTierV   = tonumber(pv[2]) or 0
local usedTierR   = tonumber(pv[3]) or 0
local usedFeat    = tonumber(pv[4]) or 0
local usedFeatR   = tonumber(pv[5]) or 0

local usedPool = 0
if pooled == 1 then
  usedPool = tonumber(redis.call('HGET', poolH, 'total')) or 0
end

-- ── Concurrency: expired slots free themselves, no cron required ──────────
redis.call('ZREMRANGEBYSCORE', concZ, '-inf', now)
local inflight = redis.call('ZCARD', concZ)

-- Pooled plans also bound the WHOLE workspace, not just each seat.
local wsInflight = 0
if wsConcLimit >= 0 then
  redis.call('ZREMRANGEBYSCORE', wconcZ, '-inf', now)
  wsInflight = redis.call('ZCARD', wconcZ)
end

-- Per-FEATURE concurrency, independent of the plan-wide slot above.
local featInflight = 0
if featConcLim >= 0 then
  redis.call('ZREMRANGEBYSCORE', fconcZ, '-inf', now)
  featInflight = redis.call('ZCARD', fconcZ)
end

local function deny(code)
  return { 0, code, '', used5h, usedPeriod, usedTierV, usedTierR, usedFeat, usedPool, inflight, wsInflight, featInflight }
end

-- ── Eligibility, most-specific first so the error names the real blocker ──
-- A NESTED operation skips the plan-wide slot: the parent request already holds
-- one, so re-checking it would make a sub-operation deadlock against its own
-- caller (fatally so on Free, whose limit is 1). Its feature slot and every
-- budget still apply.
if featConcLim >= 0 and featInflight >= featConcLim then return deny('FEATURE_CONCURRENCY_LIMIT') end
if nested == 0 and concLimit >= 0 and inflight >= concLimit then return deny('CONCURRENCY_LIMIT') end
if nested == 0 and wsConcLimit >= 0 and wsInflight >= wsConcLimit then return deny('WORKSPACE_CONCURRENCY_LIMIT') end
if capTierR >= 0 and usedTierR + 1 > capTierR then return deny('MODEL_QUOTA_EXHAUSTED') end
if capTierV >= 0 and usedTierV + vgu > capTierV then return deny('MODEL_QUOTA_EXHAUSTED') end
if capFeat  >= 0 and usedFeat  + vgu > capFeat  then return deny('FEATURE_QUOTA_EXHAUSTED') end
if capFeatR >= 0 and usedFeatR + 1   > capFeatR then return deny('FEATURE_QUOTA_EXHAUSTED') end
if pooled == 1 and capPool >= 0 and usedPool + vgu > capPool then return deny('WORKSPACE_POOL_EXHAUSTED') end
if capSeat  >= 0 and usedPeriod + vgu > capSeat then
  if pooled == 1 then return deny('SEAT_SHARE_EXHAUSTED') end
  return deny('MONTHLY_QUOTA_EXHAUSTED')
end
if capPeriod >= 0 and usedPeriod + vgu > capPeriod then return deny('MONTHLY_QUOTA_EXHAUSTED') end
if cap5h    >= 0 and used5h    + vgu > cap5h    then return deny('BURST_QUOTA_EXHAUSTED') end
if capTier5h >= 0 and usedTier5h + vgu > capTier5h then return deny('BURST_QUOTA_EXHAUSTED') end

-- ── Commit the reservation. Past this point nothing can fail ──────────────
redis.call('ZADD', winZ, now, resId)
redis.call('HSET', amtH, resId, vgu)
redis.call('EXPIRE', winZ, resTtlSec + 21600)
redis.call('EXPIRE', amtH, resTtlSec + 21600)

-- Record in the per-tier window too, so the tier's own 5h usage stays accurate.
if capTier5h >= 0 then
  redis.call('ZADD', winTZ, now, resId)
  redis.call('HSET', amtTH, resId, vgu)
  redis.call('EXPIRE', winTZ, resTtlSec + 21600)
  redis.call('EXPIRE', amtTH, resTtlSec + 21600)
end

redis.call('HINCRBYFLOAT', perH, 'total', vgu)
redis.call('HINCRBYFLOAT', perH, 'tv:' .. tier, vgu)
redis.call('HINCRBYFLOAT', perH, 'tr:' .. tier, 1)
redis.call('HINCRBYFLOAT', perH, 'ft:' .. feature, vgu)
redis.call('HINCRBYFLOAT', perH, 'fr:' .. feature, 1)
redis.call('EXPIRE', perH, perTtlSec)

if pooled == 1 then
  redis.call('HINCRBYFLOAT', poolH, 'total', vgu)
  redis.call('EXPIRE', poolH, perTtlSec)
end

if nested == 0 then
  redis.call('ZADD', concZ, now + concTtlMs, resId)
  redis.call('EXPIRE', concZ, math.ceil(concTtlMs / 1000) + 60)

  if wsConcLimit >= 0 then
    redis.call('ZADD', wconcZ, now + concTtlMs, resId)
    redis.call('EXPIRE', wconcZ, math.ceil(concTtlMs / 1000) + 60)
  end
end

if featConcLim >= 0 then
  redis.call('ZADD', fconcZ, now + concTtlMs, resId)
  redis.call('EXPIRE', fconcZ, math.ceil(concTtlMs / 1000) + 60)
end

redis.call('HSET', resH,
  'status', 'RESERVED',
  'reserved', vgu,
  'actual', '',
  'tier', tier,
  'feature', feature,
  'pooled', tostring(pooled),
  'createdAt', tostring(now),
  'meta', meta)
redis.call('EXPIRE', resH, resTtlSec + 86400)

redis.call('ZADD', openZ, now + (resTtlSec * 1000), resId)

if requestId ~= '' then
  redis.call('SET', idemK, resId, 'EX', resTtlSec + 86400)
end

return { 1, 'RESERVED', resId, used5h + vgu, usedPeriod + vgu, usedTierV + vgu,
         usedTierR + 1, usedFeat + vgu, usedPool + vgu, inflight + 1, wsInflight + 1,
         featInflight + 1 }
`;

// ---------------------------------------------------------------------------
// Lua: commit (reconcile to actual)
// ---------------------------------------------------------------------------

/**
 * Adjust a reservation to the measured actual usage and free its concurrency
 * slot. Idempotent: a second call is a no-op.
 *
 * KEYS 1 window, 2 amounts, 3 period, 4 pool, 5 concurrency, 6 reservation,
 *      7 workspaceConcurrency, 8 featureConcurrency
 * ARGV 1 reservationId, 2 actualVGU, 3 tier, 4 feature, 5 pooled
 */
const COMMIT_LUA = `
local winZ, amtH, perH, poolH, concZ, resH, wconcZ, fconcZ, winTZ, amtTH =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10]
local resId  = ARGV[1]
local actual = tonumber(ARGV[2])
local tier   = ARGV[3]
local feature= ARGV[4]
local pooled = tonumber(ARGV[5])

local status = redis.call('HGET', resH, 'status')
if not status then return { 0, 'UNKNOWN_RESERVATION', 0 } end
-- Idempotent reconciliation (spec §52): repeating this must change nothing.
if status ~= 'RESERVED' then return { 1, status, 0 } end

local reserved = tonumber(redis.call('HGET', resH, 'reserved')) or 0
local delta = actual - reserved

if delta ~= 0 then
  redis.call('HINCRBYFLOAT', perH, 'total', delta)
  redis.call('HINCRBYFLOAT', perH, 'tv:' .. tier, delta)
  redis.call('HINCRBYFLOAT', perH, 'ft:' .. feature, delta)
  if pooled == 1 then
    redis.call('HINCRBYFLOAT', poolH, 'total', delta)
  end
  -- The rolling window stores absolute amounts, so overwrite rather than add.
  if redis.call('ZSCORE', winZ, resId) then
    redis.call('HSET', amtH, resId, actual)
  end
  -- Mirror into the per-tier window when this reservation is tracked there.
  if redis.call('ZSCORE', winTZ, resId) then
    redis.call('HSET', amtTH, resId, actual)
  end
end

redis.call('ZREM', concZ, resId)
-- Free the workspace and feature slots too, or a pooled team (or a user's next
-- research job) would be throttled by a ghost until the slot's TTL expired.
redis.call('ZREM', wconcZ, resId)
redis.call('ZREM', fconcZ, resId)
redis.call('HSET', resH, 'status', 'RECONCILED', 'actual', tostring(actual))
return { 1, 'RECONCILED', delta }
`;

// ---------------------------------------------------------------------------
// Lua: release (no usage occurred)
// ---------------------------------------------------------------------------

/**
 * Fully refund a reservation — used when the provider failed before consuming
 * anything. Idempotent.
 *
 * KEYS 1 window, 2 amounts, 3 period, 4 pool, 5 concurrency, 6 reservation,
 *      7 workspaceConcurrency, 8 featureConcurrency
 * ARGV 1 reservationId, 2 tier, 3 feature, 4 pooled, 5 terminalStatus
 */
const RELEASE_LUA = `
local winZ, amtH, perH, poolH, concZ, resH, wconcZ, fconcZ, winTZ, amtTH =
  KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8], KEYS[9], KEYS[10]
local resId   = ARGV[1]
local tier    = ARGV[2]
local feature = ARGV[3]
local pooled  = tonumber(ARGV[4])
local terminal= ARGV[5]

local status = redis.call('HGET', resH, 'status')
if not status then return { 0, 'UNKNOWN_RESERVATION', 0 } end
if status ~= 'RESERVED' then return { 1, status, 0 } end

local reserved = tonumber(redis.call('HGET', resH, 'reserved')) or 0

if reserved > 0 then
  redis.call('HINCRBYFLOAT', perH, 'total', -reserved)
  redis.call('HINCRBYFLOAT', perH, 'tv:' .. tier, -reserved)
  redis.call('HINCRBYFLOAT', perH, 'tr:' .. tier, -1)
  redis.call('HINCRBYFLOAT', perH, 'ft:' .. feature, -reserved)
  -- A fully-released reservation never really happened, so give the feature
  -- request-count back too (mirrors the tier request-count above).
  redis.call('HINCRBYFLOAT', perH, 'fr:' .. feature, -1)
  if pooled == 1 then
    redis.call('HINCRBYFLOAT', poolH, 'total', -reserved)
  end
end

redis.call('ZREM', winZ, resId)
redis.call('HDEL', amtH, resId)
redis.call('ZREM', winTZ, resId)
redis.call('HDEL', amtTH, resId)
redis.call('ZREM', concZ, resId)
redis.call('ZREM', wconcZ, resId)
redis.call('ZREM', fconcZ, resId)
redis.call('HSET', resH, 'status', terminal, 'actual', '0')
return { 1, terminal, reserved }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReservationStatus =
  | 'RESERVED'
  | 'COMPLETED'
  | 'RECONCILED'
  | 'RELEASED'
  | 'EXPIRED'
  | 'FAILED';

export interface ReserveContext {
  userId: string;
  workspaceId?: string;
  plan: PlanId;
  /** AIFeature label. */
  feature: string;
  /** Model tier the request will run on. */
  tier: ModelTier;
  /**
   * Who chose the model.
   *
   *   user     — the user picked it in AI Configuration. The tier allowance and
   *              the plan's tier access matrix apply: this is what stops someone
   *              spending a whole plan on the most expensive model.
   *   platform — the feature hard-codes its model (caption generation always uses
   *              gpt-4o, image generation always uses DALL·E). The user had no
   *              choice, so charging their premium allowance — or refusing with
   *              MODEL_NOT_IN_PLAN — would deny a feature they paid for on the
   *              basis of a decision they never made. Cost is still fully
   *              charged against the burst / period / feature / pool budgets, and
   *              tier usage is still recorded for analytics.
   *
   * Defaults to 'user', the stricter reading.
   */
  modelChosenBy?: 'user' | 'platform';
  /** Pre-flight estimate to reserve. */
  estimatedVGU: number;
  /** Caller-supplied id making the request idempotent across retries. */
  requestId?: string;
  /**
   * Whether `requestId` can be TRUSTED as naming one logical operation.
   *
   *   true  — the id was generated server-side (a BullMQ job id, a scheduled task
   *           key). A re-delivery of that job is the same operation, so it must
   *           reuse the reservation even after the first attempt reached a
   *           terminal state — otherwise a crashed-and-retried job charges twice.
   *   false — the id came from the client (`x-request-id`). It is only honoured
   *           while the first attempt is still IN FLIGHT. Honouring a completed
   *           one let a client replay a single id forever and get unlimited free
   *           AI, and let one user present another user's id.
   *
   * Defaults to false, the untrusted reading.
   */
  requestIdTrusted?: boolean;
  /**
   * True when this reservation runs INSIDE another one (a deep-research job inside
   * a chat turn, a stage inside an autopilot run).
   *
   * A nested reservation skips the PLAN-WIDE concurrency slot, because its parent
   * already holds one and re-checking it would make the sub-operation deadlock
   * against its own caller — fatally so on Free, whose limit is 1. Its FEATURE
   * slot and every budget still apply, which is the whole point: this is how a
   * deep-research job gets its own per-job ceiling, monthly allowance, call limit
   * and timeout instead of inheriting the chat turn's.
   */
  nested?: boolean;
  /**
   * Multiplier applied to the plan's concurrency limit, from abuse scoring
   * (spec §32). 1 = normal. A throttled account gets a smaller share of parallel
   * capacity rather than an outright refusal, which is a proportionate response
   * to a heuristic. Never raises the limit above the plan's.
   */
  concurrencyFactor?: number;
  /**
   * App-level model id, so the emergency admin controls (§48) can refuse a
   * specific disabled model. Optional; when absent only tier/feature/provider
   * disables apply.
   */
  model?: string;
  /**
   * Provider name ("openai"/"gemini"/…), for the provider kill switch. When
   * absent it is inferred from the model's pricing row.
   */
  provider?: string;
  /** Arbitrary audit metadata (model id, conversation id, …). */
  meta?: Record<string, unknown>;
}

export interface ReserveOk {
  ok: true;
  reservationId: string;
  /** True when an existing reservation for this requestId was reused. */
  idempotent: boolean;
  billingPeriodId: string;
  estimatedVGU: number;
  usage: {
    burst: number;
    period: number;
    tierVGU: number;
    tierRequests: number;
    feature: number;
    pool: number;
    inflight: number;
    /** In-flight operations across the whole workspace (pooled plans). */
    workspaceInflight: number;
    /** In-flight operations of THIS feature for this user. */
    featureInflight: number;
  };
}

export interface ReserveDenied {
  ok: false;
  code: VGUErrorCode;
  /** Human-readable, safe to show. */
  message: string;
  /** Seconds until the blocking window frees capacity, when knowable. */
  retryAfterSec?: number;
  billingPeriodId: string;
  estimatedVGU: number;
  usage?: ReserveOk['usage'];
}

export type ReserveResult = ReserveOk | ReserveDenied;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Features reported individually in the usage panel.
 *
 * These are the ones with their own monthly allowance and per-job ceiling, so
 * "you have X left" is a meaningful thing to show before starting one.
 */
const GOVERNED_FEATURES = [
  DEEP_RESEARCH_FEATURE,
  AUTOPILOT_FEATURE,
] as const;

/** -1 encodes "unlimited" for the Lua script. */
function cap(n: number): string {
  return n === UNLIMITED || !Number.isFinite(n) ? '-1' : String(n);
}

/**
 * Apply an abuse-throttle factor to a concurrency limit.
 *
 * Clamped to at most the plan's own limit (a factor can only tighten, never
 * loosen) and to a floor of 1 for any non-zero factor, so a throttled user is
 * slowed down rather than locked out — being locked out is what the `block`
 * action is for, and that decision is made elsewhere with more evidence.
 */
function effectiveConcurrency(limit: number, factor?: number): number {
  if (factor === undefined || factor >= 1) return limit;
  if (limit === UNLIMITED || !Number.isFinite(limit)) return limit;
  if (factor <= 0) return 0;
  return Math.max(1, Math.floor(limit * factor));
}

/**
 * The per-feature concurrency slot for this request, and its limit.
 *
 * Only features that declare `concurrency` are bounded; the rest pass a placeholder
 * key the script never touches, because Lua needs a fixed key arity.
 */
function featureConcurrency(
  userId: string,
  feature: string
): { key: string; limit: number } {
  const limit = featureConcurrencyLimit(feature);
  const enabled = Number.isFinite(limit) && limit > 0;
  return {
    key: K.featureConcurrency(userId, enabled ? feature : '_none'),
    limit: enabled ? limit : -1,
  };
}

/**
 * Whether this request participates in a workspace-wide concurrency limit, and
 * the key that tracks it. A plan with no workspace limit still passes a key
 * (Lua requires a fixed arity) but the script never touches it, because the limit
 * is sent as -1.
 */
function workspaceConcurrency(
  policy: ResolvedPolicy,
  workspaceId?: string
): { key: string; limit: number } {
  const enabled =
    !!workspaceId &&
    policy.maxConcurrentWorkspace !== UNLIMITED &&
    Number.isFinite(policy.maxConcurrentWorkspace) &&
    policy.maxConcurrentWorkspace >= 0;
  return {
    key: K.workspaceConcurrency(enabled ? workspaceId! : '_none'),
    limit: enabled ? policy.maxConcurrentWorkspace : -1,
  };
}

let scriptsRegistered = false;

/** Register the Lua scripts as ioredis commands (EVALSHA-cached by ioredis). */
function ensureScripts(redis: Redis): void {
  if (scriptsRegistered) return;
  const r = redis as unknown as {
    defineCommand: (name: string, opts: { numberOfKeys: number; lua: string }) => void;
    vguReserve?: unknown;
  };
  if (!r.vguReserve) {
    r.defineCommand('vguReserve', { numberOfKeys: 12, lua: RESERVE_LUA });
    r.defineCommand('vguCommit', { numberOfKeys: 10, lua: COMMIT_LUA });
    r.defineCommand('vguRelease', { numberOfKeys: 10, lua: RELEASE_LUA });
  }
  scriptsRegistered = true;
}

/** Concurrency slots are held at most this long before self-expiring. */
function concurrencyTtlMs(feature: string): number {
  const spec = featureSpec(feature);
  // A slot must outlive the request, or a long job would free its own slot and
  // allow unbounded parallelism; +60s of headroom over the feature timeout.
  return (spec.timeoutMs ?? 120_000) + 60_000;
}

const DENY_MESSAGE: Record<string, string> = {
  CONCURRENCY_LIMIT:
    'You have another VeeGPT request still running. Wait for it to finish and try again.',
  WORKSPACE_CONCURRENCY_LIMIT:
    'Your workspace is running the maximum number of AI operations at once. Try again in a moment.',
  FEATURE_CONCURRENCY_LIMIT:
    'Another run of this is already in progress. Wait for it to finish and try again.',
  MODEL_QUOTA_EXHAUSTED: 'Premium AI capacity reached.',
  FEATURE_QUOTA_EXHAUSTED:
    'You have used this feature\u2019s allowance for the current period.',
  WORKSPACE_POOL_EXHAUSTED:
    'Your workspace has used its shared VeeGPT allowance for this period.',
  SEAT_SHARE_EXHAUSTED:
    'You have used your share of the workspace VeeGPT allowance.',
  MONTHLY_QUOTA_EXHAUSTED: 'You have reached your monthly VeeGPT allowance.',
  BURST_QUOTA_EXHAUSTED:
    'You\u2019re sending messages a little too fast for VeeGPT to keep up. It frees up in a moment \u2014 try again shortly.',
  QUOTA_UNVERIFIABLE:
    'VeeGPT is temporarily unable to verify your usage. Please try again shortly.',
};

/**
 * Tiers whose cost makes it unacceptable to run without a verified quota state.
 * Spec §33: on Redis failure these FAIL CLOSED; cheap traffic may proceed.
 */
const FAIL_CLOSED_TIERS: ReadonlySet<ModelTier> = new Set<ModelTier>([
  'premium',
  'ultra',
]);

/**
 * VGU above which a request is never allowed through unverified, regardless of
 * tier — a cheap model running deep research is still expensive.
 */
const FAIL_CLOSED_VGU_THRESHOLD = 10;

export class VGUReservationEngine {
  private redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? (getRedisClient() as Redis);
    ensureScripts(this.redis);
  }

  /**
   * Atomically check every quota and reserve the estimate.
   *
   * On Redis failure the decision is NOT uniformly fail-open: expensive requests
   * are refused with QUOTA_UNVERIFIABLE, because an outage must never become a
   * window of unlimited premium spending. Cheap requests are allowed through so a
   * Redis blip does not take the product down.
   */
  async reserve(ctx: ReserveContext): Promise<ReserveResult> {
    const now = Date.now();
    const period = await resolveBillingPeriod(ctx.userId, new Date(now));
    const policy = policyForPlan(ctx.plan);
    const alloc = tierAllocation(ctx.plan, ctx.tier);
    const spec = featureSpec(ctx.feature);
    const vgu = roundVGU(Math.max(0, ctx.estimatedVGU));
    const reservationId = `r_${randomUUID()}`;

    // Emergency admin controls (spec §48). Checked BEFORE anything reaches Redis:
    // a disabled model / tier / feature / provider is refused outright, without
    // taking a slot or a counter. This is the redeploy-free kill switch. The
    // provider is derived from the model when the caller did not name one.
    const gate = adminGate({
      feature: ctx.feature,
      tier: ctx.tier,
      model: ctx.model,
      provider: ctx.provider ?? (ctx.model ? priceFor(ctx.model).provider : undefined),
    });
    if (gate.blocked) {
      logger.warn('vgu: request refused by an emergency admin control', {
        userId: ctx.userId,
        feature: ctx.feature,
        tier: ctx.tier,
        model: ctx.model,
        by: gate.by,
        module: 'veegpt-reservation',
      });
      return {
        ok: false,
        code: VGU_ERROR.DISABLED_BY_ADMIN,
        message: gate.reason ?? 'This is temporarily unavailable.',
        billingPeriodId: period.id,
        estimatedVGU: vgu,
      };
    }

    // Tier gating exists to govern the model the USER selected. When the feature
    // fixed the model itself, the tier caps are lifted (usage is still recorded).
    const userChoseModel = (ctx.modelChosenBy ?? 'user') === 'user';

    // A tier the plan cannot use at all never reaches Redis.
    if (userChoseModel && alloc.access === 'none') {
      return {
        ok: false,
        code: VGU_ERROR.MODEL_NOT_IN_PLAN,
        message: `${ctx.tier === 'ultra' ? 'Ultra' : 'This'} model is not included in your plan.`,
        billingPeriodId: period.id,
        estimatedVGU: vgu,
      };
    }

    const pooled = policy.pooled && !!ctx.workspaceId;
    const seatCap = policy.pooled ? seatMonthlyCap(policy) : policy.monthlyVGU;
    const wsConc = workspaceConcurrency(policy, ctx.workspaceId);
    const featConc = featureConcurrency(ctx.userId, ctx.feature);
    // The concurrency limit sent to Lua combines the abuse throttle (per user)
    // with the global emergency factor (fleet-wide). Both can only tighten.
    const concurrencyFactor =
      (ctx.concurrencyFactor ?? 1) * adminConcurrencyFactor();
    // Per-tier 5-hour sub-cap (ultra is limited to half the burst). Only applied
    // to a tier the USER selected — a platform-fixed model must not be throttled
    // by a cap the user did not choose.
    const capTier5h = userChoseModel ? tierFiveHourCap(ctx.plan, ctx.tier) : UNLIMITED;

    try {
      const raw = (await (
        this.redis as unknown as {
          vguReserve: (...args: unknown[]) => Promise<unknown>;
        }
      ).vguReserve(
        K.window(ctx.userId),
        K.amounts(ctx.userId),
        K.period(ctx.userId, period.id),
        pooled ? K.pool(ctx.workspaceId!, period.id) : K.pool('_none', period.id),
        K.concurrency(ctx.userId),
        K.reservation(reservationId),
        K.idem(ctx.userId, ctx.requestId || '_none'),
        K.open,
        wsConc.key,
        featConc.key,
        K.windowTier(ctx.userId, ctx.tier),
        K.amountsTier(ctx.userId, ctx.tier),
        String(now),
        String(now - burstWindowSec() * 1000),
        reservationId,
        ctx.requestId || '',
        String(vgu),
        ctx.tier,
        ctx.feature,
        cap(policy.fiveHourVGU),
        cap(policy.monthlyVGU),
        cap(seatCap),
        cap(policy.monthlyVGU),
        cap(userChoseModel ? (alloc.maxVGU ?? UNLIMITED) : UNLIMITED),
        cap(userChoseModel ? (alloc.maxRequests ?? UNLIMITED) : UNLIMITED),
        cap(featureMonthlyCap(ctx.feature, ctx.plan)),
        cap(effectiveConcurrency(policy.maxConcurrentAI, concurrencyFactor)),
        String(concurrencyTtlMs(ctx.feature)),
        String(reservationTtlSec()),
        String(period.secondsRemaining + 172800),
        pooled ? '1' : '0',
        JSON.stringify({
          // The sweeper needs the owner to free a crashed request's concurrency
          // slot, so the ENGINE records it rather than trusting every caller to
          // duplicate it into `meta`. Spread first so caller metadata cannot
          // overwrite the identity the engine was actually given.
          ...(ctx.meta || {}),
          userId: ctx.userId,
          plan: ctx.plan,
          workspaceId: ctx.workspaceId,
          periodId: period.id,
        }),
        cap(wsConc.limit < 0 ? UNLIMITED : wsConc.limit),
        ctx.requestIdTrusted ? '1' : '0',
        cap(featConc.limit < 0 ? UNLIMITED : featConc.limit),
        ctx.nested ? '1' : '0',
        cap(capTier5h),
        // Per-feature monthly request-COUNT cap (e.g. Free 1 / Creator 2 deep
        // research previews). UNLIMITED for features/plans without a count cap.
        cap(featureMonthlyRequestCap(ctx.feature, ctx.plan))
      )) as [number, string, string, ...number[]];

      const [
        okFlag,
        code,
        resId,
        b,
        p,
        tv,
        tr,
        ft,
        pool,
        inflight,
        wsInflight,
        featInflight,
      ] = raw as [
        number,
        string,
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];

      const usage = {
        burst: Number(b) || 0,
        period: Number(p) || 0,
        tierVGU: Number(tv) || 0,
        tierRequests: Number(tr) || 0,
        feature: Number(ft) || 0,
        pool: Number(pool) || 0,
        inflight: Number(inflight) || 0,
        workspaceInflight: Number(wsInflight) || 0,
        featureInflight: Number(featInflight) || 0,
      };

      if (okFlag === 1) {
        return {
          ok: true,
          reservationId: resId,
          idempotent: code === 'IDEMPOTENT',
          billingPeriodId: period.id,
          estimatedVGU: vgu,
          usage,
        };
      }

      return {
        ok: false,
        code: code as VGUErrorCode,
        message: DENY_MESSAGE[code] ?? 'VeeGPT usage limit reached.',
        retryAfterSec: await this.retryAfterFor(code, period, ctx.userId, now),
        billingPeriodId: period.id,
        estimatedVGU: vgu,
        usage,
      };
    } catch (err) {
      return this.handleRedisFailure(ctx, vgu, period, err);
    }
  }

  /**
   * Unix epoch (seconds) at which the rolling 5-hour burst window next frees
   * capacity. Anchored to the OLDEST usage event still inside the window (its
   * timestamp + window length) so the countdown is stable across refreshes and
   * restarts, matching what `usageSnapshot` reports. Falls back to a full
   * window from now when there is no live usage or Redis can't be read.
   */
  private async burstResetAtSec(userId: string, nowMs: number): Promise<number> {
    const windowSec = burstWindowSec();
    const nowSec = Math.floor(nowMs / 1000);
    try {
      const windowStart = nowMs - windowSec * 1000;
      // Oldest live event = smallest score; LIMIT 0 1 fetches just that one.
      const oldest = await this.redis.zrangebyscore(
        K.window(userId),
        String(windowStart),
        '+inf',
        'WITHSCORES',
        'LIMIT',
        0,
        1
      );
      if (oldest.length >= 2) {
        const oldestMs = Number(oldest[1]);
        if (Number.isFinite(oldestMs) && oldestMs > 0) {
          return Math.floor(oldestMs / 1000) + windowSec;
        }
      }
    } catch {
      /* fall through to the safe full-window bound */
    }
    return nowSec + windowSec;
  }

  /** Seconds until the blocking window frees capacity. */
  private async retryAfterFor(
    code: string,
    period: BillingPeriod,
    userId: string,
    nowMs: number
  ): Promise<number | undefined> {
    switch (code) {
      case 'BURST_QUOTA_EXHAUSTED': {
        // A true rolling window frees capacity continuously as the oldest usage
        // ages out. Report the time until that first unlock, anchored to real
        // usage rather than a fresh full window on every call.
        const resetSec = await this.burstResetAtSec(userId, nowMs);
        return Math.max(1, resetSec - Math.floor(nowMs / 1000));
      }
      case 'MONTHLY_QUOTA_EXHAUSTED':
      case 'MODEL_QUOTA_EXHAUSTED':
      case 'FEATURE_QUOTA_EXHAUSTED':
      case 'WORKSPACE_POOL_EXHAUSTED':
      case 'SEAT_SHARE_EXHAUSTED':
        return period.secondsRemaining;
      case 'CONCURRENCY_LIMIT':
        return 15;
      case 'WORKSPACE_CONCURRENCY_LIMIT':
        // A team's slots free as teammates' requests finish, so this clears
        // faster than a personal one on average — but not instantly.
        return 10;
      case 'FEATURE_CONCURRENCY_LIMIT':
        // The features that bound themselves are the long ones (research,
        // autopilot), so the wait is measured in tens of seconds, not seconds.
        return 30;
      default:
        return undefined;
    }
  }

  /**
   * Redis is unavailable. Spec §33: never turn an outage into unlimited AI.
   * Expensive work is refused; cheap work proceeds unmetered but is logged so the
   * exposure is visible and bounded.
   */
  private handleRedisFailure(
    ctx: ReserveContext,
    vgu: number,
    period: BillingPeriod,
    err: unknown
  ): ReserveResult {
    const expensive =
      FAIL_CLOSED_TIERS.has(ctx.tier) || vgu >= FAIL_CLOSED_VGU_THRESHOLD;

    logger.error('vgu: quota state unverifiable', {
      userId: ctx.userId,
      feature: ctx.feature,
      tier: ctx.tier,
      estimatedVGU: vgu,
      decision: expensive ? 'FAIL_CLOSED' : 'ALLOWED_UNMETERED',
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-reservation',
    });

    if (expensive) {
      return {
        ok: false,
        code: VGU_ERROR.QUOTA_UNVERIFIABLE,
        message: DENY_MESSAGE.QUOTA_UNVERIFIABLE,
        retryAfterSec: 30,
        billingPeriodId: period.id,
        estimatedVGU: vgu,
      };
    }

    // Cheap request: allow, but with a sentinel id so commit/release are no-ops
    // and nothing pretends this was accounted for.
    return {
      ok: true,
      reservationId: UNVERIFIED_RESERVATION,
      idempotent: false,
      billingPeriodId: period.id,
      estimatedVGU: vgu,
      usage: {
        burst: 0,
        period: 0,
        tierVGU: 0,
        tierRequests: 0,
        feature: 0,
        pool: 0,
        inflight: 0,
        workspaceInflight: 0,
        featureInflight: 0,
      },
    };
  }

  /**
   * Reconcile a reservation to the measured actual usage. Idempotent.
   * Returns the delta applied (positive = charged more, negative = refunded).
   */
  async commit(
    reservationId: string,
    actualVGUAmount: number,
    ctx: {
      userId: string;
      workspaceId?: string;
      plan: PlanId;
      tier: ModelTier;
      feature: string;
      billingPeriodId: string;
    }
  ): Promise<{ status: string; delta: number }> {
    if (!reservationId || reservationId === UNVERIFIED_RESERVATION) {
      return { status: 'SKIPPED', delta: 0 };
    }
    const policy = policyForPlan(ctx.plan);
    const pooled = policy.pooled && !!ctx.workspaceId;
    try {
      const raw = (await (
        this.redis as unknown as {
          vguCommit: (...args: unknown[]) => Promise<unknown>;
        }
      ).vguCommit(
        K.window(ctx.userId),
        K.amounts(ctx.userId),
        K.period(ctx.userId, ctx.billingPeriodId),
        pooled
          ? K.pool(ctx.workspaceId!, ctx.billingPeriodId)
          : K.pool('_none', ctx.billingPeriodId),
        K.concurrency(ctx.userId),
        K.reservation(reservationId),
        workspaceConcurrency(policy, ctx.workspaceId).key,
        featureConcurrency(ctx.userId, ctx.feature).key,
        K.windowTier(ctx.userId, ctx.tier),
        K.amountsTier(ctx.userId, ctx.tier),
        reservationId,
        String(roundVGU(Math.max(0, actualVGUAmount))),
        ctx.tier,
        ctx.feature,
        pooled ? '1' : '0'
      )) as [number, string, number];
      await this.closeOpen(reservationId);
      return { status: String(raw[1]), delta: Number(raw[2]) || 0 };
    } catch (err) {
      logger.error('vgu: commit failed — reservation left open for the sweeper', {
        reservationId,
        err: err instanceof Error ? err.message : String(err),
        module: 'veegpt-reservation',
      });
      return { status: 'ERROR', delta: 0 };
    }
  }

  /**
   * Refund a reservation because no usage occurred (provider failed outright).
   * Idempotent. `terminal` records why.
   */
  async release(
    reservationId: string,
    ctx: {
      userId: string;
      workspaceId?: string;
      plan: PlanId;
      tier: ModelTier;
      feature: string;
      billingPeriodId: string;
    },
    terminal: Extract<ReservationStatus, 'RELEASED' | 'FAILED' | 'EXPIRED'> = 'RELEASED'
  ): Promise<{ status: string; refunded: number }> {
    if (!reservationId || reservationId === UNVERIFIED_RESERVATION) {
      return { status: 'SKIPPED', refunded: 0 };
    }
    const policy = policyForPlan(ctx.plan);
    const pooled = policy.pooled && !!ctx.workspaceId;
    try {
      const raw = (await (
        this.redis as unknown as {
          vguRelease: (...args: unknown[]) => Promise<unknown>;
        }
      ).vguRelease(
        K.window(ctx.userId),
        K.amounts(ctx.userId),
        K.period(ctx.userId, ctx.billingPeriodId),
        pooled
          ? K.pool(ctx.workspaceId!, ctx.billingPeriodId)
          : K.pool('_none', ctx.billingPeriodId),
        K.concurrency(ctx.userId),
        K.reservation(reservationId),
        workspaceConcurrency(policy, ctx.workspaceId).key,
        featureConcurrency(ctx.userId, ctx.feature).key,
        K.windowTier(ctx.userId, ctx.tier),
        K.amountsTier(ctx.userId, ctx.tier),
        reservationId,
        ctx.tier,
        ctx.feature,
        pooled ? '1' : '0',
        terminal
      )) as [number, string, number];
      await this.closeOpen(reservationId);
      return { status: String(raw[1]), refunded: Number(raw[2]) || 0 };
    } catch (err) {
      logger.error('vgu: release failed — reservation left open for the sweeper', {
        reservationId,
        err: err instanceof Error ? err.message : String(err),
        module: 'veegpt-reservation',
      });
      return { status: 'ERROR', refunded: 0 };
    }
  }

  /** Read a reservation record (for audit and tests). */
  async getReservation(
    reservationId: string
  ): Promise<Record<string, string> | null> {
    try {
      const h = await this.redis.hgetall(K.reservation(reservationId));
      return h && Object.keys(h).length ? h : null;
    } catch {
      return null;
    }
  }

  private async closeOpen(reservationId: string): Promise<void> {
    try {
      await this.redis.zrem(K.open, reservationId);
    } catch {
      /* best effort — the sweeper tolerates leftovers */
    }
  }

  /**
   * Reclaim reservations whose owner died before reconciling.
   *
   * The concurrency slot already self-expires, so a crash cannot block future
   * requests. What remains is the VGU charge, and it is deliberately KEPT: we
   * cannot know whether the provider call completed, and assuming it did is the
   * only safe assumption for cost. The reservation is marked EXPIRED so the
   * ledger shows it was never reconciled.
   */
  async sweepExpired(limit = 200): Promise<{ swept: number }> {
    let swept = 0;
    try {
      const due = await this.redis.zrangebyscore(
        K.open,
        '-inf',
        String(Date.now()),
        'LIMIT',
        0,
        limit
      );
      for (const resId of due) {
        const rec = await this.getReservation(resId);
        if (!rec) {
          await this.closeOpen(resId);
          continue;
        }
        if (rec.status === 'RESERVED') {
          // Free the slot and mark the record; the charge stands.
          await this.redis
            .hset(K.reservation(resId), 'status', 'EXPIRED')
            .catch(() => {});
          const meta = safeJson(rec.meta);
          const userId = typeof meta.userId === 'string' ? meta.userId : '';
          if (userId) {
            await this.redis.zrem(K.concurrency(userId), resId).catch(() => {});
          }
          // And the workspace slot, or a crashed pooled worker would hold team
          // capacity until the slot's own TTL expired.
          const wsId =
            typeof meta.workspaceId === 'string' ? meta.workspaceId : '';
          if (wsId) {
            await this.redis
              .zrem(K.workspaceConcurrency(wsId), resId)
              .catch(() => {});
          }
          // And the per-feature slot, or a crashed research job would block the
          // user's next one until the slot's own TTL expired.
          if (userId && rec.feature) {
            await this.redis
              .zrem(K.featureConcurrency(userId, rec.feature), resId)
              .catch(() => {});
          }
          swept++;
          logger.warn('vgu: reservation expired without reconciliation', {
            reservationId: resId,
            reserved: rec.reserved,
            feature: rec.feature,
            module: 'veegpt-reservation',
          });
        }
        await this.closeOpen(resId);
      }
    } catch (err) {
      logger.warn('vgu: sweep failed', {
        err: err instanceof Error ? err.message : String(err),
        module: 'veegpt-reservation',
      });
    }
    return { swept };
  }

  /**
   * Read-only view of every budget, for the UI and for admin tooling.
   *
   * Reads the SAME keys the reserve script gates on, so what the user is shown
   * cannot disagree with what they are allowed to do. It reserves nothing and
   * mutates nothing (not even window pruning), so it is safe to poll.
   */
  async usageSnapshot(
    userId: string,
    knownPlan: PlanId,
    workspaceId?: string
  ): Promise<VGUUsageSnapshot> {
    const now = Date.now();
    const period = await resolveBillingPeriod(userId, new Date(now));
    const policy = policyForPlan(knownPlan);
    const windowStart = now - burstWindowSec() * 1000;
    const pooled = policy.pooled && !!workspaceId;
    const wsConc = workspaceConcurrency(policy, workspaceId);

    let burstUsed = 0;
    let periodUsed = 0;
    let poolUsed = 0;
    let inflight = 0;
    let wsInflight = 0;
    // Timestamp (ms) of the OLDEST usage event still inside the rolling window.
    // The burst window's reset is anchored to this + window length, so the
    // countdown reflects real recorded usage and stays stable across page
    // refreshes and server restarts (it never re-arms to a fresh 5h).
    let oldestBurstMs = 0;
    const tierUsed: Record<string, number> = {};
    const tierRequests: Record<string, number> = {};
    const featureUsed: Record<string, number> = {};
    let verified = true;

    try {
      // WITHSCORES so we learn each event's timestamp (the score). ioredis
      // returns them ascending by score, so the first score is the oldest.
      const liveWithScores = await this.redis.zrangebyscore(
        K.window(userId),
        String(windowStart),
        '+inf',
        'WITHSCORES'
      );
      const liveMembers: string[] = [];
      for (let i = 0; i < liveWithScores.length; i += 2) {
        const member = liveWithScores[i];
        const score = Number(liveWithScores[i + 1]);
        liveMembers.push(member);
        if (Number.isFinite(score) && (oldestBurstMs === 0 || score < oldestBurstMs)) {
          oldestBurstMs = score;
        }
      }
      if (liveMembers.length) {
        const amounts = await this.redis.hmget(K.amounts(userId), ...liveMembers);
        for (const a of amounts) burstUsed += Number(a) || 0;
      }

      const per = await this.redis.hgetall(K.period(userId, period.id));
      periodUsed = Number(per.total) || 0;
      for (const [k, v] of Object.entries(per)) {
        if (k.startsWith('tv:')) tierUsed[k.slice(3)] = Number(v) || 0;
        else if (k.startsWith('tr:')) tierRequests[k.slice(3)] = Number(v) || 0;
        else if (k.startsWith('ft:')) featureUsed[k.slice(3)] = Number(v) || 0;
      }

      if (pooled) {
        poolUsed =
          Number(await this.redis.hget(K.pool(workspaceId!, period.id), 'total')) ||
          0;
      }
      inflight = await this.redis.zcount(
        K.concurrency(userId),
        String(now),
        '+inf'
      );
      if (wsConc.limit >= 0) {
        wsInflight = await this.redis.zcount(wsConc.key, String(now), '+inf');
      }
    } catch (err) {
      // A snapshot is informational; an outage must not fail the page. It is
      // flagged so the UI can say "usage temporarily unavailable" rather than
      // display a confident zero.
      verified = false;
      logger.warn('vgu: usage snapshot unavailable', {
        userId,
        err: err instanceof Error ? err.message : String(err),
        module: 'veegpt-reservation',
      });
    }

    const seatCap = policy.pooled ? seatMonthlyCap(policy) : policy.monthlyVGU;
    const nowSec = Math.floor(now / 1000);
    // Reset anchored to the oldest live event (see oldestBurstMs above). When
    // there is no live usage there is nothing to age out, so fall back to a
    // full window from now.
    const burstResetSec =
      oldestBurstMs > 0
        ? Math.floor(oldestBurstMs / 1000) + burstWindowSec()
        : nowSec + burstWindowSec();
    return {
      plan: knownPlan,
      verified,
      billingPeriodId: period.id,
      burst: window_(burstUsed, policy.fiveHourVGU, burstResetSec),
      period: window_(periodUsed, seatCap, nowSec + period.secondsRemaining),
      pool: pooled
        ? window_(poolUsed, policy.monthlyVGU, nowSec + period.secondsRemaining)
        : null,
      concurrency: {
        inflight,
        limit:
          policy.maxConcurrentAI === UNLIMITED ? null : policy.maxConcurrentAI,
      },
      workspaceConcurrency:
        wsConc.limit >= 0
          ? { inflight: wsInflight, limit: wsConc.limit }
          : null,
      // Spec §1105: the usage panel shows Deep Research and Autopilot as their own
      // lines, because they are the two features a user most needs to see the
      // remaining allowance for before starting one.
      features: GOVERNED_FEATURES.map(feature => {
        const cap = featureMonthlyCap(feature, knownPlan);
        const used = roundVGU(featureUsed[feature] || 0);
        return {
          feature,
          label: featureSpec(feature).label,
          usedVGU: used,
          maxVGU: cap === UNLIMITED ? null : cap,
          remainingVGU: cap === UNLIMITED ? null : roundVGU(Math.max(0, cap - used)),
          maxVGUPerJob: featureSpec(feature).maxVGUPerRequest,
          concurrencyLimit: featureConcurrencyLimit(feature) || null,
        };
      }),
      tiers: (['cheap', 'medium', 'premium', 'ultra'] as ModelTier[]).map(t => {
        const alloc = tierAllocation(knownPlan, t);
        return {
          tier: t,
          access: alloc.access,
          usedVGU: roundVGU(tierUsed[t] || 0),
          maxVGU: alloc.maxVGU ?? null,
          usedRequests: Math.round(tierRequests[t] || 0),
          maxRequests: alloc.maxRequests ?? null,
        };
      }),
    };
  }
}

/** One budget window as the UI consumes it. `limit: null` means unlimited. */
export interface VGUWindow {
  used: number;
  limit: number | null;
  remaining: number | null;
  resetAt: number;
}

export interface VGUUsageSnapshot {
  plan: PlanId;
  /** False when Redis could not be read — the numbers are not trustworthy. */
  verified: boolean;
  billingPeriodId: string;
  burst: VGUWindow;
  period: VGUWindow;
  /** Shared workspace budget, only for pooled plans. */
  pool: VGUWindow | null;
  concurrency: { inflight: number; limit: number | null };
  /** Workspace-wide concurrency, only for plans that bound it (pooled teams). */
  workspaceConcurrency: { inflight: number; limit: number } | null;
  /** Per-feature allowances the usage panel shows separately (spec §1105). */
  features: Array<{
    feature: string;
    label: string;
    usedVGU: number;
    maxVGU: number | null;
    remainingVGU: number | null;
    maxVGUPerJob: number;
    concurrencyLimit: number | null;
  }>;
  tiers: Array<{
    tier: ModelTier;
    access: 'full' | 'limited' | 'none';
    usedVGU: number;
    maxVGU: number | null;
    usedRequests: number;
    maxRequests: number | null;
  }>;
}

function window_(used: number, cap: number, resetAt: number): VGUWindow {
  const u = roundVGU(used);
  if (cap === UNLIMITED || !Number.isFinite(cap)) {
    return { used: u, limit: null, remaining: null, resetAt };
  }
  return { used: u, limit: cap, remaining: roundVGU(Math.max(0, cap - u)), resetAt };
}

function safeJson(s?: string): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Sentinel reservation id used when a cheap request ran without a verified quota. */
export const UNVERIFIED_RESERVATION = 'unverified';

let singleton: VGUReservationEngine | null = null;

/** The single shared engine instance. */
export function getReservationEngine(): VGUReservationEngine {
  if (!singleton) singleton = new VGUReservationEngine();
  return singleton;
}
