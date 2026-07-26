# Open Spec Items (Analytics)

Tracked documentation gaps and conflicts discovered during implementation that
require a specification decision before the consuming phase can ship truthfully.

These are **not** future ideas (see `FUTURE_IDEAS.md`) and **not** released
changes (see `CHANGELOG.md`). They are open decisions owned by the maintainer of
`analytics/02-metrics-dictionary.md`.

Status legend: 🔴 Open · 🟡 Proposed (interim resolution in code) · 🟢 Resolved

---

## ASI-001 — Metric ID anchor conflict (Ch 5 vs Ch 12)

Status: 🟡 Proposed

Discovered: Phase 2 (Metric Engine)

Problem
- `02-metrics-dictionary.md` Ch 5 (Examples) lists `MTR-000002 = Reach`, `MTR-000003 = Impressions`.
- `02-metrics-dictionary.md` Ch 12 (Definitions) lists `MTR-000002 = Follower Growth`.
- Only `MTR-000001 = Followers` is unambiguous.

Interim resolution (in code)
- Ch 12 (the definitions chapter) is treated as authoritative; Ch 5 numbering is
  treated as illustrative. All IDs are centralized in
  `server/features/analytics/metrics/metric-ids.ts` so the canonical mapping is
  trivially reversible.

Needed decision
- Confirm the canonical ID for each metric and correct `02-metrics-dictionary.md`
  so Ch 5 and Ch 12 agree.

Blocks
- Nothing functionally. Low urgency, but should be corrected before external API
  consumers depend on specific IDs (Phase 9 Data Contracts).

---

## ASI-002 — Composite score component weights are undefined

Status: 🔴 Open

Discovered: Phase 2 (Metric Engine)

Problem
- `02-metrics-dictionary.md` Ch 19 states every composite score "must define its
  component metrics and weights," but the concrete weights (and, for some scores,
  the component list) are not specified.
- Affected: Virality Score, Account Health Score, Audience Loyalty Score,
  Engagement Quality Score, Reach Quality Score.

Interim resolution (in code)
- Weights are NOT invented (CODING_RULES Rule 2). The engine returns `null` for
  composites unless the caller supplies an explicit weight configuration; the
  weighted-aggregation framework is implemented and tested
  (`server/features/analytics/metrics/composite.ts`).

Needed decision
- Define, per composite: component metrics, their weights, score range (0–100),
  interpretation bands, confidence, and display conditions (Ch 19).

Blocks
- Phase 5 (Widget Library — Health/score KPI widgets).
- Phase 6 / Phase 11 (dashboards + AI that display composite scores).

---

## ASI-003 — Benchmark numeric ranges are undefined

Status: 🔴 Open

Discovered: Phase 2 (Metric Engine)

Problem
- `02-metrics-dictionary.md` Ch 9 defines benchmark *fields* (Industry Average,
  Excellent/Good/Average/Poor/Critical ranges) but provides no numeric ranges for
  any metric.

Interim resolution (in code)
- No benchmark numbers are invented (CODING_RULES Rule 2). `MetricDefinition.benchmark`
  is left undefined; `higherIsBetter` (inherent semantics) is set. `rateValue()`
  already returns a rating band the moment ranges are provided
  (`server/features/analytics/metrics/engine.ts`).

Needed decision
- Provide benchmark ranges (per metric, ideally per platform/industry) so metric
  values can be rated Excellent/Good/Average/Poor/Critical.

Blocks
- Phase 5 (Benchmark KPI widget).
- Phase 6 (dashboard rating badges / benchmark comparisons).
