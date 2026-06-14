/**
 * Billing Settings Component
 * 
 * Handles subscription management including plan upgrades/downgrades,
 * cancellation, payment method management, and billing history.
 * 
 * Requirements: 11.2, 11.3, 11.6
 */

import { 
  CreditCard, 
  Loader2, 
  ArrowRightLeft, 
  Crown, 
  Check,
  Calendar,
  DollarSign,
  Download,
  Trash2,
  Plus,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useBillingSettings } from '../hooks/useBillingSettings';

export function BillingSettings() {
  const {
    userData,
    isLoadingSubscription,
    isLoadingPaymentMethods,
    isLoadingBillingHistory,
    subscriptionData,
    paymentMethods,
    billingHistory,
    handleOpenBillingPortal,
    handleCancelSubscription,
    handleUpgradePlan,
    handleDowngradePlan,
    handleAddPaymentMethod,
    handleRemovePaymentMethod,
    handleSetDefaultPaymentMethod,
    handleDownloadInvoice,
    isCancelling,
    isUpgrading,
    isDowngrading,
  } = useBillingSettings();

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      credits: 100,
      features: [
        '100 AI credits/month',
        'Basic video generation',
        'Standard templates',
        'Community support',
      ],
    },
    {
      id: 'growth',
      name: 'Growth',
      price: 29,
      credits: 1000,
      features: [
        '1,000 AI credits/month',
        'Advanced video generation',
        'Premium templates',
        'Priority support',
        'Instagram integration',
        'Analytics dashboard',
      ],
      popular: true,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 99,
      credits: 5000,
      features: [
        '5,000 AI credits/month',
        'Unlimited video generation',
        'All templates & styles',
        '24/7 dedicated support',
        'All integrations',
        'Advanced analytics',
        'API access',
        'Team collaboration',
      ],
    },
  ];

  const currentPlanId = userData?.plan?.toLowerCase() || 'free';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Billing & Subscription
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your plan, payment methods, and billing history
        </p>
      </div>

      {/* Current Subscription */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Current Subscription
          </h3>
          <Button
            variant="outline"
            onClick={handleOpenBillingPortal}
            className="gap-2"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Manage via Stripe
          </Button>
        </div>

        {isLoadingSubscription ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <Crown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Current Plan
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {userData?.plan || 'Free'}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Monthly Cost
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${subscriptionData?.amount || 0}/mo
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-700">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Next Billing
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {subscriptionData?.nextBillingDate || 'N/A'}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {subscriptionData?.status === 'active' && (
          <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
            <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Your subscription is active and will renew automatically on{' '}
              <span className="font-medium">{subscriptionData.nextBillingDate}</span>
            </p>
          </div>
        )}

        {subscriptionData?.status === 'cancelled' && (
          <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Your subscription has been cancelled and will end on{' '}
              <span className="font-medium">{subscriptionData.endDate}</span>
            </p>
          </div>
        )}
      </div>

      {/* Available Plans */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Available Plans
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = currentPlanId === plan.id;
            const canUpgrade = plan.price > (plans.find(p => p.id === currentPlanId)?.price || 0);
            const canDowngrade = plan.price < (plans.find(p => p.id === currentPlanId)?.price || 0) && plan.price > 0;

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  isCurrent
                    ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20'
                    : plan.popular
                    ? 'border-purple-500 dark:border-purple-400'
                    : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0">
                      Most Popular
                    </Badge>
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white border-0">
                      Current Plan
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">
                      ${plan.price}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">/month</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    {plan.credits.toLocaleString()} AI credits/month
                  </p>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4">
                    {isCurrent ? (
                      currentPlanId !== 'free' && (
                        <Button
                          variant="outline"
                          onClick={handleCancelSubscription}
                          disabled={isCancelling}
                          className="w-full"
                        >
                          {isCancelling ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Cancel Subscription'
                          )}
                        </Button>
                      )
                    ) : canUpgrade ? (
                      <Button
                        onClick={() => handleUpgradePlan(plan.id)}
                        disabled={isUpgrading}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        {isUpgrading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Upgrade Plan'
                        )}
                      </Button>
                    ) : canDowngrade ? (
                      <Button
                        variant="outline"
                        onClick={() => handleDowngradePlan(plan.id)}
                        disabled={isDowngrading}
                        className="w-full"
                      >
                        {isDowngrading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Downgrade Plan'
                        )}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Payment Methods
          </h3>
          <Button
            variant="outline"
            onClick={handleAddPaymentMethod}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Card
          </Button>
        </div>

        {isLoadingPaymentMethods ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="text-center py-8">
            <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              No payment methods added yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      •••• •••• •••• {method.last4}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Expires {method.expMonth}/{method.expYear}
                    </div>
                  </div>
                  {method.isDefault && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!method.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefaultPaymentMethod(method.id)}
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemovePaymentMethod(method.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing History */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Billing History
        </h3>

        {isLoadingBillingHistory ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : billingHistory.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              No billing history available
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Date
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Description
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Amount
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    Invoice
                  </th>
                </tr>
              </thead>
              <tbody>
                {billingHistory.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <td className="py-4 px-4 text-sm text-gray-900 dark:text-white">
                      {invoice.date}
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {invoice.description}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-gray-900 dark:text-white">
                      ${invoice.amount.toFixed(2)}
                    </td>
                    <td className="py-4 px-4">
                      <Badge
                        className={
                          invoice.status === 'paid'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : invoice.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-right">
                      {invoice.invoiceUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadInvoice(invoice.invoiceUrl)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stripe Portal Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              For advanced billing management including updating payment details,
              viewing detailed invoices, and managing subscriptions, you can access
              the secure Stripe Customer Portal.
            </p>
            <Button
              variant="link"
              onClick={handleOpenBillingPortal}
              className="px-0 h-auto mt-2 text-blue-600 dark:text-blue-400"
            >
              Open Stripe Billing Portal →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
