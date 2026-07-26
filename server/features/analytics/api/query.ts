/**
 * Veefore Analytics — Dashboard Query Model (Phase 8).
 *
 * The consistent query contract every dashboard endpoint accepts
 * (08-backend-api-architecture.md Ch 5): date range, comparison, platform,
 * account, pagination. Parsed/validated with zod.
 */

import { z } from 'zod'

/** Supported rollup granularity for a query. */
export const QueryGranularity = z.enum(['hourly', 'daily', 'weekly', 'monthly', 'lifetime'])

/**
 * Query schema shared across dashboard endpoints. `workspaceId` is validated
 * separately by the workspace-access middleware; it is included here for typing.
 */
export const AnalyticsQuerySchema = z.object({
  workspaceId: z.string().min(1),
  /** Inclusive ISO start of the analysis window. */
  from: z.string().datetime().optional(),
  /** Exclusive ISO end of the analysis window. */
  to: z.string().datetime().optional(),
  /** Comparison window start (previous period) for deltas. */
  compareFrom: z.string().datetime().optional(),
  compareTo: z.string().datetime().optional(),
  granularity: QueryGranularity.optional().default('daily'),
  /** Comma-separated platforms filter. */
  platforms: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  /** Comma-separated account ids filter. */
  accounts: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  page: z.coerce.number().int().positive().max(1000).optional().default(1),
  pageSize: z.coerce.number().int().positive().max(200).optional().default(50),
})

/** Parsed analytics query. */
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>

/** Parse and validate raw request query params into an {@link AnalyticsQuery}. */
export function parseAnalyticsQuery(raw: unknown): AnalyticsQuery {
  return AnalyticsQuerySchema.parse(raw)
}
