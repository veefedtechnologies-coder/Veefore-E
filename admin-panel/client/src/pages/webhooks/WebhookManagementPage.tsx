import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { 
  Plus, 
  Search, 
  Settings, 
  Play, 
  Pause, 
  Trash2, 
  Eye, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink,
  Filter,
  MoreVertical
} from 'lucide-react';
import { apiClient as api } from '../../services/api';

interface Webhook {
  _id: string;
  name: string;
  description?: string;
  url: string;
  events: string[];
  isActive: boolean;
  status: 'active' | 'inactive' | 'error' | 'testing';
  authType: 'none' | 'basic' | 'bearer' | 'custom';
  stats: {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    lastDeliveryAt?: string;
    averageResponseTime: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface WebhookDelivery {
  _id: string;
  event: string;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  attempts: number;
  maxAttempts: number;
  response: {
    statusCode: number;
    responseTime: number;
  };
  error?: {
    message: string;
  };
  createdAt: string;
  deliveredAt?: string;
}

const WebhookManagementPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeliveriesModal, setShowDeliveriesModal] = useState(false);

  const queryClient = useQueryClient();

  // Fetch webhooks
  const { data: webhooksData, isLoading: webhooksLoading, refetch: refetchWebhooks } = useQuery({
    queryKey: ['webhooks', searchTerm, statusFilter, eventFilter],
    queryFn: () => api.get('/webhooks', {
      params: { search: searchTerm, status: statusFilter, event: eventFilter }
    }).then(res => res.data)
  });

  // Fetch webhook deliveries
  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['webhook-deliveries', selectedWebhook?._id],
    queryFn: () => api.get(`/webhooks/${selectedWebhook?._id}/deliveries`).then(res => res.data),
    enabled: !!selectedWebhook
  });

  // Toggle webhook status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/webhooks/${id}/toggle`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    }
  });

  // Test webhook mutation
  const testWebhookMutation = useMutation({
    mutationFn: (id: string) => api.post(`/webhooks/${id}/test`),
    onSuccess: (data) => {
      // Show test results
      console.log('Test result:', data.data);
    }
  });

  // Delete webhook mutation
  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'error': return 'destructive';
      case 'testing': return 'warning';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle className="h-4 w-4" />;
      case 'inactive': return <Pause className="h-4 w-4" />;
      case 'error': return <XCircle className="h-4 w-4" />;
      case 'testing': return <Clock className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getDeliveryStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'success';
      case 'failed': return 'destructive';
      case 'pending': return 'warning';
      case 'retrying': return 'info';
      default: return 'default';
    }
  };

  if (webhooksLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const webhooks: Webhook[] = webhooksData?.data.webhooks || [];
  const deliveries: WebhookDelivery[] = deliveriesData?.data.deliveries || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhook Management</h1>
          <p className="text-gray-600">Manage webhook endpoints and monitor deliveries</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Create Webhook</span>
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Input
            placeholder="Search webhooks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="error">Error</option>
            <option value="testing">Testing</option>
          </select>

          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Events</option>
            <option value="user.created">User Created</option>
            <option value="user.updated">User Updated</option>
            <option value="payment.completed">Payment Completed</option>
            <option value="subscription.created">Subscription Created</option>
          </select>

          <Button
            variant="outline"
            onClick={() => refetchWebhooks()}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </Card>

      {/* Webhooks Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Statistics</TableHead>
              <TableHead>Last Delivery</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooks.map((webhook) => (
              <TableRow key={webhook._id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-gray-900">{webhook.name}</p>
                    {webhook.description && (
                      <p className="text-sm text-gray-500">{webhook.description}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600 truncate max-w-xs">
                      {webhook.url}
                    </span>
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {webhook.events.slice(0, 2).map((event) => (
                      <Badge key={event} variant="info" size="sm">
                        {event}
                      </Badge>
                    ))}
                    {webhook.events.length > 2 && (
                      <Badge variant="default" size="sm">
                        +{webhook.events.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(webhook.status)}
                    <Badge variant={getStatusColor(webhook.status) as any}>
                      {webhook.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p className="text-gray-900">
                      {webhook.stats.successfulDeliveries}/{webhook.stats.totalDeliveries}
                    </p>
                    <p className="text-gray-500">
                      {webhook.stats.averageResponseTime}ms avg
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-gray-500">
                    {webhook.stats.lastDeliveryAt
                      ? new Date(webhook.stats.lastDeliveryAt).toLocaleDateString()
                      : 'Never'
                    }
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedWebhook(webhook);
                        setShowDetailsModal(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testWebhookMutation.mutate(webhook._id)}
                      disabled={testWebhookMutation.isPending}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStatusMutation.mutate({
                        id: webhook._id,
                        isActive: !webhook.isActive
                      })}
                    >
                      {webhook.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedWebhook(webhook);
                        setShowDeliveriesModal(true);
                      }}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create Webhook Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Webhook"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <Input placeholder="Webhook name" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL
            </label>
            <Input placeholder="https://example.com/webhook" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Events
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input type="checkbox" className="rounded" />
                <span className="ml-2 text-sm">User Created</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="rounded" />
                <span className="ml-2 text-sm">User Updated</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="rounded" />
                <span className="ml-2 text-sm">Payment Completed</span>
              </label>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button>Create Webhook</Button>
          </div>
        </div>
      </Modal>

      {/* Webhook Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Webhook Details"
        size="lg"
      >
        {selectedWebhook && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <p className="text-sm text-gray-900">{selectedWebhook.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <Badge variant={getStatusColor(selectedWebhook.status) as any}>
                  {selectedWebhook.status}
                </Badge>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">URL</label>
                <p className="text-sm text-gray-900 break-all">{selectedWebhook.url}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Auth Type</label>
                <p className="text-sm text-gray-900 capitalize">{selectedWebhook.authType}</p>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Events</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {selectedWebhook.events.map((event) => (
                  <Badge key={event} variant="info" size="sm">
                    {event}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Statistics</label>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{selectedWebhook.stats.totalDeliveries}</p>
                  <p className="text-sm text-gray-500">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{selectedWebhook.stats.successfulDeliveries}</p>
                  <p className="text-sm text-gray-500">Success</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{selectedWebhook.stats.failedDeliveries}</p>
                  <p className="text-sm text-gray-500">Failed</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Deliveries Modal */}
      <Modal
        isOpen={showDeliveriesModal}
        onClose={() => setShowDeliveriesModal(false)}
        title="Webhook Deliveries"
        size="xl"
      >
        {deliveriesLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery._id}>
                    <TableCell>
                      <Badge variant="info" size="sm">
                        {delivery.event}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getDeliveryStatusColor(delivery.status) as any}>
                        {delivery.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {delivery.attempts}/{delivery.maxAttempts}
                    </TableCell>
                    <TableCell>
                      {delivery.response ? (
                        <div className="text-sm">
                          <p className="text-gray-900">{delivery.response.statusCode}</p>
                          <p className="text-gray-500">{delivery.response.responseTime}ms</p>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {delivery.deliveredAt
                        ? new Date(delivery.deliveredAt).toLocaleString()
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      {new Date(delivery.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default WebhookManagementPage;
