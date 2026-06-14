# BillingSettings Usage Examples

## Basic Import and Usage

### Direct Import
```tsx
import { BillingSettings } from '@/features/settings/components/BillingSettings';

function SettingsPage() {
  return (
    <div className="container mx-auto p-6">
      <BillingSettings />
    </div>
  );
}
```

### Import from Index
```tsx
import { BillingSettings } from '@/features/settings';

function SettingsPage() {
  return <BillingSettings />;
}
```

## With Settings Layout

### Integrated with SettingsLayout
```tsx
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { BillingSettings } from '@/features/settings';

function SettingsPage() {
  return (
    <SettingsLayout activeTab="billing">
      <BillingSettings />
    </SettingsLayout>
  );
}
```

## Using the Hook Directly

### Custom Implementation with Hook
```tsx
import { useBillingSettings } from '@/features/settings';

function CustomBillingComponent() {
  const {
    subscriptionData,
    isLoadingSubscription,
    handleUpgradePlan,
    handleCancelSubscription,
  } = useBillingSettings();

  return (
    <div>
      <h1>Current Plan: {subscriptionData?.planId}</h1>
      <button onClick={() => handleUpgradePlan('pro')}>
        Upgrade to Pro
      </button>
      <button onClick={handleCancelSubscription}>
        Cancel Subscription
      </button>
    </div>
  );
}
```

## Type Usage

### Import Types
```tsx
import type { 
  SubscriptionData, 
  PaymentMethod, 
  BillingHistoryItem,
  PlanId,
  SubscriptionStatus 
} from '@/features/settings';

function processSubscription(data: SubscriptionData) {
  console.log('Plan:', data.planId);
  console.log('Status:', data.status);
  console.log('Next billing:', data.nextBillingDate);
}

function displayPaymentMethod(method: PaymentMethod) {
  return `${method.brand} •••• ${method.last4}`;
}
```

## React Router Integration

### With React Router v6
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SettingsLayout } from '@/features/settings/SettingsLayout';
import { BillingSettings } from '@/features/settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route path="billing" element={<BillingSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

## With Query Parameters

### Handle Return from Stripe Portal
```tsx
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BillingSettings } from '@/features/settings';
import { useToast } from '@/hooks/use-toast';

function BillingPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const success = searchParams.get('success');
    const cancelled = searchParams.get('cancelled');

    if (success === 'true') {
      toast({
        title: 'Payment Successful',
        description: 'Your subscription has been updated.',
      });
    } else if (cancelled === 'true') {
      toast({
        title: 'Payment Cancelled',
        description: 'Your subscription update was cancelled.',
      });
    }
  }, [searchParams, toast]);

  return <BillingSettings />;
}
```

## With Context Provider

### Subscription Context
```tsx
import { createContext, useContext } from 'react';
import { useBillingSettings } from '@/features/settings';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const billing = useBillingSettings();

  return (
    <SubscriptionContext.Provider value={billing}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

// Usage
function App() {
  return (
    <SubscriptionProvider>
      <BillingSettings />
    </SubscriptionProvider>
  );
}
```

## Testing Examples

### Component Test
```tsx
import { render, screen } from '@testing-library/react';
import { BillingSettings } from '@/features/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('BillingSettings', () => {
  it('should render subscription information', () => {
    const queryClient = new QueryClient();
    
    render(
      <QueryClientProvider client={queryClient}>
        <BillingSettings />
      </QueryClientProvider>
    );

    expect(screen.getByText('Billing & Subscription')).toBeInTheDocument();
  });
});
```

### Hook Test
```tsx
import { renderHook } from '@testing-library/react';
import { useBillingSettings } from '@/features/settings';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('useBillingSettings', () => {
  it('should fetch subscription data', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useBillingSettings(), { wrapper });

    expect(result.current.isLoadingSubscription).toBe(true);
  });
});
```

## Storybook Examples

### Component Stories
```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { BillingSettings } from '@/features/settings';

const meta: Meta<typeof BillingSettings> = {
  title: 'Settings/BillingSettings',
  component: BillingSettings,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof BillingSettings>;

export const Default: Story = {};

export const WithActivePlan: Story = {
  parameters: {
    mockData: {
      subscription: {
        status: 'active',
        planId: 'growth',
        amount: 29,
      },
    },
  },
};
```

## Advanced Usage

### Custom Plan Configuration
```tsx
import { BillingSettings } from '@/features/settings';

// Create custom wrapper with plan overrides
function CustomBillingSettings() {
  const customPlans = [
    {
      id: 'starter',
      name: 'Starter',
      price: 19,
      credits: 500,
      features: ['Feature 1', 'Feature 2'],
    },
    {
      id: 'business',
      name: 'Business',
      price: 49,
      credits: 2500,
      features: ['All Starter features', 'Feature 3', 'Feature 4'],
      popular: true,
    },
  ];

  // Note: Current implementation uses hardcoded plans
  // This would require passing plans as props if needed
  return <BillingSettings />;
}
```

### Integration with Analytics
```tsx
import { useEffect } from 'react';
import { BillingSettings, useBillingSettings } from '@/features/settings';

function BillingWithAnalytics() {
  const { subscriptionData } = useBillingSettings();

  useEffect(() => {
    if (subscriptionData) {
      // Track subscription view
      analytics.track('Billing Page Viewed', {
        plan: subscriptionData.planId,
        status: subscriptionData.status,
      });
    }
  }, [subscriptionData]);

  return <BillingSettings />;
}
```

## Error Boundary Integration

### With Error Boundary
```tsx
import { ErrorBoundary } from 'react-error-boundary';
import { BillingSettings } from '@/features/settings';

function ErrorFallback({ error }) {
  return (
    <div className="p-6 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">
        Billing Error
      </h2>
      <p className="text-gray-600">{error.message}</p>
      <button onClick={() => window.location.reload()}>
        Reload Page
      </button>
    </div>
  );
}

function BillingPage() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <BillingSettings />
    </ErrorBoundary>
  );
}
```

## Loading State Customization

### Custom Loading State
```tsx
import { useBillingSettings } from '@/features/settings';
import { Skeleton } from '@/components/ui/skeleton';

function BillingWithCustomLoading() {
  const { isLoadingSubscription } = useBillingSettings();

  if (isLoadingSubscription) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <BillingSettings />;
}
```

## Integration Notes

### Required Dependencies
```json
{
  "@tanstack/react-query": "^5.x",
  "lucide-react": "^0.x",
  "date-fns": "^3.x"
}
```

### Required Context Providers
```tsx
// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { BillingSettings } from '@/features/settings';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BillingSettings />
      </ToastProvider>
    </QueryClientProvider>
  );
}
```
