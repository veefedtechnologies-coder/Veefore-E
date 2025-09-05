import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { apiClient as api } from '../../services/api';

interface MaintenanceRecord {
  _id: string;
  isActive: boolean;
  title: string;
  message: string;
  description?: string;
  scheduledStart: string;
  scheduledEnd: string;
  estimatedDuration: number;
  timezone: string;
  type: 'scheduled' | 'emergency' | 'update' | 'migration' | 'security';
  priority: 'low' | 'medium' | 'high' | 'critical';
  affectedServices: Array<{
    name: string;
    status: 'down' | 'degraded' | 'maintenance';
    description?: string;
  }>;
  userExperience: {
    showMaintenancePage: boolean;
    allowReadOnlyAccess: boolean;
    redirectUrl?: string;
    customPageContent?: string;
    showProgress: boolean;
    progressPercentage?: number;
  };
  notifications: {
    emailUsers: boolean;
    emailAdmins: boolean;
    inAppNotification: boolean;
    socialMedia: boolean;
    statusPage: boolean;
    customMessage?: string;
    notifyBefore: number;
  };
  accessControl: {
    allowAdminAccess: boolean;
    allowSpecificUsers: string[];
    allowSpecificIPs: string[];
    allowSpecificRoles: string[];
    bypassToken?: string;
  };
  progress: {
    currentStep: string;
    totalSteps: number;
    completedSteps: number;
    status: 'preparing' | 'in_progress' | 'completing' | 'completed' | 'failed';
    lastUpdate: string;
    notes: Array<{
      timestamp: string;
      message: string;
      author: string;
    }>;
  };
  rollback: {
    canRollback: boolean;
    rollbackSteps: string[];
    rollbackTriggered: boolean;
    rollbackReason?: string;
    rollbackInitiatedBy?: string;
    rollbackInitiatedAt?: string;
  };
  monitoring: {
    monitorSystemHealth: boolean;
    alertThresholds: {
      cpu: number;
      memory: number;
      disk: number;
      responseTime: number;
    };
    alerts: Array<{
      timestamp: string;
      type: 'warning' | 'error' | 'critical';
      message: string;
      resolved: boolean;
    }>;
  };
  communication: {
    statusPageUrl?: string;
    socialMediaPosts: Array<{
      platform: string;
      content: string;
      postedAt: string;
      url?: string;
    }>;
    supportChannels: Array<{
      type: 'email' | 'chat' | 'phone';
      contact: string;
      available: boolean;
    }>;
  };
  analytics: {
    usersAffected: number;
    pageViews: number;
    bounceRate: number;
    userFeedback: Array<{
      rating: number;
      comment: string;
      timestamp: string;
      userId?: string;
    }>;
  };
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  duration?: number;
  timeRemaining?: number;
  progressPercentage?: number;
}

const MaintenancePage: React.FC = () => {
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [currentMaintenance, setCurrentMaintenance] = useState<MaintenanceRecord | null>(null);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MaintenanceRecord | null>(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pages: 1,
    total: 0
  });

  useEffect(() => {
    fetchMaintenanceRecords();
    fetchCurrentMaintenance();
    fetchUpcomingMaintenance();
  }, [pagination.current, searchTerm, typeFilter, priorityFilter, statusFilter]);

  const fetchMaintenanceRecords = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.current.toString(),
        limit: '10',
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      if (searchTerm) params.append('q', searchTerm);
      if (typeFilter) params.append('type', typeFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (statusFilter) params.append('status', statusFilter);

      const response = await api.get(`/maintenance?${params}`);
      setMaintenanceRecords(response.data.data.maintenanceRecords);
      setPagination(response.data.data.pagination);
    } catch (error) {
      console.error('Error fetching maintenance records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentMaintenance = async () => {
    try {
      const response = await api.get('/maintenance/status');
      setCurrentMaintenance(response.data.data.maintenance);
    } catch (error) {
      console.error('Error fetching current maintenance:', error);
    }
  };

  const fetchUpcomingMaintenance = async () => {
    try {
      const response = await api.get('/maintenance/upcoming');
      setUpcomingMaintenance(response.data.data.upcoming);
    } catch (error) {
      console.error('Error fetching upcoming maintenance:', error);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchMaintenanceRecords();
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, current: page }));
  };

  const handleRecordClick = (record: MaintenanceRecord) => {
    setSelectedRecord(record);
    setShowDetailModal(true);
  };

  const handleStartMaintenance = async (recordId: string) => {
    try {
      await api.post(`/maintenance/${recordId}/start`);
      fetchMaintenanceRecords();
      fetchCurrentMaintenance();
    } catch (error) {
      console.error('Error starting maintenance:', error);
    }
  };

  const handleEndMaintenance = async (recordId: string) => {
    try {
      await api.post(`/maintenance/${recordId}/end`);
      fetchMaintenanceRecords();
      fetchCurrentMaintenance();
    } catch (error) {
      console.error('Error ending maintenance:', error);
    }
  };

  const handleSelectRecord = (recordId: string) => {
    setSelectedRecords(prev => 
      prev.includes(recordId) 
        ? prev.filter(id => id !== recordId)
        : [...prev, recordId]
    );
  };

  const handleSelectAll = () => {
    if (selectedRecords.length === maintenanceRecords.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(maintenanceRecords.map(record => record._id));
    }
  };

  const getTypeColor = (type: string) => {
    const colors = {
      scheduled: 'bg-blue-100 text-blue-800',
      emergency: 'bg-red-100 text-red-800',
      update: 'bg-green-100 text-green-800',
      migration: 'bg-purple-100 text-purple-800',
      security: 'bg-orange-100 text-orange-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };
    return colors[priority as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors = {
      preparing: 'bg-yellow-100 text-yellow-800',
      in_progress: 'bg-blue-100 text-blue-800',
      completing: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      failed: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
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

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return `${Math.floor(minutes / 1440)}d`;
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
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Mode</h1>
          <p className="text-gray-600">Manage system maintenance and downtime</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          Schedule Maintenance
        </Button>
      </div>

      {/* Current Maintenance Alert */}
      {currentMaintenance && (
        <Card>
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-red-800">System Under Maintenance</h3>
                <p className="text-red-700">{currentMaintenance.title}</p>
                <p className="text-sm text-red-600">
                  Started: {formatDate(currentMaintenance.scheduledStart)} • 
                  Progress: {currentMaintenance.progressPercentage || 0}% • 
                  Time Remaining: {currentMaintenance.timeRemaining ? formatDuration(currentMaintenance.timeRemaining) : 'Unknown'}
                </p>
              </div>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  onClick={() => handleEndMaintenance(currentMaintenance._id)}
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  End Maintenance
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Upcoming Maintenance */}
      {upcomingMaintenance.length > 0 && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Upcoming Maintenance</h3>
            <div className="space-y-3">
              {upcomingMaintenance.slice(0, 3).map((record) => (
                <div key={record._id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div>
                    <div className="font-medium text-gray-900">{record.title}</div>
                    <div className="text-sm text-gray-600">
                      {formatDate(record.scheduledStart)} - {formatDate(record.scheduledEnd)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${getTypeColor(record.type)}`}>
                      {record.type}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(record.priority)}`}>
                      {record.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <Input
                placeholder="Search maintenance..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All Types</option>
                <option value="scheduled">Scheduled</option>
                <option value="emergency">Emergency</option>
                <option value="update">Update</option>
                <option value="migration">Migration</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
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
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
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

      {/* Maintenance Records Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedRecords.length === maintenanceRecords.length && maintenanceRecords.length > 0}
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
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Schedule
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Progress
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {maintenanceRecords.map((record) => (
                <tr key={record._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedRecords.includes(record._id)}
                      onChange={() => handleSelectRecord(record._id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{record.title}</div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">{record.message}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getTypeColor(record.type)}`}>
                      {record.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(record.priority)}`}>
                      {record.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(record.progress.status)}`}>
                      {record.progress.status}
                    </span>
                    {record.isActive && (
                      <div className="text-xs text-red-600 mt-1">ACTIVE</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{formatDate(record.scheduledStart)}</div>
                    <div className="text-xs">to {formatDate(record.scheduledEnd)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDuration(record.estimatedDuration)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${record.progressPercentage || 0}%` }}
                        ></div>
                      </div>
                      <span className="text-xs">{record.progressPercentage || 0}%</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {record.progress.completedSteps}/{record.progress.totalSteps} steps
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRecordClick(record)}
                      >
                        View
                      </Button>
                      {!record.isActive && record.progress.status === 'preparing' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartMaintenance(record._id)}
                        >
                          Start
                        </Button>
                      )}
                      {record.isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEndMaintenance(record._id)}
                        >
                          End
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

      {/* Maintenance Detail Modal */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Maintenance Details - {selectedRecord.title}
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
                    <div><strong>Title:</strong> {selectedRecord.title}</div>
                    <div><strong>Message:</strong> {selectedRecord.message}</div>
                    {selectedRecord.description && (
                      <div><strong>Description:</strong> {selectedRecord.description}</div>
                    )}
                    <div><strong>Type:</strong> <span className={`px-2 py-1 text-xs rounded-full ${getTypeColor(selectedRecord.type)}`}>{selectedRecord.type}</span></div>
                    <div><strong>Priority:</strong> <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(selectedRecord.priority)}`}>{selectedRecord.priority}</span></div>
                    <div><strong>Status:</strong> <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(selectedRecord.progress.status)}`}>{selectedRecord.progress.status}</span></div>
                    <div><strong>Created:</strong> {formatDate(selectedRecord.createdAt)}</div>
                  </div>
                </div>

                {/* Schedule */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Schedule</h4>
                  <div className="space-y-2">
                    <div><strong>Start:</strong> {formatDate(selectedRecord.scheduledStart)}</div>
                    <div><strong>End:</strong> {formatDate(selectedRecord.scheduledEnd)}</div>
                    <div><strong>Duration:</strong> {formatDuration(selectedRecord.estimatedDuration)}</div>
                    <div><strong>Timezone:</strong> {selectedRecord.timezone}</div>
                    {selectedRecord.timeRemaining && (
                      <div><strong>Time Remaining:</strong> {formatDuration(selectedRecord.timeRemaining)}</div>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Progress</h4>
                  <div className="space-y-2">
                    <div><strong>Current Step:</strong> {selectedRecord.progress.currentStep}</div>
                    <div><strong>Progress:</strong> {selectedRecord.progress.completedSteps}/{selectedRecord.progress.totalSteps} steps</div>
                    <div><strong>Percentage:</strong> {selectedRecord.progressPercentage || 0}%</div>
                    <div><strong>Last Update:</strong> {formatDate(selectedRecord.progress.lastUpdate)}</div>
                    {selectedRecord.progress.notes.length > 0 && (
                      <div>
                        <strong>Notes:</strong>
                        <div className="mt-1 max-h-32 overflow-y-auto">
                          {selectedRecord.progress.notes.map((note, index) => (
                            <div key={index} className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2 mb-1">
                              <div>{note.message}</div>
                              <div className="text-gray-400">- {note.author} at {formatDate(note.timestamp)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Affected Services */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Affected Services</h4>
                  <div className="space-y-2">
                    {selectedRecord.affectedServices.map((service, index) => (
                      <div key={index} className="flex justify-between items-center py-1 border-b border-gray-100">
                        <div>
                          <div className="text-sm font-medium">{service.name}</div>
                          {service.description && (
                            <div className="text-xs text-gray-500">{service.description}</div>
                          )}
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          service.status === 'down' ? 'bg-red-100 text-red-800' :
                          service.status === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {service.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alerts */}
                {selectedRecord.monitoring.alerts.length > 0 && (
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-3">Alerts</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {selectedRecord.monitoring.alerts.map((alert, index) => (
                        <div key={index} className={`p-2 rounded text-xs ${
                          alert.type === 'critical' ? 'bg-red-100 text-red-800' :
                          alert.type === 'error' ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          <div className="font-medium">{alert.type.toUpperCase()}</div>
                          <div>{alert.message}</div>
                          <div className="text-gray-600">{formatDate(alert.timestamp)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Analytics */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Analytics</h4>
                  <div className="space-y-2">
                    <div><strong>Users Affected:</strong> {selectedRecord.analytics.usersAffected}</div>
                    <div><strong>Page Views:</strong> {selectedRecord.analytics.pageViews}</div>
                    <div><strong>Bounce Rate:</strong> {selectedRecord.analytics.bounceRate}%</div>
                    {selectedRecord.analytics.userFeedback.length > 0 && (
                      <div>
                        <strong>User Feedback:</strong>
                        <div className="mt-1">
                          {selectedRecord.analytics.userFeedback.map((feedback, index) => (
                            <div key={index} className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2 mb-1">
                              <div>Rating: {feedback.rating}/5</div>
                              {feedback.comment && <div>{feedback.comment}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
                {!selectedRecord.isActive && selectedRecord.progress.status === 'preparing' && (
                  <Button
                    onClick={() => {
                      handleStartMaintenance(selectedRecord._id);
                      setShowDetailModal(false);
                    }}
                  >
                    Start Maintenance
                  </Button>
                )}
                {selectedRecord.isActive && (
                  <Button
                    onClick={() => {
                      handleEndMaintenance(selectedRecord._id);
                      setShowDetailModal(false);
                    }}
                  >
                    End Maintenance
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

export default MaintenancePage;
