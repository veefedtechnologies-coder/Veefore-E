import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { apiClient as api } from '../../services/api';

interface Popup {
  _id: string;
  title: string;
  content: string;
  type: 'modal' | 'banner' | 'toast' | 'slide_in' | 'fullscreen';
  position: 'top' | 'bottom' | 'center' | 'left' | 'right';
  displayRules: {
    pages: string[];
    userSegments: string[];
    userRoles: string[];
    devices: ('desktop' | 'mobile' | 'tablet')[];
    browsers: string[];
    countries: string[];
    languages: string[];
  };
  scheduling: {
    startDate?: string;
    endDate?: string;
    timezone: string;
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    maxDisplays: number;
    cooldown: number;
  };
  abTest: {
    enabled: boolean;
    variants: Array<{
      id: string;
      name: string;
      content: string;
      weight: number;
    }>;
    winner?: string;
  };
  design: {
    backgroundColor: string;
    textColor: string;
    borderColor?: string;
    borderRadius: number;
    padding: number;
    fontSize: number;
    fontFamily: string;
    customCSS?: string;
  };
  actions: Array<{
    type: 'button' | 'link' | 'close';
    label: string;
    action: string;
    url?: string;
    style: 'primary' | 'secondary' | 'danger' | 'success';
  }>;
  status: 'draft' | 'active' | 'paused' | 'archived';
  isActive: boolean;
  analytics: {
    impressions: number;
    clicks: number;
    conversions: number;
    dismissals: number;
    clickRate: number;
    conversionRate: number;
  };
  advanced: {
    triggerDelay: number;
    exitIntent: boolean;
    scrollTrigger: number;
    timeOnPage: number;
    customTrigger?: string;
  };
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
}

interface PopupStats {
  overview: {
    totalPopups: number;
    activePopups: number;
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    totalDismissals: number;
    avgClickRate: number;
    avgConversionRate: number;
  };
  typeBreakdown: Array<{
    _id: string;
    count: number;
    avgClickRate: number;
    avgConversionRate: number;
  }>;
  statusBreakdown: Array<{
    _id: string;
    count: number;
    totalImpressions: number;
    totalClicks: number;
  }>;
}

const PopupsPage: React.FC = () => {
  const [popups, setPopups] = useState<Popup[]>([]);
  const [stats, setStats] = useState<PopupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [selectedPopups, setSelectedPopups] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPopup, setSelectedPopup] = useState<Popup | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0
  });

  useEffect(() => {
    fetchPopups();
    fetchStats();
  }, [pagination.current, searchTerm, statusFilter, typeFilter, isActiveFilter]);

  const fetchPopups = async () => {
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
      if (typeFilter) params.append('type', typeFilter);
      if (isActiveFilter) params.append('isActive', isActiveFilter);

      const response = await api.get(`/popups?${params}`);
      setPopups(response.data.data.popups);
      setPagination(response.data.data.pagination);
    } catch (error) {
      console.error('Error fetching popups:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/popups/stats?period=30d');
      setStats(response.data.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchPopups();
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, current: page }));
  };

  const handlePopupClick = (popup: Popup) => {
    setSelectedPopup(popup);
    setShowDetailModal(true);
  };

  const handleActivate = async (popupId: string) => {
    try {
      await api.post(`/popups/${popupId}/activate`);
      fetchPopups();
    } catch (error) {
      console.error('Error activating popup:', error);
    }
  };

  const handlePause = async (popupId: string) => {
    try {
      await api.post(`/popups/${popupId}/pause`);
      fetchPopups();
    } catch (error) {
      console.error('Error pausing popup:', error);
    }
  };

  const handleArchive = async (popupId: string) => {
    try {
      await api.post(`/popups/${popupId}/archive`);
      fetchPopups();
    } catch (error) {
      console.error('Error archiving popup:', error);
    }
  };

  const handleDelete = async (popupId: string) => {
    try {
      await api.delete(`/popups/${popupId}`);
      fetchPopups();
    } catch (error) {
      console.error('Error deleting popup:', error);
    }
  };

  const handleSelectPopup = (popupId: string) => {
    setSelectedPopups(prev => 
      prev.includes(popupId) 
        ? prev.filter(id => id !== popupId)
        : [...prev, popupId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPopups.length === popups.length) {
      setSelectedPopups([]);
    } else {
      setSelectedPopups(popups.map(popup => popup._id));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedPopups.length === 0) return;

    try {
      await api.post('/popups/bulk', {
        popupIds: selectedPopups,
        operation: action
      });
      setSelectedPopups([]);
      fetchPopups();
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
      paused: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-gray-100 text-gray-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getTypeColor = (type: string) => {
    const colors = {
      modal: 'bg-blue-100 text-blue-800',
      banner: 'bg-green-100 text-green-800',
      toast: 'bg-yellow-100 text-yellow-800',
      slide_in: 'bg-purple-100 text-purple-800',
      fullscreen: 'bg-red-100 text-red-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
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
          <h1 className="text-2xl font-bold text-gray-900">Popup Management</h1>
          <p className="text-gray-600">Create and manage popups with A/B testing and advanced targeting</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          Create Popup
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 1 0-15 0v5h5l-5 5-5-5h5v-5a10 10 0 1 1 20 0v5z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Popups</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.totalPopups}</p>
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
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.activePopups}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Impressions</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.overview.totalImpressions}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Click Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stats.overview.avgClickRate.toFixed(1)}%
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <Input
                placeholder="Search popups..."
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
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="modal">Modal</option>
                <option value="banner">Banner</option>
                <option value="toast">Toast</option>
                <option value="slide_in">Slide In</option>
                <option value="fullscreen">Fullscreen</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Active</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={isActiveFilter}
                onChange={(e) => setIsActiveFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
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
      {selectedPopups.length > 0 && (
        <Card>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-800">
                {selectedPopups.length} popup(s) selected
              </span>
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('activate')}
                >
                  Activate Selected
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
                  onClick={() => handleBulkAction('archive')}
                >
                  Archive Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkAction('delete')}
                >
                  Delete Selected
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Popups Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedPopups.length === popups.length && popups.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  A/B Test
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Analytics
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scheduling
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {popups.map((popup) => (
                <tr key={popup._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedPopups.includes(popup._id)}
                      onChange={() => handleSelectPopup(popup._id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{popup.title}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">{popup.content}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getTypeColor(popup.type)}`}>
                      {popup.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(popup.status)}`}>
                        {popup.status}
                      </span>
                      {popup.isActive && (
                        <div className="ml-2 w-2 h-2 bg-green-400 rounded-full"></div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {popup.abTest.enabled ? (
                      <div className="text-sm text-gray-900">
                        <div className="font-medium">Enabled</div>
                        <div className="text-xs text-gray-500">
                          {popup.abTest.variants.length} variants
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Disabled</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>Impressions: {popup.analytics.impressions}</div>
                    <div>Clicks: {popup.analytics.clicks}</div>
                    <div>Rate: {popup.analytics.clickRate.toFixed(1)}%</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {popup.scheduling.startDate ? (
                      <div>
                        <div>Start: {formatDate(popup.scheduling.startDate)}</div>
                        {popup.scheduling.endDate && (
                          <div>End: {formatDate(popup.scheduling.endDate)}</div>
                        )}
                      </div>
                    ) : (
                      <span>No schedule</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(popup.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePopupClick(popup)}
                      >
                        View
                      </Button>
                      {popup.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleActivate(popup._id)}
                        >
                          Activate
                        </Button>
                      )}
                      {popup.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePause(popup._id)}
                        >
                          Pause
                        </Button>
                      )}
                      {popup.status === 'paused' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleActivate(popup._id)}
                        >
                          Resume
                        </Button>
                      )}
                      {popup.status !== 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(popup._id)}
                        >
                          Delete
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

      {/* Popup Detail Modal */}
      {showDetailModal && selectedPopup && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Popup Details - {selectedPopup.title}
                </h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Basic Information</h4>
                  <div className="space-y-2">
                    <div><strong>Title:</strong> {selectedPopup.title}</div>
                    <div><strong>Content:</strong> {selectedPopup.content}</div>
                    <div><strong>Type:</strong> <span className={`px-2 py-1 text-xs rounded-full ${getTypeColor(selectedPopup.type)}`}>{selectedPopup.type}</span></div>
                    <div><strong>Position:</strong> {selectedPopup.position}</div>
                    <div><strong>Status:</strong> <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedPopup.status)}`}>{selectedPopup.status}</span></div>
                    <div><strong>Active:</strong> {selectedPopup.isActive ? 'Yes' : 'No'}</div>
                    <div><strong>Created:</strong> {formatDate(selectedPopup.createdAt)}</div>
                  </div>
                </div>

                {/* Display Rules */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Display Rules</h4>
                  <div className="space-y-2">
                    <div><strong>Pages:</strong> {selectedPopup.displayRules.pages.join(', ') || 'All'}</div>
                    <div><strong>User Segments:</strong> {selectedPopup.displayRules.userSegments.join(', ') || 'All'}</div>
                    <div><strong>User Roles:</strong> {selectedPopup.displayRules.userRoles.join(', ') || 'All'}</div>
                    <div><strong>Devices:</strong> {selectedPopup.displayRules.devices.join(', ')}</div>
                    <div><strong>Browsers:</strong> {selectedPopup.displayRules.browsers.join(', ') || 'All'}</div>
                    <div><strong>Countries:</strong> {selectedPopup.displayRules.countries.join(', ') || 'All'}</div>
                    <div><strong>Languages:</strong> {selectedPopup.displayRules.languages.join(', ') || 'All'}</div>
                  </div>
                </div>

                {/* Scheduling */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Scheduling</h4>
                  <div className="space-y-2">
                    <div><strong>Start Date:</strong> {selectedPopup.scheduling.startDate ? formatDate(selectedPopup.scheduling.startDate) : 'Immediate'}</div>
                    <div><strong>End Date:</strong> {selectedPopup.scheduling.endDate ? formatDate(selectedPopup.scheduling.endDate) : 'No end date'}</div>
                    <div><strong>Frequency:</strong> {selectedPopup.scheduling.frequency}</div>
                    <div><strong>Max Displays:</strong> {selectedPopup.scheduling.maxDisplays}</div>
                    <div><strong>Cooldown:</strong> {selectedPopup.scheduling.cooldown} hours</div>
                    <div><strong>Timezone:</strong> {selectedPopup.scheduling.timezone}</div>
                  </div>
                </div>

                {/* Analytics */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Analytics</h4>
                  <div className="space-y-2">
                    <div><strong>Impressions:</strong> {selectedPopup.analytics.impressions}</div>
                    <div><strong>Clicks:</strong> {selectedPopup.analytics.clicks}</div>
                    <div><strong>Conversions:</strong> {selectedPopup.analytics.conversions}</div>
                    <div><strong>Dismissals:</strong> {selectedPopup.analytics.dismissals}</div>
                    <div><strong>Click Rate:</strong> {selectedPopup.analytics.clickRate.toFixed(1)}%</div>
                    <div><strong>Conversion Rate:</strong> {selectedPopup.analytics.conversionRate.toFixed(1)}%</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 mt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowDetailModal(false)}
                >
                  Close
                </Button>
                {selectedPopup.status === 'draft' && (
                  <Button
                    onClick={() => {
                      handleActivate(selectedPopup._id);
                      setShowDetailModal(false);
                    }}
                  >
                    Activate
                  </Button>
                )}
                {selectedPopup.status === 'active' && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      handlePause(selectedPopup._id);
                      setShowDetailModal(false);
                    }}
                  >
                    Pause
                  </Button>
                )}
                {selectedPopup.status === 'paused' && (
                  <Button
                    onClick={() => {
                      handleActivate(selectedPopup._id);
                      setShowDetailModal(false);
                    }}
                  >
                    Resume
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PopupsPage;
