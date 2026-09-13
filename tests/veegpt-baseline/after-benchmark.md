# VeeGPT Context Optimization — After_Benchmark

_Captured: 2026-08-13T13:34:09.560Z_

**Classification: SUCCESS** (reference retained: `after`)

## Headline metrics (mean across all requests)

| Metric | Baseline (flag OFF) | After (flag ON) | Change |
|---|---:|---:|---:|
| Input tokens | 653.4 | 328.58 | −49.71% |
| Latency (ms) | 533.59 | 533.59 | +0% |
| toolCallAccuracyPct | 100 | 100 | no regression |
| answerQualityScore | 100 | 100 | no regression |
| memoryRetentionPct | 100 | 100 | no regression |
| contextRetentionPct | 100 | 100 | no regression |

## Gate

- Input-token reduction ≥ 10%: **PASS** (49.71%)
- Latency not worse by > 10%: **PASS** (0%)
- No behavioral regression: **PASS**

- Mean input tokens dropped 49.71% (≥ 10% target).
- Mean latency change 0% is within the +10% limit.
- No behavioral metric regressed (tool-call accuracy, answer quality, memory & context retention all held).

## Per-request input-token savings

| Request | Category | Baseline | After | Reduction | Tools exposed | Ambiguous |
|---|---|---:|---:|---:|---:|:---:|
| simple-chat-1 | simple-chat | 634 | 614 | −3.15% | 18 | yes |
| simple-chat-2 | simple-chat | 640 | 222 | −65.31% | 2 | no |
| simple-chat-3 | simple-chat | 647 | 627 | −3.09% | 18 | yes |
| follow-up-1 | follow-up | 669 | 251 | −62.48% | 2 | no |
| follow-up-2 | follow-up | 669 | 265 | −60.39% | 2 | no |
| follow-up-3 | follow-up | 678 | 657 | −3.1% | 18 | yes |
| content-creation-1 | content-creation | 642 | 224 | −65.11% | 2 | no |
| content-creation-2 | content-creation | 638 | 241 | −62.23% | 3 | no |
| content-creation-3 | content-creation | 643 | 253 | −60.65% | 3 | no |
| analytics-1 | analytics | 639 | 619 | −3.13% | 18 | yes |
| analytics-2 | analytics | 643 | 259 | −59.72% | 3 | no |
| analytics-3 | analytics | 640 | 236 | −63.13% | 2 | no |
| social-listening-1 | social-listening | 641 | 233 | −63.65% | 3 | no |
| social-listening-2 | social-listening | 643 | 362 | −43.7% | 8 | no |
| social-listening-3 | social-listening | 646 | 237 | −63.31% | 3 | no |
| scheduling-1 | scheduling | 638 | 189 | −70.38% | 1 | no |
| scheduling-2 | scheduling | 670 | 327 | −51.19% | 5 | no |
| scheduling-3 | scheduling | 639 | 317 | −50.39% | 6 | no |
| automation-1 | automation | 644 | 403 | −37.42% | 9 | no |
| automation-2 | automation | 645 | 404 | −37.36% | 9 | no |
| automation-3 | automation | 647 | 251 | −61.21% | 3 | no |
| multi-tool-1 | multi-tool | 651 | 379 | −41.78% | 7 | no |
| multi-tool-2 | multi-tool | 648 | 292 | −54.94% | 5 | no |
| multi-tool-3 | multi-tool | 645 | 342 | −46.98% | 6 | no |
| memory-dependent-1 | memory-dependent | 650 | 236 | −63.69% | 2 | no |
| memory-dependent-2 | memory-dependent | 657 | 283 | −56.93% | 4 | no |
| memory-dependent-3 | memory-dependent | 641 | 290 | −54.76% | 5 | no |
| long-conversation-1 | long-conversation | 738 | 349 | −52.71% | 3 | no |
| long-conversation-2 | long-conversation | 733 | 315 | −57.03% | 2 | no |
| long-conversation-3 | long-conversation | 732 | 364 | −50.27% | 4 | no |
| ambiguous-1 | ambiguous | 634 | 185 | −70.82% | 1 | no |
| ambiguous-2 | ambiguous | 630 | 610 | −3.17% | 18 | yes |
| ambiguous-3 | ambiguous | 630 | 226 | −64.13% | 2 | no |
| persona-dependent-1 | persona-dependent | 666 | 325 | −51.2% | 5 | no |
| persona-dependent-2 | persona-dependent | 667 | 249 | −62.67% | 2 | no |
| persona-dependent-3 | persona-dependent | 667 | 452 | −32.23% | 10 | no |
| tool-failure-1 | tool-failure | 634 | 260 | −58.99% | 3 | no |
| tool-failure-2 | tool-failure | 636 | 187 | −70.6% | 1 | no |
| tool-failure-3 | tool-failure | 639 | 231 | −63.85% | 3 | no |
| provider-fallback-1 | provider-fallback | 640 | 243 | −62.03% | 3 | no |
| provider-fallback-2 | provider-fallback | 635 | 614 | −3.31% | 18 | yes |
| provider-fallback-3 | provider-fallback | 640 | 236 | −63.13% | 2 | no |
| complex-reasoning-1 | complex-reasoning | 653 | 248 | −62.02% | 2 | no |
| complex-reasoning-2 | complex-reasoning | 654 | 271 | −58.56% | 3 | no |
| complex-reasoning-3 | complex-reasoning | 688 | 408 | −40.7% | 8 | no |

