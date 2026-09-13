# Minimum-Sufficient-Context Threshold Tuning

_Task 11.3 — Phase 9 (De-duplication and measurement-driven tuning)_
_Requirements: 4.3, 4.6, 9.x tuning, 26.1, 26.2, 26.3, 26.4_

## Purpose

This note records the tuning methodology and the retention-timeout policy for
the VeeGPT context-optimization thresholds. It is the authoritative record of
**why no threshold reduction, de-duplication expansion, or `unnecessary`-item
retirement has been applied**, and of the exact conditions under which each such
change becomes permissible.

The governing principle (Requirement 26 — Minimum-Sufficient-Context Guarantee)
is that the system is tuned for the **smallest context for which the
Regression_Suite still passes 100% against the Baseline_Benchmark** — not the
smallest context achievable. Over-compaction that degrades answers is a
regression, not an optimization.

## Current decision: no reduction applied

**No threshold has been lowered, no `intentionalRepeat` unit has been dropped,
and no `unnecessary` item has been retired.** All current values in
`server/config/veegpt-context.config.ts` and all module classifications in
`server/routes/veegpt-modules.ts` are retained exactly as-is.

This is the correct conservative outcome because tuning is **measurement-driven
only** and, at this point:

- The **Regression_Suite (task 10.x) is not yet complete** — there is no green
  100%-passing suite against which a reduction can be validated.
- **No After_Benchmark measurement exists** (task 11.4) to justify any specific
  reduction as token-saving.
- Therefore, per Req 26.1 and 26.2, **no candidate reduction is justified**: a
  reduction may only be accepted if the Regression_Suite still passes 100% after
  it, and that evidence does not yet exist.

Reducing a threshold now would be "minimum possible context" tuning done on
faith, which Requirement 26 explicitly prohibits. Correctness wins over tokens.

## Current values retained (reference)

Thresholds (from `server/config/veegpt-context.config.ts`, all env-overridable):

| Value | Default | Notes |
| --- | --- | --- |
| `recentWindowLongTerm` | 20 | = existing `LONG_TERM_VERBATIM`; no behavior change |
| `recentWindowShortTerm` | 8 | = existing `SHORT_TERM_VERBATIM` |
| `summaryBatch` | 10 | = existing `SUMMARY_BATCH` |
| `historyTokenBudget` | 24000 | deliberately high; compaction only past this ceiling |
| `memoryRetrievalLimit` | 50 | max memory items scanned/injected per request |
| `memoryRetrievalBudgetMs` | 150 | fail-open memory relevance time budget |
| `toolResultMaxTokens` | 2000 | tool-result reduction threshold |
| `unnecessaryRetentionDays` | 30 | retention timeout for `unnecessary` items (Req 4.6) |

`intentionalRepeat` units retained verbatim by `dedupeContext()` (Req 13.3):

- **W1** — `rich-output` spec module
- **W2** — `workspace-actions-guidance` module
- **W11** — `output-contract` tail module

`unnecessary`-classified modules currently in the registry: **none.** No module
in `server/routes/veegpt-modules.ts` carries `contextClass: 'unnecessary'`, so
there is nothing to retire at this time. Should the audit/classification later
mark any item `unnecessary`, the retirement policy below applies.

## Tuning methodology (apply ONLY once the Regression_Suite passes 100%)

A reduction is any of: lowering a config threshold, expanding
`dedupeContext()` to collapse an additional unit, dropping an
`intentionalRepeat` unit (W1/W2/W11), or retiring an `unnecessary`-classified
instruction.

For each candidate reduction, one at a time:

1. **Precondition.** The Regression_Suite (task 10.x) must exist and pass 100%
   (zero failing cases) against the Baseline_Benchmark on the current
   configuration. If it does not, stop — no reduction is permitted (Req 26.1).
2. **Apply one candidate.** Change exactly one threshold / de-dup rule / item at
   a time so the effect is attributable.
3. **Re-run the Regression_Suite.** Accept the reduction **only if the suite
   still passes 100%** and no case changes its pass/fail result relative to the
   Baseline_Benchmark (Req 26.2). If any case changes, **revert** and retain the
   context needed to keep that case passing.
4. **Re-run the After_Benchmark** (task 11.4). Keep the reduction only if it
   contributes to the ≥10% mean input-token reduction with no behavioral metric
   regression and latency not worse by >10%.
5. **Record** the accepted/rejected outcome (and the measured deltas) here and
   in the final report (task 14.1).

### Scoping reasoning instructions (Req 26.3)

Reasoning-related instructions are **scoped to the tasks that need them** via
module `appliesTo` selection, not retained for all tasks. They are **never
removed solely to save tokens** for any task that the Regression_Suite shows
requires them. Scoping-to-need is permitted; removal-to-save-tokens is not.

Hidden reasoning content is never placed into user-visible output (Req 26.4);
this remains unchanged and is not a tuning lever.

### Memory tuning (Req 9.x)

`memoryRetrievalLimit` and `memoryRetrievalBudgetMs` may only be tightened under
the same measurement gate above. Memory relevance must continue to **fail open**
toward completeness: when relevance cannot be determined within the time budget,
ALL memory is included (Req 9.7). No tuning may weaken this fail-open guarantee.

## Retention-timeout policy for `unnecessary` items (Req 4.3, 4.6)

An instruction classified `unnecessary` is **retained in the active
configuration** and is removed **only** when one of the following holds:

1. **Regression confirmation (preferred).** The Regression_Suite confirms that
   removing it produces outputs **identical** to the pre-removal baseline across
   **all** Regression_Suite cases (Req 4.3). This is the equivalence path.
2. **Retention timeout.** The configured retention timeout
   (`unnecessaryRetentionDays`, default **30 days**, env
   `VEEGPT_CTX_UNNECESSARY_RETENTION_DAYS`) has elapsed, so that `unnecessary`
   instructions are not retained indefinitely (Req 4.6).
3. **Explicit alternative review** approves the removal (Req 4.6).

Until one of these conditions is met, the `unnecessary` instruction stays in the
active configuration and its current behavior is preserved. Because there are no
`unnecessary`-classified items today, this policy is currently a no-op recorded
for when classification produces such items.

## Guarantees preserved

This task changes **no** correctness guarantee:

- No token-driven dropping of needed tools, tool-result fields, memory, or the
  current user turn.
- `intentionalRepeat` units (W1/W2/W11) preserved verbatim by `dedupeContext()`.
- Memory retrieval remains fail-open (Req 9.7).
- Reasoning instructions scoped to need, never removed to save tokens (Req 26.3).
- Optimized path stays flag-guarded and degrades to the legacy `buildPrompt`
  path on any failure.

## Next step

Once task 10.x delivers a 100%-passing Regression_Suite and task 11.4 captures an
After_Benchmark, revisit this note and apply the methodology above one candidate
at a time, recording each accepted/rejected reduction with its measured deltas.
