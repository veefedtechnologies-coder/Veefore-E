import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Chart, MultiSeriesChart } from '../../components/ui/Chart';
import { DataTable } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingStates';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Activity,
  Eye,
  Download,
  RefreshCw,
  Settings,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart,
  LineChart,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Star,
  Target,
  Zap,
  Shield,
  Database,
  Server,
  Cpu,
  HardDrive,
  Wifi,
  Globe
} from 'lucide-react';

interface DashboardStats {
  totalUsers: number;
  totalRevenue: number;
  activeSessions: number;
  conversionRate: number;
  growthRate: number;
  pageViews: number;
  downloads: number;
  tasksCompleted: number;
}

interface SalesData {
  month: string;
  sales: number;
  revenue: number;
  users: number;
}

interface UserActivity {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  avatar: string;
  status: 'online' | 'offline';
}

interface ProjectRisk {
  level: number;
  status: string;
  awsInstances: number;
  createdDate: string;
}

interface ApplicationSales {
  id: string;
  name: string;
  sales: number;
  change: number;
  avgPrice: number;
  total: number;
  trend: number[];
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [projectRisk, setProjectRisk] = useState<ProjectRisk | null>(null);
  const [applicationSales, setApplicationSales] = useState<ApplicationSales[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [timeRange, setTimeRange] = useState('7d');

  // Fetch real dashboard data
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch all dashboard data in parallel
        const [statsRes, salesRes, activitiesRes, riskRes, salesRes2] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/dashboard/sales'),
          fetch('/api/dashboard/activities'),
          fetch('/api/dashboard/risk'),
          fetch('/api/dashboard/applications')
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        if (salesRes.ok) {
          const salesData = await salesRes.json();
          setSalesData(salesData);
        }

        if (activitiesRes.ok) {
          const activitiesData = await activitiesRes.json();
          setUserActivities(activitiesData);
        }

        if (riskRes.ok) {
          const riskData = await riskRes.json();
          setProjectRisk(riskData);
        }

        if (salesRes2.ok) {
          const applicationsData = await salesRes2.json();
          setApplicationSales(applicationsData);
        }

        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
    
    // Set up real-time updates
    const interval = setInterval(fetchDashboardData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [timeRange]);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/dashboard/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timeRange, format: 'pdf' })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dashboard-report-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting dashboard:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const statsCards = [
    {
      title: 'All Earnings',
      value: `$${stats?.totalRevenue?.toLocaleString() || '0'}`,
      change: `+${stats?.growthRate || 0}%`,
      changeType: 'positive',
      icon: DollarSign,
      color: 'orange',
      updateTime: lastUpdated
    },
    {
      title: 'Page Views',
      value: `${stats?.pageViews?.toLocaleString() || '0'}+`,
      change: `+${Math.floor(Math.random() * 20)}%`,
      changeType: 'positive',
      icon: Eye,
      color: 'green',
      updateTime: lastUpdated
    },
    {
      title: 'Task Completed',
      value: `${stats?.tasksCompleted || 0}`,
      change: `+${Math.floor(Math.random() * 15)}%`,
      changeType: 'positive',
      icon: CheckCircle,
      color: 'red',
      updateTime: lastUpdated
    },
    {
      title: 'Downloads',
      value: `${stats?.downloads || 0}`,
      change: `+${Math.floor(Math.random() * 25)}%`,
      changeType: 'positive',
      icon: Download,
      color: 'blue',
      updateTime: lastUpdated
    }
  ];

  const systemMetrics = [
    { label: 'CPU Usage', value: '45%', status: 'good', icon: Cpu },
    { label: 'Memory', value: '2.1GB / 8GB', status: 'good', icon: Database },
    { label: 'Disk Space', value: '156GB / 500GB', status: 'warning', icon: HardDrive },
    { label: 'Network', value: '98%', status: 'excellent', icon: Wifi }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <Badge variant="success" className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Live</span>
            </Badge>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
            <Button variant="outline" onClick={handleRefresh} className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </Button>
            <Button onClick={handleExport} className="flex items-center space-x-2">
              <Download className="h-4 w-4" />
              <span>Export</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((stat, index) => (
            <Card key={index} className="p-6 hover:shadow-lg transition-all duration-200 border-0 bg-gradient-to-br from-white to-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {stat.changeType === 'positive' ? (
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                      )}
                      <span className={`text-sm font-medium ml-1 ${
                        stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stat.change}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="h-4 w-4 text-gray-400" />
                      <span className="text-xs text-gray-500">update: {stat.updateTime}</span>
                    </div>
                  </div>
                </div>
                <div className={`p-4 rounded-xl bg-${stat.color}-100`}>
                  <stat.icon className={`h-8 w-8 text-${stat.color}-600`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sales Analytics Chart */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Sales Analytics</h3>
                  <p className="text-sm text-gray-600">For more details about usage, please refer amCharts licences.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 px-3 py-1 bg-gray-100 rounded-lg">
                    <Calendar className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-700">1970-1980</span>
                  </div>
                  <Button variant="outline" size="sm">Show all</Button>
                </div>
              </div>
              <div className="h-80">
                <Chart
                  data={salesData}
                  type="line"
                  dataKey="sales"
                  nameKey="month"
                  height={300}
                  colors={['#F59E0B']}
                  gradient={true}
                />
              </div>
            </Card>
          </div>

          {/* Project Risk Widget */}
          <div>
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Project Risk</h3>
                <Settings className="h-5 w-5 text-gray-400" />
              </div>
              <div className="text-center mb-6">
                <div className="relative w-32 h-32 mx-auto mb-4">
                  <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#E5E7EB"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth="8"
                      strokeDasharray={`${(projectRisk?.level || 5) * 25.13} 251.3`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">{projectRisk?.level || 5}</span>
                  </div>
                </div>
                <p className="text-lg font-medium text-gray-900 mb-1">Balanced</p>
                <button className="text-sm text-blue-600 hover:text-blue-700">Change Your Risk</button>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Nr AWS</span>
                  <span className="font-medium">{projectRisk?.awsInstances || 2455}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Created</span>
                  <span className="font-medium">{projectRisk?.createdDate || '30th Sep'}</span>
                </div>
              </div>
              <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                Download Overall Report
              </Button>
            </Card>
          </div>
        </div>

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Application Sales Table */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Application Sales</h3>
              <Button variant="outline" size="sm">View all Projects</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Application</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Sales</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Change</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Avg Price</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {applicationSales.map((app, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-2 font-medium text-gray-900">{app.name}</td>
                      <td className="py-3 px-2 text-gray-600">{app.sales}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-16 h-6 bg-gray-200 rounded">
                            <div 
                              className={`h-full rounded ${app.change > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.abs(app.change)}%` }}
                            />
                          </div>
                          <span className={`text-sm ${app.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {app.change > 0 ? '+' : ''}{app.change}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-gray-600">${app.avgPrice}</td>
                      <td className="py-3 px-2">
                        <button className="text-blue-600 hover:text-blue-700 font-medium">
                          ${app.total.toLocaleString()}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* User Activity Feed */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">User Activity</h3>
              <Button variant="outline" size="sm">View all Projects</Button>
            </div>
            <div className="space-y-4">
              {userActivities.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                      {activity.avatar}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                      activity.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.user}</p>
                    <p className="text-sm text-gray-600 mt-1">{activity.action}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* System Status and Latest Updates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* System Status */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
            <div className="grid grid-cols-2 gap-4">
              {systemMetrics.map((metric, index) => (
                <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className={`p-2 rounded-lg ${
                    metric.status === 'excellent' ? 'bg-green-100' :
                    metric.status === 'good' ? 'bg-blue-100' :
                    metric.status === 'warning' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    <metric.icon className={`h-5 w-5 ${
                      metric.status === 'excellent' ? 'text-green-600' :
                      metric.status === 'good' ? 'text-blue-600' :
                      metric.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{metric.value}</p>
                    <p className="text-xs text-gray-600">{metric.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Latest Updates */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Latest Updates</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold text-sm">+</span>
                </div>
                <div>
                  <p className="text-sm text-gray-900">+5 New Products were added! Congratulations!</p>
                  <p className="text-xs text-gray-500 mt-1">4 hrs ago</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-900">Database backup completed!</p>
                  <p className="text-xs text-gray-500 mt-1">1 day ago</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;