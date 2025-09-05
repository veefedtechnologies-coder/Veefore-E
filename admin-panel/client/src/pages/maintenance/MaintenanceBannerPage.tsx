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
  Edit, 
  Trash2, 
  Eye, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Info,
  AlertTriangle,
  Filter,
  Calendar,
  Users,
  Target
} from 'lucide-react';
import { apiClient as api } from '../../services/api';

interface MaintenanceBanner {
  _id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  priority: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  targetAudience: {
    type: 'all' | 'specific_roles' | 'specific_users';
    roles?: string[];
    userIds?: string[];
  };
  displayOptions: {
    showOnLogin: boolean;
    showOnDashboard: boolean;
    showOnAllPages: boolean;
    dismissible: boolean;
    autoHide: boolean;
    autoHideDelay?: number;
  };
  stats: {
    views: number;
    dismissals: number;
    clicks: number;
    lastViewedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

const MaintenanceBannerPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBanner, setSelectedBanner] = useState<MaintenanceBanner | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const queryClient = useQueryClient();

  // Fetch banners
  const { data: bannersData, isLoading: bannersLoading, refetch: refetchBanners } = useQuery({
    queryKey: ['maintenance-banners', searchTerm, typeFilter, priorityFilter, statusFilter],
    queryFn: () => api.get('/maintenance-banners', {
      params: { 
        search: searchTerm, 
        type: typeFilter, 
        priority: priorityFilter,
        isActive: statusFilter
      }
    }).then(res => res.data)
  });

  // Toggle banner status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/maintenance-banners/${id}/toggle`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-banners'] });
    }
  });

  // Delete banner mutation
  const deleteBannerMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance-banners/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-banners'] });
    }
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'info': return 'info';
      case 'warning': return 'warning';
      case 'error': return 'destructive';
      case 'success': return 'success';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'info': return <Info className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'error': return <XCircle className="h-4 w-4" />;
      case 'success': return <CheckCircle className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'default';
      case 'medium': return 'info';
      case 'high': return 'warning';
      case 'critical': return 'destructive';
      default: return 'default';
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'success' : 'default';
  };

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />;
  };

  if (bannersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const banners: MaintenanceBanner[] = bannersData?.data.banners || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Banners</h1>
          <p className="text-gray-600">Manage system announcements and maintenance notifications</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Create Banner</span>
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Input
            placeholder="Search banners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="success">Success</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          <Button
            variant="outline"
            onClick={() => refetchBanners()}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
        </div>
      </Card>

      {/* Banners Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Target Audience</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Statistics</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners.map((banner) => (
              <TableRow key={banner._id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-gray-900">{banner.title}</p>
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {banner.message}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    {getTypeIcon(banner.type)}
                    <Badge variant={getTypeColor(banner.type) as any}>
                      {banner.type}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getPriorityColor(banner.priority) as any}>
                    {banner.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    <Target className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600 capitalize">
                      {banner.targetAudience.type.replace('_', ' ')}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(banner.isActive)}
                    <Badge variant={getStatusColor(banner.isActive) as any}>
                      {banner.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p className="text-gray-900">
                      {banner.stats.views} views
                    </p>
                    <p className="text-gray-500">
                      {banner.stats.dismissals} dismissals
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-gray-500">
                    {banner.startDate ? (
                      <div>
                        <p>{new Date(banner.startDate).toLocaleDateString()}</p>
                        {banner.endDate && (
                          <p>to {new Date(banner.endDate).toLocaleDateString()}</p>
                        )}
                      </div>
                    ) : (
                      'No schedule'
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedBanner(banner);
                        setShowDetailsModal(true);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedBanner(banner);
                        setShowEditModal(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStatusMutation.mutate({
                        id: banner._id,
                        isActive: !banner.isActive
                      })}
                    >
                      {banner.isActive ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteBannerMutation.mutate(banner._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create Banner Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Maintenance Banner"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <Input placeholder="Banner title" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Banner message"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="success">Success</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Audience
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All Users</option>
              <option value="specific_roles">Specific Roles</option>
              <option value="specific_users">Specific Users</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <Input type="datetime-local" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <Input type="datetime-local" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Display Options
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="ml-2 text-sm">Show on login page</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="ml-2 text-sm">Show on dashboard</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="rounded" />
                <span className="ml-2 text-sm">Show on all pages</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="rounded" defaultChecked />
                <span className="ml-2 text-sm">Dismissible</span>
              </label>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button>Create Banner</Button>
          </div>
        </div>
      </Modal>

      {/* Banner Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Banner Details"
        size="lg"
      >
        {selectedBanner && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <p className="text-sm text-gray-900">{selectedBanner.title}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <div className="flex items-center space-x-2">
                  {getTypeIcon(selectedBanner.type)}
                  <Badge variant={getTypeColor(selectedBanner.type) as any}>
                    {selectedBanner.type}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <Badge variant={getPriorityColor(selectedBanner.priority) as any}>
                  {selectedBanner.priority}
                </Badge>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <div className="flex items-center space-x-2">
                  {getStatusIcon(selectedBanner.isActive)}
                  <Badge variant={getStatusColor(selectedBanner.isActive) as any}>
                    {selectedBanner.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Message</label>
              <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-md">
                {selectedBanner.message}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Target Audience</label>
              <p className="text-sm text-gray-900 capitalize">
                {selectedBanner.targetAudience.type.replace('_', ' ')}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Statistics</label>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{selectedBanner.stats.views}</p>
                  <p className="text-sm text-gray-500">Views</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{selectedBanner.stats.dismissals}</p>
                  <p className="text-sm text-gray-500">Dismissals</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{selectedBanner.stats.clicks}</p>
                  <p className="text-sm text-gray-500">Clicks</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MaintenanceBannerPage;
