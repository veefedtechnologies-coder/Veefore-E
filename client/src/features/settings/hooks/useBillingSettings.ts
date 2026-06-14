/**
 * Billing Settings Hook
 * 
 * Manages subscription state, payment methods, billing history,
 * and API mutations for subscription management operations.
 * 
 * Requirements: 11.2, 11.3, 11.6
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/hooks/useUser';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type {
  SubscriptionData,
  PaymentMethod,
  BillingHistoryItem,
} from '../types/billing.types';

export const useBillingSettings = () => {
  const { userData } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Loading states for various operations
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);

  // Fetch subscription data
  const {
    data: subscriptionData,
    isLoading: isLoadingSubscription,
  } = useQuery<SubscriptionData>({
    queryKey: ['/api/subscription'],
    queryFn: async () => {
      try {
        const response = await apiRequest('/api/subscription');
        return response;
      } catch (error: any) {
        // If subscription endpoint doesn't exist yet, return mock data
        if (error.status === 404 || error.status === 501) {
          return {
            status: 'active',
            amount: userData?.plan === 'Growth' ? 29 : userData?.plan === 'Pro' ? 99 : 0,
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          };
        }
        throw error;
      }
    },
    enabled: !!userData,
  });

  // Fetch payment methods
  const {
    data: paymentMethods = [],
    isLoading: isLoadingPaymentMethods,
  } = useQuery<PaymentMethod[]>({
    queryKey: ['/api/payment-methods'],
    queryFn: async () => {
      try {
        const response = await apiRequest('/api/payment-methods');
        return response;
      } catch (error: any) {
        // If payment methods endpoint doesn't exist yet, return empty array
        if (error.status === 404 || error.status === 501) {
          return [];
        }
        throw error;
      }
    },
    enabled: !!userData,
  });

  // Fetch billing history
  const {
    data: billingHistory = [],
    isLoading: isLoadingBillingHistory,
  } = useQuery<BillingHistoryItem[]>({
    queryKey: ['/api/billing-history'],
    queryFn: async () => {
      try {
        const response = await apiRequest('/api/billing-history');
        return response;
      } catch (error: any) {
        // If billing history endpoint doesn't exist yet, return empty array
        if (error.status === 404 || error.status === 501) {
          return [];
        }
        throw error;
      }
    },
    enabled: !!userData,
  });

  // Open Stripe billing portal
  const handleOpenBillingPortal = useCallback(async () => {
    try {
      const response = await apiRequest('/api/create-portal-session', {
        method: 'POST',
      });

      if (response.url) {
        window.open(response.url, '_blank');
      } else {
        toast({
          title: 'Coming Soon',
          description: 'Stripe billing portal integration is in progress. You can manage your subscription directly through our interface for now.',
        });
      }
    } catch (error: any) {
      // If endpoint doesn't exist yet, show friendly message
      if (error.status === 404 || error.status === 501) {
        toast({
          title: 'Coming Soon',
          description: 'Stripe billing portal integration is in progress. You can manage your subscription directly through our interface for now.',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to open billing portal.',
          variant: 'destructive',
        });
      }
    }
  }, [toast]);

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/subscription/cancel', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription has been cancelled. You will have access until the end of your billing period.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel subscription.',
        variant: 'destructive',
      });
    },
  });

  // Upgrade plan mutation
  const upgradePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      return apiRequest('/api/subscription/upgrade', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: 'Plan Upgraded',
        description: 'Your plan has been upgraded successfully. Changes will take effect immediately.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upgrade plan.',
        variant: 'destructive',
      });
    },
  });

  // Downgrade plan mutation
  const downgradePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      return apiRequest('/api/subscription/downgrade', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: 'Plan Downgraded',
        description: 'Your plan will be downgraded at the end of your current billing period.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to downgrade plan.',
        variant: 'destructive',
      });
    },
  });

  // Add payment method mutation
  const addPaymentMethodMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/payment-methods/setup', {
        method: 'POST',
      });
    },
    onSuccess: (response) => {
      if (response.setupUrl) {
        window.open(response.setupUrl, '_blank');
      } else {
        toast({
          title: 'Coming Soon',
          description: 'Payment method management will be available through Stripe.',
        });
      }
    },
    onError: (error: any) => {
      if (error.status === 404 || error.status === 501) {
        toast({
          title: 'Coming Soon',
          description: 'Payment method management will be available through Stripe.',
        });
      } else {
        toast({
          title: 'Error',
          description: error.message || 'Failed to add payment method.',
          variant: 'destructive',
        });
      }
    },
  });

  // Remove payment method mutation
  const removePaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      return apiRequest(`/api/payment-methods/${paymentMethodId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-methods'] });
      toast({
        title: 'Payment Method Removed',
        description: 'The payment method has been removed successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove payment method.',
        variant: 'destructive',
      });
    },
  });

  // Set default payment method mutation
  const setDefaultPaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      return apiRequest('/api/payment-methods/default', {
        method: 'POST',
        body: JSON.stringify({ paymentMethodId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-methods'] });
      toast({
        title: 'Default Payment Method Updated',
        description: 'Your default payment method has been updated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to set default payment method.',
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleCancelSubscription = useCallback(async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You will have access until the end of your billing period.')) {
      return;
    }

    setIsCancelling(true);
    try {
      await cancelSubscriptionMutation.mutateAsync();
    } finally {
      setIsCancelling(false);
    }
  }, [cancelSubscriptionMutation]);

  const handleUpgradePlan = useCallback(async (planId: string) => {
    setIsUpgrading(true);
    try {
      await upgradePlanMutation.mutateAsync(planId);
    } finally {
      setIsUpgrading(false);
    }
  }, [upgradePlanMutation]);

  const handleDowngradePlan = useCallback(async (planId: string) => {
    if (!window.confirm('Your plan will be downgraded at the end of your current billing period. Continue?')) {
      return;
    }

    setIsDowngrading(true);
    try {
      await downgradePlanMutation.mutateAsync(planId);
    } finally {
      setIsDowngrading(false);
    }
  }, [downgradePlanMutation]);

  const handleAddPaymentMethod = useCallback(() => {
    addPaymentMethodMutation.mutate();
  }, [addPaymentMethodMutation]);

  const handleRemovePaymentMethod = useCallback((paymentMethodId: string) => {
    if (!window.confirm('Are you sure you want to remove this payment method?')) {
      return;
    }
    removePaymentMethodMutation.mutate(paymentMethodId);
  }, [removePaymentMethodMutation]);

  const handleSetDefaultPaymentMethod = useCallback((paymentMethodId: string) => {
    setDefaultPaymentMethodMutation.mutate(paymentMethodId);
  }, [setDefaultPaymentMethodMutation]);

  const handleDownloadInvoice = useCallback((invoiceUrl: string) => {
    window.open(invoiceUrl, '_blank');
  }, []);

  return {
    // User data
    userData,

    // Subscription data
    subscriptionData,
    isLoadingSubscription,

    // Payment methods
    paymentMethods,
    isLoadingPaymentMethods,

    // Billing history
    billingHistory,
    isLoadingBillingHistory,

    // Handlers
    handleOpenBillingPortal,
    handleCancelSubscription,
    handleUpgradePlan,
    handleDowngradePlan,
    handleAddPaymentMethod,
    handleRemovePaymentMethod,
    handleSetDefaultPaymentMethod,
    handleDownloadInvoice,

    // Loading states
    isCancelling,
    isUpgrading,
    isDowngrading,
  };
};
