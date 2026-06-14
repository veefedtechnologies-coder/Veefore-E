/**
 * Billing and Subscription Type Definitions
 * 
 * Type definitions for subscription management, payment methods,
 * and billing history.
 */

/**
 * Subscription status
 */
export type SubscriptionStatus = 
  | 'active'
  | 'cancelled'
  | 'past_due'
  | 'unpaid'
  | 'trialing'
  | 'incomplete';

/**
 * Subscription plan IDs
 */
export type PlanId = 'free' | 'growth' | 'pro' | 'enterprise';

/**
 * Subscription data structure
 */
export interface SubscriptionData {
  id?: string;
  status: SubscriptionStatus;
  planId?: PlanId;
  amount: number;
  currency?: string;
  interval?: 'month' | 'year';
  currentPeriodStart?: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  endDate?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string;
}

/**
 * Payment method structure
 */
export interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'bank_account';
  brand?: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  billingDetails?: {
    name?: string;
    email?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
}

/**
 * Billing history invoice status
 */
export type InvoiceStatus = 'paid' | 'pending' | 'failed' | 'refunded';

/**
 * Billing history item structure
 */
export interface BillingHistoryItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency?: string;
  status: InvoiceStatus;
  invoiceUrl?: string;
  invoiceNumber?: string;
  pdfUrl?: string;
}

/**
 * Plan upgrade/downgrade payload
 */
export interface PlanChangePayload {
  planId: PlanId;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
}

/**
 * Subscription cancellation payload
 */
export interface CancellationPayload {
  reason?: string;
  feedback?: string;
  cancelAtPeriodEnd?: boolean;
}

/**
 * Stripe portal session response
 */
export interface PortalSessionResponse {
  url: string;
  sessionId?: string;
}

/**
 * Payment method setup response
 */
export interface PaymentMethodSetupResponse {
  setupUrl: string;
  clientSecret?: string;
}

/**
 * Usage and credits data
 */
export interface UsageData {
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  resetDate: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
}

/**
 * Plan features configuration
 */
export interface PlanFeatures {
  credits: number;
  videoGeneration: boolean;
  advancedVideoGeneration: boolean;
  instagramIntegration: boolean;
  analytics: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  teamCollaboration: boolean;
  prioritySupport: boolean;
  dedicatedSupport: boolean;
  customBranding: boolean;
  whiteLabel: boolean;
}

/**
 * Plan configuration
 */
export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: PlanFeatures;
  popular?: boolean;
  enterprise?: boolean;
}
