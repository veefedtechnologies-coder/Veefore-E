# BillingSettings Component

## Overview

The `BillingSettings` component provides a comprehensive interface for managing subscriptions, payment methods, and billing history. It supports plan upgrades/downgrades, subscription cancellation, payment method management, and integration with Stripe's customer portal.

## Features

### 1. **Subscription Management**
- View current subscription plan and status
- Display next billing date and monthly cost
- Upgrade to higher-tier plans
- Downgrade to lower-tier plans
- Cancel subscription with confirmation

### 2. **Plan Comparison**
- Display all available plans (Free, Growth, Pro)
- Show plan features and pricing
- Highlight current plan and popular plans
- One-click plan changes

### 3. **Payment Methods**
- List all saved payment methods
- Add new credit cards
- Remove payment methods
- Set default payment method
- Display card brand, last 4 digits, and expiration

### 4. **Billing History**
- View past invoices and transactions
- Display payment date, amount, and status
- Download invoice PDFs
- Filter by payment status

### 5. **Stripe Integration**
- Direct link to Stripe Customer Portal
- Secure payment processing
- Advanced billing management through Stripe

## Architecture

### Component Structure

```
BillingSettings.tsx (450 lines)
├── Current Subscription Section
│   ├── Plan badge
│   ├── Monthly cost
│   └── Next billing date
├── Available Plans Section
│   ├── Plan cards (Free, Growth, Pro)
│   ├── Feature lists
│   └── Upgrade/Downgrade buttons
├── Payment Methods Section
│   ├── Payment method list
│   ├── Add payment method button
│   └── Remove/Set default actions
├── Billing History Section
│   ├── Invoice table
│   ├── Status badges
│   └── Download buttons
└── Stripe Portal Notice
```

### Hook Structure

```typescript
useBillingSettings()
├── Queries
│   ├── useQuery: /api/subscription
│   ├── useQuery: /api/payment-methods
│   └── useQuery: /api/billing-history
├── Mutations
│   ├── cancelSubscriptionMutation
│   ├── upgradePlanMutation
│   ├── downgradePlanMutation
│   ├── addPaymentMethodMutation
│   ├── removePaymentMethodMutation
│   └── setDefaultPaymentMethodMutation
└── Handlers
    ├── handleOpenBillingPortal()
    ├── handleCancelSubscription()
    ├── handleUpgradePlan()
    ├── handleDowngradePlan()
    ├── handleAddPaymentMethod()
    ├── handleRemovePaymentMethod()
    ├── handleSetDefaultPaymentMethod()
    └── handleDownloadInvoice()
```

## Usage

### Basic Usage

```tsx
import { BillingSettings } from '@/features/settings';

function SettingsPage() {
  return (
    <div>
      <BillingSettings />
    </div>
  );
}
```

### With SettingsLayout

```tsx
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { BillingSettings } from '@/features/settings';

function SettingsPage() {
  return (
    <SettingsLayout>
      <BillingSettings />
    </SettingsLayout>
  );
}
```

## API Endpoints

The component expects the following API endpoints:

### 1. Get Subscription
```
GET /api/subscription
Response: SubscriptionData
```

### 2. Get Payment Methods
```
GET /api/payment-methods
Response: PaymentMethod[]
```

### 3. Get Billing History
```
GET /api/billing-history
Response: BillingHistoryItem[]
```

### 4. Create Portal Session
```
POST /api/create-portal-session
Response: { url: string }
```

### 5. Cancel Subscription
```
POST /api/subscription/cancel
Response: SubscriptionData
```

### 6. Upgrade Plan
```
POST /api/subscription/upgrade
Body: { planId: string }
Response: SubscriptionData
```

### 7. Downgrade Plan
```
POST /api/subscription/downgrade
Body: { planId: string }
Response: SubscriptionData
```

### 8. Add Payment Method
```
POST /api/payment-methods/setup
Response: { setupUrl: string }
```

### 9. Remove Payment Method
```
DELETE /api/payment-methods/:id
Response: { success: boolean }
```

### 10. Set Default Payment Method
```
POST /api/payment-methods/default
Body: { paymentMethodId: string }
Response: { success: boolean }
```

## Type Definitions

### SubscriptionData
```typescript
interface SubscriptionData {
  id?: string;
  status: 'active' | 'cancelled' | 'past_due' | 'unpaid' | 'trialing';
  planId?: 'free' | 'growth' | 'pro';
  amount: number;
  nextBillingDate: string;
  endDate?: string;
  cancelAtPeriodEnd?: boolean;
}
```

### PaymentMethod
```typescript
interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'bank_account';
  brand?: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}
```

### BillingHistoryItem
```typescript
interface BillingHistoryItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  invoiceUrl?: string;
}
```

## Error Handling

The component gracefully handles missing API endpoints:

1. **404/501 Errors**: Shows friendly "Coming Soon" messages
2. **Network Errors**: Displays error toasts with retry options
3. **Validation Errors**: Shows inline error messages
4. **Loading States**: Displays skeleton loaders during data fetching

## Accessibility

- **Keyboard Navigation**: Full keyboard support for all interactive elements
- **Screen Readers**: Proper ARIA labels and semantic HTML
- **Focus Management**: Clear focus indicators
- **Color Contrast**: WCAG AA compliant color contrast ratios

## Performance Optimizations

1. **React Query Caching**: Automatic caching of subscription and payment data
2. **Lazy Loading**: Dialog content loaded on-demand
3. **Optimistic Updates**: Immediate UI feedback for user actions
4. **Debounced Actions**: Prevents rapid-fire API calls

## Customization

### Modifying Plans

Update the `plans` array in `BillingSettings.tsx`:

```typescript
const plans = [
  {
    id: 'custom',
    name: 'Custom Plan',
    price: 199,
    credits: 10000,
    features: ['Feature 1', 'Feature 2'],
    popular: true,
  },
];
```

### Styling

The component uses Tailwind CSS classes and can be customized via:
- Tailwind configuration
- Component-level class overrides
- CSS variables for dark mode

## Testing

### Unit Tests

```typescript
describe('BillingSettings', () => {
  it('should render subscription information', () => {
    // Test implementation
  });

  it('should handle plan upgrade', () => {
    // Test implementation
  });

  it('should handle subscription cancellation', () => {
    // Test implementation
  });
});
```

### Integration Tests

```typescript
describe('BillingSettings Integration', () => {
  it('should fetch and display subscription data', async () => {
    // Test implementation
  });

  it('should update payment method successfully', async () => {
    // Test implementation
  });
});
```

## Stripe Integration

### Setup Requirements

1. Stripe account configured
2. Stripe Customer Portal enabled
3. Webhook endpoints configured
4. API keys added to environment variables

### Portal Session Flow

1. User clicks "Manage via Stripe"
2. API creates portal session
3. User redirected to Stripe portal
4. Changes synced back to application

## Fallback Behavior

If Stripe integration is not yet implemented:
- Component shows placeholder UI
- "Coming Soon" messages for Stripe-dependent features
- Plan changes handled through application API
- Payment methods managed through application interface

## Future Enhancements

1. **Invoice Management**: Download/email invoices directly
2. **Usage Analytics**: Display credit usage trends
3. **Plan Comparison Tool**: Side-by-side plan comparison
4. **Promo Codes**: Apply discount codes
5. **Team Billing**: Multi-seat pricing
6. **Usage-Based Billing**: Pay-as-you-go options

## Requirements Satisfied

- **Requirement 11.2**: Settings component extraction
- **Requirement 11.3**: Isolated API calls and state management
- **Requirement 11.6**: Custom hooks for settings logic

## Related Components

- `ProfileSettings`: User profile management
- `SecuritySettings`: Security and authentication settings
- `IntegrationsSettings`: Third-party integrations
- `SettingsLayout`: Settings navigation wrapper

## Support

For issues or questions:
1. Check API endpoint responses
2. Verify Stripe configuration
3. Review browser console for errors
4. Check network tab for failed requests
