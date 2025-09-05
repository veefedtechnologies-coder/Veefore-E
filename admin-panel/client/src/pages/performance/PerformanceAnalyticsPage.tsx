import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'react-query';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { 
  Activity, 
  Server, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Play,
  Pause,
  BarChart3,
  Cpu,
  HardDrive,
  Wifi,
  Users,
  DollarSign,
  Clock,
  Zap
} from 'lucide-react';
import { apiClient as api } from '../../services/api';

interface SystemMetrics {
  _id: string;
  timestamp: string;
  server: {
    cpu: { usage: number; loadAverage: number[]; cores: number };
    memory: { used: number; free: number; total: number; usagePercentage: number };
    disk: { used: number; free: number; total: number; usagePercentage: number };
    uptime: number;
    processId: number;
  };
  database: {
    connectionCount: number;
    activeConnections: number;
    queryTime: number;
    slowQueries: number;
    indexUsage: number;
    cacheHitRate: number;
    lockWaitTime: number;
  };
  application: {
    requestCount: number;
    responseTime: number;
    errorRate: number;
    activeUsers: number;
    memoryUsage: number;
    heapUsed: number;
    heapTotal: number;
    eventLoopLag: number;
  };
  api: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    requestsPerSecond: number;
  };
  business: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    totalRevenue: number;
    dailyRevenue: number;
    subscriptionCount: number;
    churnRate: number;
    conversionRate: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    bySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    recentErrors: Array<{
      message: string;
      stack: string;
      timestamp: string;
      severity: string;
      count: number;
    }>;
  };
  healthStatus: {
    overall: 'healthy' | 'warning' | 'critical' | 'down';
    services: {
      database: 'healthy' | 'warning' | 'critical' | 'down';
      api: 'healthy' | 'warning' | 'critical' | 'down';
      cache: 'healthy' | 'warning' | 'critical' | 'down';
      storage: 'healthy' | 'warning' | 'critical' | 'down';
    };
    alerts: Array<{
      type: string;
      message: string;
      severity: 'info' | 'warning' | 'error' | 'critical';
      timestamp: string;
    }>;
  };
}

interface PerformanceSummary {
  period: string;
  summary: {
    avgCpuUsage: number;
    maxCpuUsage: number;
    avgMemoryUsage: number;
    maxMemoryUsage: number;
    avgResponseTime: number;
    maxResponseTime: number;
    totalErrors: number;
    uptime: number;
    healthScore: number;
  };
  trends: {
    cpu: Array<{ timestamp: string; usage: number }>;
    memory: Array<{ timestamp: string; usage: number }>;
    responseTime: Array<{ timestamp: string; time: number }>;
    errors: Array<{ timestamp: string; count: number }>;
  };
}

const PerformanceAnalyticsPage: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('24h');
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Fetch real-time metrics
  const { data: realtimeData, isLoading: realtimeLoading, refetch: refetchRealtime } = useQuery({
    queryKey: ['performance-realtime'],
    queryFn: () => api.get('/performance-analytics/realtime').then(res => res.data),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isMonitoring
  });

  // Fetch performance summary
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['performance-summary', selectedPeriod],
    queryFn: () => api.get(`/performance-analytics/summary?period=${selectedPeriod}`).then(res => res.data),
    refetchInterval: 60000 // Refresh every minute
  });

  // Fetch health status
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['performance-health'],
    queryFn: () => api.get('/performance-analytics/health').then(res => res.data),
    refetchInterval: 15000 // Refresh every 15 seconds
  });

  // Toggle monitoring mutation
  const toggleMonitoringMutation = useMutation({
    mutationFn: (action: 'start' | 'stop') => 
      api.post('/performance-analytics/monitoring', { action }),
    onSuccess: (data) => {
      setIsMonitoring(data.data.action === 'start');
    }
  });

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      case 'down': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-600" />;
      case 'down': return <XCircle className="h-5 w-5 text-gray-600" />;
      default: return <Activity className="h-5 w-5 text-gray-600" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (realtimeLoading || summaryLoading || healthLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const realtimeMetrics: SystemMetrics | null = realtimeData?.data || null;
  const summary: PerformanceSummary | null = summaryData?.data || null;
  const healthStatus = healthData?.data || { overall: 'unknown', services: {}, alerts: [] };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>
          <p className="text-gray-600">Monitor system performance and health metrics</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <Button
            variant="outline"
            onClick={() => refetchRealtime()}
            className="flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </Button>
          <Button
            variant={isMonitoring ? "destructive" : "default"}
            onClick={() => toggleMonitoringMutation.mutate(isMonitoring ? 'stop' : 'start')}
            className="flex items-center space-x-2"
            disabled={toggleMonitoringMutation.isPending}
          >
            {isMonitoring ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{isMonitoring ? 'Stop' : 'Start'} Monitoring</span>
          </Button>
        </div>
      </div>

      {/* Health Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Overall Health</p>
              <p className={`text-2xl font-bold ${getHealthColor(healthStatus.overall).split(' ')[0]}`}>
                {healthStatus.overall.toUpperCase()}
              </p>
            </div>
            {getHealthIcon(healthStatus.overall)}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Database</p>
              <p className={`text-2xl font-bold ${getHealthColor(healthStatus.services?.database || 'unknown').split(' ')[0]}`}>
                {healthStatus.services?.database?.toUpperCase() || 'UNKNOWN'}
              </p>
            </div>
            <Database className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">API</p>
              <p className={`text-2xl font-bold ${getHealthColor(healthStatus.services?.api || 'unknown').split(' ')[0]}`}>
                {healthStatus.services?.api?.toUpperCase() || 'UNKNOWN'}
              </p>
            </div>
            <Server className="h-8 w-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Health Score</p>
              <p className="text-2xl font-bold text-blue-600">
                {summary?.summary.healthScore || 0}%
              </p>
            </div>
            <BarChart3 className="h-8 w-8 text-blue-600" />
          </div>
        </Card>
      </div>

      {/* Real-time Metrics */}
      {realtimeMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">CPU Usage</p>
                <p className="text-2xl font-bold text-gray-900">
                  {realtimeMetrics.server.cpu.usage.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">
                  {realtimeMetrics.server.cpu.cores} cores
                </p>
              </div>
              <Cpu className="h-8 w-8 text-orange-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Memory Usage</p>
                <p className="text-2xl font-bold text-gray-900">
                  {realtimeMetrics.server.memory.usagePercentage.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">
                  {formatBytes(realtimeMetrics.server.memory.used)} / {formatBytes(realtimeMetrics.server.memory.total)}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-purple-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Response Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {realtimeMetrics.api.averageResponseTime.toFixed(0)}ms
                </p>
                <p className="text-xs text-gray-500">
                  P95: {realtimeMetrics.api.p95ResponseTime.toFixed(0)}ms
                </p>
              </div>
              <Clock className="h-8 w-8 text-green-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Uptime</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatUptime(realtimeMetrics.server.uptime)}
                </p>
                <p className="text-xs text-gray-500">
                  PID: {realtimeMetrics.server.processId}
                </p>
              </div>
              <Zap className="h-8 w-8 text-yellow-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Performance Summary */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Average CPU Usage</span>
                <span className="font-medium">{summary.summary.avgCpuUsage.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Peak CPU Usage</span>
                <span className="font-medium">{summary.summary.maxCpuUsage.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Average Memory Usage</span>
                <span className="font-medium">{summary.summary.avgMemoryUsage.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Peak Memory Usage</span>
                <span className="font-medium">{summary.summary.maxMemoryUsage.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Average Response Time</span>
                <span className="font-medium">{summary.summary.avgResponseTime.toFixed(0)}ms</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Peak Response Time</span>
                <span className="font-medium">{summary.summary.maxResponseTime.toFixed(0)}ms</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Errors</span>
                <span className="font-medium text-red-600">{summary.summary.totalErrors}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">System Uptime</span>
                <span className="font-medium">{formatUptime(summary.summary.uptime)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Health Score</span>
                <span className={`font-medium ${
                  summary.summary.healthScore >= 80 ? 'text-green-600' :
                  summary.summary.healthScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {summary.summary.healthScore.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    summary.summary.healthScore >= 80 ? 'bg-green-500' :
                    summary.summary.healthScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${summary.summary.healthScore}%` }}
                ></div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Business Metrics */}
      {realtimeMetrics && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <Users className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{realtimeMetrics.business.totalUsers.toLocaleString()}</p>
              <p className="text-sm text-gray-600">Total Users</p>
            </div>
            <div className="text-center">
              <Activity className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{realtimeMetrics.business.activeUsers.toLocaleString()}</p>
              <p className="text-sm text-gray-600">Active Users</p>
            </div>
            <div className="text-center">
              <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">{realtimeMetrics.business.newUsers.toLocaleString()}</p>
              <p className="text-sm text-gray-600">New Users</p>
            </div>
            <div className="text-center">
              <DollarSign className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-900">${realtimeMetrics.business.totalRevenue.toLocaleString()}</p>
              <p className="text-sm text-gray-600">Total Revenue</p>
            </div>
          </div>
        </Card>
      )}

      {/* Recent Alerts */}
      {healthStatus.alerts && healthStatus.alerts.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h3>
          <div className="space-y-3">
            {healthStatus.alerts.slice(0, 5).map((alert, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                {getHealthIcon(alert.severity)}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                  <p className="text-xs text-gray-500">
                    {alert.type} • {new Date(alert.timestamp).toLocaleString()}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getHealthColor(alert.severity)}`}>
                  {alert.severity.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default PerformanceAnalyticsPage;
