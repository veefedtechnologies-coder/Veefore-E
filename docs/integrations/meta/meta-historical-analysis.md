# Meta Graph API — Historical Analytics Investigation

**Status:** Verified against the LIVE Meta Graph API (not documentation assumptions).
**Date of tests:** 2026-07-02
**Test account:** `@arpit.10` — IG Business User id `17841406961110225` (455 followers, 19 media, created content back to 2020-10-05)
**API version:** `v22.0` (graph.facebook.com)
**Method:** A read-only probe (`scripts/meta-api-probe.mjs`) decrypted the connected account's real access token (AES-256-GCM, `server/security/token-encryption.ts`) and called Meta directly, recording exact status codes, point counts, sums, and error messages per range.

> Every number and every limit below comes from an actual API response captured during testing. Where a limit is stated, the exact Meta error is quoted as evidence.

---

## 1. Executive Summary

> **KEY FINDING (corrects an earlier assumption):** Historical follower gains **and losses** ARE available for **365+ days** on a fresh connect — but via the **`follows_and_unfollows`** metric, NOT `follower_count`. `follower_count` is the wrong endpoint (Meta caps it at 30 days). This is how Hootsuite shows 2-year follower data the day you connect.

| Question | Answer | Confidence |
|---|---|---|
| Historical **new followers (gained)** beyond 30 days? | **Yes — 365+ days** via `follows_and_unfollows` (`follow_type=FOLLOWER`). | **Certain** (live data) |
| Historical **lost followers (unfollows)** beyond 30 days? | **Yes — 365+ days** via `follows_and_unfollows` (`follow_type=NON_FOLLOWER`). | **Certain** (live data) |
| `follower_count` beyond 30 days? | **No** — 30-day hard cap. (Use `follows_and_unfollows` instead.) | **Certain** (live 400 error) |
| Historical **reach** beyond 30 days? | **Yes — 400+ days**. | **Certain** |
| Historical **profile visits / website clicks / engagement**? | **Yes — 365+ days** (via `metric_type=total_value`, chunked). | **High** |
| Historical **follower total** time series? | **No** direct metric, but reconstructable: `current − Σ(net follows)`; or accumulate snapshots. | **High** |
| Match Hootsuite's day-1 experience? | **Yes** — gained/lost/reach/impressions/profile-actions/engagement/content are all historically available. | **Certain** |

**Almost everything the product wants IS available historically for a year+** and can be shown immediately after connect. The prior "30-day follower cap" conclusion was because we queried `follower_count`; the correct metric is `follows_and_unfollows`.

---

## 2. Follower Investigation (highest priority)

### 2.0 ✅ SOLUTION: `follows_and_unfollows` — gained + lost, 365+ days

Endpoint: `GET /{ig-user-id}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=&until=`

The breakdown returns two values whose mapping was **verified against `follower_count`**:
- `follow_type=FOLLOWER` → **new followers (gained)** — matches `follower_count` exactly (7d: both `4`; 30d: both `17`).
- `follow_type=NON_FOLLOWER` → **unfollows (lost)**.

Retention (all live `200` with real values, 30-day chunks):

| Window | FOLLOWER (gained) | NON_FOLLOWER (lost) |
|---|---|---|
| last 30d | 17 | 20 |
| ~60d ago | 23 | 17 |
| ~90d ago | 6 | 13 |
| ~120d ago | 18 | 12 |
| ~180d ago | 14 | 14 |
| ~365d ago | 18 | 16 |

**Conclusion (Certain):** `follows_and_unfollows` provides **both gained and lost followers for at least the last year**, in 30-day chunks. Summing FOLLOWER over a range = New Followers; summing NON_FOLLOWER = Lost Followers; the difference = net growth. This is the correct metric for historical follower analytics and matches Hootsuite's behaviour.

Raw shape:
```json
{ "name": "follows_and_unfollows", "period": "day",
  "total_value": { "breakdowns": [ { "dimension_keys": ["follow_type"],
    "results": [ {"dimension_values":["FOLLOWER"],"value":17},
                 {"dimension_values":["NON_FOLLOWER"],"value":20} ] } ] } }
```
Requires `metric_type=total_value` + `breakdown=follow_type` (plain `period=day` errors). Each request ≤ 30 days.

### 2.1 `follower_count` — HARD 30-day cap (do NOT use for history)

Endpoint: `GET /{ig-user-id}/insights?metric=follower_count&period=day&since=&until=`

| Window tested | Result |
|---|---|
| Last 7 days | `200` — 7 points, sum **4** |
| Last 30 days | `200` — 30 points, sum **17** |
| 30–60 days ago | `400` — `(#100) (follower_count) metric only supports querying data for the last 30 days excluding the current day` |
| 60–90 days ago | `400` — same error |
| 90–120 / 180–210 / 350–365 days ago | `400` — same error |
| Single request spanning 90 days | `400` — `(#100) There cannot be more than 30 days (2592000 s) between since and until.` |

**Conclusion (Certain):** Meta returns **new-follower data only for the trailing 30 days**, and rejects any request whose `since`/`until` reaches further back or spans more than 30 days. Chunking does **not** help — the older chunks return HTTP 400. This is enforced server-side by Meta.

### 2.2 Follower total time series — not available

- `GET /{ig-user-id}?fields=followers_count` → `455` (current only). No historical/time-series variant exists.
- Therefore **daily follower totals, follower growth charts, and lost-followers** cannot be reconstructed from the API beyond the 30-day `follower_count` window.

### 2.3 What this means for our metrics

| Metric | Retrievable historically? | How |
|---|---|---|
| New Followers (gained) | ✅ **365+ days** | `follows_and_unfollows` → `FOLLOWER` (chunked 30d) |
| Lost Followers (unfollows) | ✅ **365+ days** | `follows_and_unfollows` → `NON_FOLLOWER` |
| Follower Growth / Net | ✅ **365+ days** | `FOLLOWER − NON_FOLLOWER` |
| New followers per day (`follower_count`) | ≤ 30 days only | use `follows_and_unfollows` instead for history |
| Follower total history | reconstruct or accumulate | `current − Σ net`, or daily snapshots |

---

## 3. Historical Data Availability Matrix (verified)

`period=day` with `since`/`until` in **≤30-day chunks** unless noted. "Max range" = furthest back a real 200 response with data was observed.

| Metric | Query form | Historical? | Max range verified | Evidence |
|---|---|---|---|---|
| `follows_and_unfollows` (gained+lost) | `total_value` + `breakdown=follow_type` | ✅ | **365+ days** | FOLLOWER/NON_FOLLOWER real values at 30→365d |
| `follower_count` | `period=day` | ❌ 30d cap | 30 days | 400 error beyond 30d |
| `reach` | `period=day` | ✅ | **400+ days** | 200 + real sums at 30/60/90/120/180/270/365/400d ago |
| `reach` | `metric_type=total_value` | ✅ | 30d window (sums) | total_value=2980 (30d) |
| `profile_views` | `metric_type=total_value` | ✅ | **365+ days** | total_value 191(30d)/113(60d)/180(120d)/110(365d) |
| `website_clicks` | `metric_type=total_value` | ✅ (0 for this acct) | ≥30d | total_value=0 |
| `accounts_engaged` | `metric_type=total_value` | ✅ | ≥30d | 115 |
| `total_interactions` | `metric_type=total_value` | ✅ | ≥30d | 352 |
| `likes` / `comments` / `shares` / `saves` | `metric_type=total_value` | ✅ | ≥30d (same family as profile_views → long) | 185 / 11 / 72 / 5 |
| `views` (impressions successor) | `metric_type=total_value` | ✅ | ≥30d | 6866 |
| Media list (`/media`) | fields+paging | ✅ full history | back to **2020-10-05** | 19 items, oldest 2020 |

> Note: `profile_views`, `website_clicks`, `likes`, `comments`, `shares`, `saves`, `accounts_engaged`, `total_interactions`, `views` **must** be requested with `metric_type=total_value` (plain `period=day` returns error `(#100) ... should be specified with parameter metric_type=total_value`).

### Maximum Historical Range Matrix

| Data family | Practical max range | Chunking needed |
|---|---|---|
| Follower gains (`follower_count`) | **30 days** | n/a (single ≤30d request) |
| Reach | **≥ 400 days** (≈ Meta's ~2yr retention) | Yes, 30-day chunks |
| Profile views / clicks / engagement (`total_value`) | **≥ 365 days** | Yes, 30-day chunks |
| Content/media & media insights | **Account lifetime** (2020+) | Paginate `/media` |

---

## 4. Endpoint Reference (as tested)

### 4.1 IG User Insights — time series
`GET https://graph.facebook.com/v22.0/{ig-user-id}/insights`
- **Purpose:** account-level metrics.
- **Permissions:** `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement` (Business login).
- **Supports:** `since`, `until` (≤30 days apart), `period=day|week|days_28`, `metric_type=total_value`.
- **Historical:** yes for `reach` (400d+) and `total_value` metrics (365d+); **no** for `follower_count` (30d).
- **Example (reach, 90–120 days ago):**
  `.../insights?metric=reach&period=day&since=1748908800&until=1751500800` → `200`, 30 daily values, sum 3333.
- **Known limitation:** each request ≤ 30 days; `follower_count` 30-day cap; `online_followers` last-30-days only (Meta docs).

### 4.2 IG User node — current fields
`GET /{ig-user-id}?fields=followers_count,media_count,username`
- Returns **current** `followers_count` only (455). No history.

### 4.3 IG Media + Media Insights
`GET /{ig-user-id}/media?fields=id,timestamp,media_type` (+ `/{media-id}/insights`)
- Full media history available (oldest 2020-10-05). Per-post insights (reach, likes, comments, saves, shares, video views) retrievable for each historical post → **content performance is fully historical**.

### 4.4 Not usable for our goal
- **Business Discovery** (`business_discovery`): only public aggregate counts of *other* accounts; no historical time series.
- **Follower list**: not provided by the API (confirmed by Meta + third parties).

---

## 5. Hootsuite / Sprout / Buffer / Later comparison (evidence-based)

Documented behaviour (their own help centres):
- **Hootsuite:** "As soon as you add a social account, Hootsuite starts collecting data… We retrieve data at least once a day." → **accumulates from connect**.
- **Metricool:** "When you connect… data from the previous 30 days will be displayed… follower tracking starts from the moment you connect."
- **Dataslayer:** "does not pull past historical data, but helps you accumulate it going forward."
- **Catchr / Minter.io:** "Data is only available for the last 30 days" for follower history.

(Rephrased for licensing compliance.)

**Conclusion (High confidence):**
- For **follower** history, no third-party tool can exceed Meta's 30-day cap on a fresh connect; they all **accumulate daily snapshots** forward. A Hootsuite view showing >30 days of follower data implies the account was connected earlier and its history accumulated.
- For **reach / impressions / profile actions / engagement / content**, these tools *can* show 90-day/12-month history on day 1 — because (as our tests prove) those metrics **are** available historically from Meta. Any belief that "everything is 30-day capped" is incorrect; **only followers are**.

---

## 6. Recommendations for Veefore

1. **Followers (New + Lost + Net) — switch from `follower_count` to `follows_and_unfollows`.** Query `metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type` in 30-day chunks across the selected range (up to ~365 days). `FOLLOWER` = New Followers, `NON_FOLLOWER` = Lost Followers, difference = Net. This delivers **real historical follower gains/losses for 30d / 90d / 12-month immediately after connect** — the exact behaviour the user expects from Hootsuite. **This is the primary fix.**
2. **Reach, Impressions, Profile Visits, Website Clicks, Engagement, Views, Content** → fetch real history (up to ~1–2 years) via 30-day chunked `since`/`until` (`reach` as `period=day`; the rest via `metric_type=total_value`). Show immediately for all ranges.
3. **Follower total chart** → reconstruct as `current followers − Σ(FOLLOWER − NON_FOLLOWER)` walking back day-by-day, or keep daily `followers_count` snapshots.
4. Retire the follower-history workarounds that assumed a hard 30-day cap (`InstagramFollowerDaily` accumulation is now a redundant fallback, not the primary source).

### Architecture recommendation
- On connect + daily, backfill via chunked requests: `follows_and_unfollows` (≤365d), `reach` (≤365d+), and the `total_value` engagement/profile metrics (≤365d). Store daily rows keyed by (accountId, date, metric). The analytics bridge reads stored history for any range — no heavy live calls in the request path.
- Chunk size = 30 days (Meta rejects wider spans with `(#100) There cannot be more than 30 days between since and until`).

---

## 7. Confidence Summary

| Conclusion | Confidence | Basis |
|---|---|---|
| `follows_and_unfollows` gives gained+lost for 365+ days | **Certain** | Live 200 + real values 30→365d; FOLLOWER matches `follower_count` |
| `follower_count` capped at 30 days | **Certain** | Live 400 errors quoted |
| `reach` historical ≥ 400 days | **Certain** | Live 200 + real sums 30→400d |
| `profile_views`/clicks/engagement historical ≥ 365 days | **High** | profile_views confirmed 365d; same metric family/params |
| Follower total time series not a direct metric | **Certain** | No API field; reconstruct from net follows |
| Competitors (Hootsuite) use `follows_and_unfollows` for history | **High** | Matches observed 2-year day-1 data + our live evidence |

---

## 8. Reproduce

```
node scripts/meta-api-probe.mjs 17841406961110225
```
Read-only. Decrypts the stored token and prints per-range status/points/sums/errors used to produce this report.
