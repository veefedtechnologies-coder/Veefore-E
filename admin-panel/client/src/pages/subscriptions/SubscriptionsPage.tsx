import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { apiClient as api } from '../../services/api';

interface Subscription {
  _id: string;
  userId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  planId: string;
  planName: string;
  pricing: {
    basePrice: number;
    currency: string;
    billingCycle: 'monthly' | 'yearly' | 'lifetime';
    region: string;
    regionMultiplier: number;
    finalPrice: number;
  };
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt?: string;
  endedAt?: string;
  features: {
    credits: {
      included: number;
      used: number;
      remaining: number;
      resetDate: string;
    };
    limits: {
      maxUsers?: number;
      maxProjects?: number;
      maxStorage?: number;
      apiCallsPerMonth?: number;
      customDomains?: number;
    };
    addons: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
      billingCycle: 'monthly' | 'yearly' | 'one_time';
    }>;
  };
  billing: {
    paymentMethod: {
      type: 'card' | 'bank_transfer' | 'wallet' | 'crypto';
      last4?: string;
      brand?: string;
      expiryMonth?: number;
      expiryYear?: number;
    };
    nextBillingDate: string;
    billingAddress: {
      country: string;
      state?: string;
      city: string;
      postalCode: string;
      line1: string;
      line2?: string;
    };
    taxRate: number;
    taxAmount: number;
  };
  discounts: Array<{
    couponId: string;
    couponCode: string;
    type: 'percentage' | 'fixed' | 'free_trial';
    value: number;
    appliedAt: string;
    expiresAt?: string;
  }>;
  usage: {
    creditsUsed: number;
    apiCalls: number;
    storageUsed: number;
    lastResetDate: string;
    nextResetDate: string;
  };
  changes: Array<{
    fromPlan: string;
    toPlan: string;
    reason: string;
    changedAt: string;
    changedBy: string;
    prorationAmount?: number;
  }>;
  metadata: {
    source: 'web' | 'api' | 'admin' | 'migration';
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    notes?: string;
  };
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  daysUntilRenewal?: number;
  totalAddonCost?: number;
}

interface SubscriptionStats {
  overview: {
    totalSubscriptions: number;
    activeSubscriptions: number;
    trialSubscriptions: number;
    canceledSubscriptions: number;
    totalRevenue: number;
    avgRevenue: number;
    totalAddonRevenue: number;
  };
  planBreakdown: Array<{
    _id: string;
    count: number;
    totalRevenue: number;
    avgRevenue: number;
  }>;
  regionBreakdown: Array<{
    _id: string;
    count: number;
    totalRevenue: number;
    avgRevenue: number;
  }>;
}

const SubscriptionsPage: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [billingCycleFilter, setBillingCycleFilter] = useState('');
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'coupons'>('subscriptions');
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0
  });

  useEffect(() => {
    fetchSubscriptions();
    fetchStats();
  }, [pagination.current, searchTerm, statusFilter, planFilter, regionFilter, billingCycleFilter]);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.current.toString(),
        limit: '10',
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      if (searchTerm) params.append('q', searchTerm);
      if (statusFilter) params.append('status', statusFilter);
      if (planFilter) params.append('plan', planFilter);
      if (regionFilter) params.append('region', regionFilter);
      if (billingCycleFilter) params.append('billingCycle', billingCycleFilter);

      const response = await api.get(`/subscriptions?${params}`);
      setSubscriptions(response.data.data.subscriptions);
      setPagination(response.data.data.pagination);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/subscriptions/stats?period=30d');
      setStats(response.data.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchSubscriptions();
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, current: page }));
  };

  const handleSubscriptionClick = (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setShowDetailModal(true);
  };

  const handleCancel = async (subscriptionId: string) => {
    try {
      await api.post(`/subscriptions/${subscriptionId}/cancel`, { 
        reason: 'Admin cancellation',
        immediate: false 
      });
      fetchSubscriptions();
    } catch (error) {
      console.error('Error canceling subscription:', error);
    }
  };

  const handleReactivate = async (subscriptionId: string) => {
    try {
      await api.post(`/subscriptions/${subscriptionId}/reactivate`, { 
        reason: 'Admin reactivation' 
      });
      fetchSubscriptions();
    } catch (error) {
      console.error('Error reactivating subscription:', error);
    }
  };

  const handleSelectSubscription = (subscriptionId: string) => {
    setSelectedSubscriptions(prev => 
      prev.includes(subscriptionId) 
        ? prev.filter(id => id !== subscriptionId)
        : [...prev, subscriptionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedSubscriptions.length === subscriptions.length) {
      setSelectedSubscriptions([]);
    } else {
      setSelectedSubscriptions(subscriptions.map(subscription => subscription._id));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedSubscriptions.length === 0) return;

    try {
      await api.post('/subscriptions/bulk', {
        subscriptionIds: selectedSubscriptions,
        operation: action
      });
      setSelectedSubscriptions([]);
      fetchSubscriptions();
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      trialing: 'bg-blue-100 text-blue-800',
      past_due: 'bg-yellow-100 text-yellow-800',
      canceled: 'bg-red-100 text-red-800',
      unpaid: 'bg-orange-100 text-orange-800',
      paused: 'bg-gray-100 text-gray-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Management</h1>
          <p className="text-gray-600">Manage user subscriptions, billing, and coupons</p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant={activeTab === 'subscriptions' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('subscriptions')}
          >
            Subscriptions
          </Button>
          <Button
            variant={activeTab === 'coupons' ? 'primary' : 'outline'}
            onClick={() => setActiveTab('coupons')}
          >
            Coupons
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            Create {activeTab === 'subscriptions' ? 'Subscription' : 'Coupon'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && activeTab === 'subscriptions' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Subscriptions</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.totalSubscriptions}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.activeSubscriptions}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Trials</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.trialSubscriptions}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(stats.overview.totalRevenue)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <Input
                placeholder="Search subscriptions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="past_due">Past Due</option>
                <option value="canceled">Canceled</option>
                <option value="unpaid">Unpaid</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Plan</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
              >
                <option value="">All Plans</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Region</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
              >
                <option value="">All Regions</option>
                <option value="US">US</option>
                <option value="EU">EU</option>
                <option value="UK">UK</option>
                <option value="CA">Canada</option>
                <option value="AU">Australia</option>
                <option value="IN">India</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Billing</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={billingCycleFilter}
                onChange={(e) => setBillingCycleFilter(e.target.value)}
              >
                <option value="">All Cycles</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} className="w-full">
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Bulk Actions */}
      {selectedSubscriptions.length > 0 && (
        <Card>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-800">
                {selectedSubscriptions.length} subscription(s) selected
              </span>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('cancel')}
                >
                  Cancel Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('pause')}
                >
                  Pause Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('resume')}
                >
                  Resume Selected
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Subscriptions Table */}
      {activeTab === 'subscriptions' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedSubscriptions.length === subscriptions.length && subscriptions.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pricing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Billing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {subscriptions.map((subscription) => (
                  <tr key={subscription._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedSubscriptions.includes(subscription._id)}
                        onChange={() => handleSelectSubscription(subscription._id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {subscription.userId.firstName} {subscription.userId.lastName}
                        </div>
                        <div className="text-sm text-gray-500">{subscription.userId.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{subscription.planName}</div>
                        <div className="text-xs text-gray-500 capitalize">
                          {subscription.pricing.billingCycle} • {subscription.pricing.region}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(subscription.status)}`}>
                        {subscription.status}
                      </span>
                      {subscription.trialEndsAt && (
                        <div className="text-xs text-gray-500 mt-1">
                          Trial ends: {formatDate(subscription.trialEndsAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(subscription.pricing.finalPrice, subscription.pricing.currency)}
                      </div>
                      <div className="text-xs text-gray-500">
                        Base: {formatCurrency(subscription.pricing.basePrice, subscription.pricing.currency)}
                      </div>
                      {subscription.discounts.length > 0 && (
                        <div className="text-xs text-green-600">
                          {subscription.discounts.length} discount(s) applied
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>Credits: {subscription.features.credits.used}/{subscription.features.credits.included}</div>
                      <div>API: {subscription.usage.apiCalls}</div>
                      <div>Storage: {subscription.usage.storageUsed.toFixed(2)}GB</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{formatDate(subscription.billing.nextBillingDate)}</div>
                      <div className="text-xs text-gray-400">
                        {subscription.daysUntilRenewal} days left
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSubscriptionClick(subscription)}
                        >
                          View
                        </Button>
                        {subscription.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancel(subscription._id)}
                          >
                            Cancel
                          </Button>
                        )}
                        {subscription.status === 'canceled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReactivate(subscription._id)}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                <Button
                  onClick={() => handlePageChange(pagination.current - 1)}
                  disabled={pagination.current === 1}
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  onClick={() => handlePageChange(pagination.current + 1)}
                  disabled={pagination.current === pagination.pages}
                  variant="outline"
                >
                  Next
                </Button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing{' '}
                    <span className="font-medium">
                      {(pagination.current - 1) * 10 + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium">
                      {Math.min(pagination.current * 10, pagination.total)}
                    </span>{' '}
                    of{' '}
                    <span className="font-medium">{pagination.total}</span>{' '}
                    results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        variant={page === pagination.current ? "primary" : "outline"}
                        size="sm"
                        className="ml-0 rounded-none first:rounded-l-md last:rounded-r-md"
                      >
                        {page}
                      </Button>
                    ))}
                  </nav>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Coupons Tab - Placeholder */}
      {activeTab === 'coupons' && (
        <Card>
          <div className="p-6">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Coupon Management</h3>
              <p className="text-gray-500">Coupon management functionality will be implemented here</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SubscriptionsPage;
