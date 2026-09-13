import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

export type BillingActivityType = 'all' | 'payments' | 'refunds' | 'credits' | 'ai_usage'
export type BillingRange = 30 | 90 | 365

export interface BillingMoneySummary {
  currency: string
  paid: number
  refunded: number
  net: number
  purchases: number
}

export interface BillingCreditSummary {
  remaining: number
  monthly: number
  purchased: number
  usedThisCycle: number
  consumed: number
  refunded: number
  providerCostInr: number
  nextResetAt: string | null
}

export interface BillingAISummary {
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  estimatedCalls: number
  estimatedCostUsd: number
}

export interface BillingSeriesPoint {
  date: string
  spend: number
  refunds: number
  credits: number
  creditRefunds: number
  aiCalls: number
  tokens: number
  estimatedCostUsd: number
}

export interface BillingModelUsage {
  provider: string
  model: string
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  estimatedCalls: number
  estimatedCostUsd: number
}

interface BillingActivityBase {
  id: string
  occurredAt: string
  status: string
  title: string
}

export interface PaymentActivity extends BillingActivityBase {
  type: 'payment'
  amount: number
  currency: string
  source: string
  method: string | null
  planId: string | null
  billingCycle: string | null
  reference: string
  invoice: null | {
    number: string
    pdfUrl: string | null
    baseAmount: number
    gstAmount: number
    gstRate: number
    totalAmount: number
    gstin: string | null
  }
}

export interface RefundActivity extends BillingActivityBase {
  type: 'refund'
  amount: number
  currency: string
  source: string
  method: string | null
  reference: string
  originalPaymentId: string
}

export interface CreditActivity extends BillingActivityBase {
  type: 'credit'
  credits: number
  providerCostInr: number
  automatic: boolean
  refundReason: string | null
  reservedCredits: number | null
  refundedPortion: number | null
}

export interface AIUsageActivity extends BillingActivityBase {
  type: 'ai_usage'
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedTokens: number
  estimated: boolean
  estimatedCostUsd: number
}

export type BillingActivity = PaymentActivity | RefundActivity | CreditActivity | AIUsageActivity

export interface BillingHistoryResponse {
  range: { days: BillingRange; since: string; until: string }
  filters: { type: BillingActivityType; page: number; limit: number }
  summary: {
    money: BillingMoneySummary[]
    credits: BillingCreditSummary
    ai: BillingAISummary
    invoiceCount: number
  }
  series: BillingSeriesPoint[]
  models: BillingModelUsage[]
  activities: BillingActivity[]
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean }
  disclosure: string
}

export interface BillingHistoryFilters {
  range: BillingRange
  type: BillingActivityType
  page: number
  limit?: number
  /** Incremented on every user selection so a previously visited filter key is never reused. */
  requestVersion?: number
}

export const billingHistoryKey = (filters: BillingHistoryFilters) =>
  ['billing-history', filters.range, filters.type, filters.page, filters.limit ?? 20, filters.requestVersion ?? 0] as const

export function useBillingHistory(filters: BillingHistoryFilters) {
  const params = new URLSearchParams({
    range: String(filters.range),
    type: filters.type,
    page: String(filters.page),
    limit: String(filters.limit ?? 20),
    requestVersion: String(filters.requestVersion ?? 0),
  })

  return useQuery<BillingHistoryResponse, Error>({
    queryKey: billingHistoryKey(filters),
    queryFn: () => apiRequest(`/api/v2/subscription/billing/history?${params.toString()}&_=${Date.now()}`),
    staleTime: 0,
    gcTime: 0,
    retry: 0,
    refetchOnMount: 'always',
    structuralSharing: false,
  })
}
