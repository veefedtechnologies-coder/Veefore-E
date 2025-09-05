import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { 
  Shield, 
  Monitor, 
  Smartphone, 
  Tablet, 
  MapPin, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  RefreshCw,
  Filter,
  Download,
  Eye
} from 'lucide-react';
import { apiClient as api } from '../../services/api';

interface Session {
  id: string;
  adminId: string;
  ipAddress: string;
  userAgent: string;
  device: {
    type: 'desktop' | 'mobile' | 'tablet';
    os: string;
    browser: string;
    version: string;
  };
  location?: {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  };
  isActive: boolean;
  lastActivity: string;
  expiresAt: string;
  isSecure: boolean;
  isTrusted: boolean;
  riskScore: number;
  activityCount: number;
  lastAction?: string;
  lastPage?: string;
  createdAt: string;
}

interface SessionStats {
  total: number;
  active: number;
  inactive: number;
  byDevice: { [key: string]: number };
  byLocation: { [key: string]: number };
  riskDistribution: { [key: string]: number };
}

const SessionManagementPage: React.FC = () => {
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [filterRisk, setFilterRisk] = useState('all');

  const queryClient = useQueryClient();

  // Fetch sessions
  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ['sessions', filterType, filterRisk],
    queryFn: () => api.get('/sessions/my-sessions', {
      params: { 
        activeOnly: filterType === 'active',
        limit: 50
      }
    }).then(res => res.data)
  });

  // Fetch session statistics
  const { data: statsData } = useQuery({
    queryKey: ['session-stats'],
    queryFn: () => api.get('/sessions/stats/overview').then(res => res.data)
  });

  // Terminate session mutation
  const terminateSessionMutation = useMutation({
    mutationFn: (sessionToken: string) => api.delete(`/sessions/${sessionToken}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['session-stats'] });
    }
  });

  // Terminate all sessions mutation
  const terminateAllSessionsMutation = useMutation({
    mutationFn: (excludeCurrent: boolean) => api.delete('/sessions/my-sessions/all', {
      data: { excludeCurrent }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['session-stats'] });
    }
  });

  const sessions: Session[] = sessionsData?.data || [];
  const stats: SessionStats = statsData?.data || {
    total: 0,
    active: 0,
    inactive: 0,
    byDevice: {},
    byLocation: {},
    riskDistribution: {}
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'desktop': return <Monitor className="h-4 w-4" />;
      case 'mobile': return <Smartphone className="h-4 w-4" />;
      case 'tablet': return <Tablet className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const getRiskColor = (riskScore: number) => {
    if (riskScore >= 75) return 'destructive';
    if (riskScore >= 50) return 'warning';
    if (riskScore >= 25) return 'info';
    return 'success';
  };

  const getRiskLabel = (riskScore: number) => {
    if (riskScore >= 75) return 'High Risk';
    if (riskScore >= 50) return 'Medium Risk';
    if (riskScore >= 25) return 'Low Risk';
    return 'Safe';
  };

  const formatLastActivity = (lastActivity: string) => {
    const date = new Date(lastActivity);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessions(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.id));
    }
  };

  const handleTerminateSession = (sessionId: string) => {
    if (confirm('Are you sure you want to terminate this session?')) {
      terminateSessionMutation.mutate(sessionId);
    }
  };

  const handleTerminateAll = () => {
    if (confirm('Are you sure you want to terminate all other sessions? This will log you out of all other devices.')) {
      terminateAllSessionsMutation.mutate(true);
    }
  };

  if (sessionsLoading) {
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
          <h1 className="text-2xl font-bold text-gray-900">Session Management</h1>
          <p className="text-gray-600">Manage your active sessions and security</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => refetchSessions()}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
          <Button
            variant="destructive"
            onClick={handleTerminateAll}
            disabled={terminateAllSessionsMutation.isPending}
            className="flex items-center space-x-2"
          >
            <XCircle className="h-4 w-4" />
            <span>Terminate All Others</span>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-gray-100 rounded-lg">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Inactive Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.inactive}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">High Risk</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.riskDistribution['75-100'] || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filter:</span>
          </div>
          
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Sessions</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Risk Levels</option>
            <option value="high">High Risk (75+)</option>
            <option value="medium">Medium Risk (50-74)</option>
            <option value="low">Low Risk (25-49)</option>
            <option value="safe">Safe (0-24)</option>
          </select>
        </div>
      </Card>

      {/* Sessions Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <input
                  type="checkbox"
                  checked={selectedSessions.length === sessions.length && sessions.length > 0}
                  onChange={handleSelectAll}
                  className="rounded"
                />
              </TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Last Activity</TableHead>
              <TableHead>Risk Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedSessions.includes(session.id)}
                    onChange={() => handleSelectSession(session.id)}
                    className="rounded"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {getDeviceIcon(session.device.type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {session.device.browser} {session.device.version}
                      </p>
                      <p className="text-xs text-gray-500">
                        {session.device.os} • {session.device.type}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    <MapPin className="h-3 w-3 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {session.location?.city || 'Unknown'}, {session.location?.country || 'Unknown'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-900 font-mono">
                    {session.ipAddress}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {formatLastActivity(session.lastActivity)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getRiskColor(session.riskScore) as any}>
                    {getRiskLabel(session.riskScore)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    {session.isActive ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-600">
                      {session.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTerminateSession(session.id)}
                      disabled={terminateSessionMutation.isPending}
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

      {/* Selected Sessions Actions */}
      {selectedSessions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedSessions.length} session(s) selected
            </span>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedSessions([])}
              >
                Clear Selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm(`Are you sure you want to terminate ${selectedSessions.length} selected sessions?`)) {
                    // Handle bulk termination
                    selectedSessions.forEach(sessionId => {
                      terminateSessionMutation.mutate(sessionId);
                    });
                    setSelectedSessions([]);
                  }
                }}
              >
                Terminate Selected
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SessionManagementPage;
