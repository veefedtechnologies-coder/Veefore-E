/**
 * Baseline_Benchmark harness barrel (spec: veegpt-context-optimization, Req 2).
 *
 * Re-exports the request set, harness, scoring, and the deterministic mock
 * runner so task 3.5 (baseline capture) and later After_Benchmark comparisons
 * can import a single, stable entry point.
 */

export * from './types';
export * from './request-set';
export * from './scoring';
export * from './harness';
export * from './mock-provider';
export * from './capture-baseline';
export * from './after-provider';
export * from './after-benchmark';
