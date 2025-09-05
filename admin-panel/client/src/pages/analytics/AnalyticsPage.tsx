import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Chart, MultiSeriesChart } from '../../components/ui/Chart';
import { DataTable } from '../../components/ui/DataTable';
import { LoadingSpinner } from '../../components/ui/LoadingStates';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Users, 
  DollarSign, 
  Eye,
  MousePointer,
  Clock,
  Download,
  RefreshCw,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ShoppingCart,
  CreditCard,
  UserPlus,
  Globe,
  Smartphone,
  Monitor,
  Tablet,
  Target,
  Zap,
  Shield,
  Database,
  Server,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle,
  Star,
  Crown,
  Settings,
  MoreHorizontal
} from 'lucide-react';

interface AnalyticsData {
  totalRevenue: number;
  totalUsers: number;
  pageViews: number;
  conversionRate: number;
  bounceRate: number;
  avgSessionDuration: number;
  newUsers: number;
  returningUsers: number;
  revenueGrowth: number;
  userGrowth: number;
  pageViewGrowth: number;
  conversionGrowth: number;
}

interface TrafficData {
  source: string;
  visitors: number;
  sessions: number;
  bounceRate: number;
  conversionRate: number;
  revenue: number;
  trend: number[];
}

interface DeviceData {
  device: string;
  visitors: number;
  percentage: number;
  sessions: number;
  bounceRate: number;
  conversionRate: number;
}

interface GeographicData {
  country: string;
  visitors: number;
  revenue: number;
  conversionRate: number;
  flag: string;
}

interface ConversionFunnel {
  step: string;
  visitors: number;
  conversions: number;
  rate: number;
  dropoff: number;
}

interface RealTimeData {
  activeUsers: number;
  pageViews: number;
  conversions: number;
  topPages: Array<{
    page: string;
    views: number;
    users: number;
  }>;
  topSources: Array<{
    source: string;
    visitors: number;
  }>;
}

const AnalyticsPage: React.FC = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);
  const [deviceData, setDeviceData] = useState<DeviceData[]>([]);
  const [geographicData, setGeographicData] = useState<GeographicData[]>([]);
  const [conversionFunnel, setConversionFunnel] = useState<ConversionFunnel[]>([]);
  const [realTimeData, setRealTimeData] = useState<RealTimeData | null>(null);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        setIsLoading(true);
        
        const [analyticsRes, trafficRes, deviceRes, geoRes, funnelRes, realTimeRes, salesRes] = await Promise.all([
          fetch(`/api/analytics/overview?timeRange=${timeRange}`),
          fetch(`/api/analytics/traffic?timeRange=${timeRange}`),
          fetch(`/api/analytics/devices?timeRange=${timeRange}`),
          fetch(`/api/analytics/geographic?timeRange=${timeRange}`),
          fetch(`/api/analytics/funnel?timeRange=${timeRange}`),
          fetch('/api/analytics/realtime'),
          fetch(`/api/analytics/sales?timeRange=${timeRange}`)
        ]);

        if (analyticsRes.ok) {
          const data = await analyticsRes.json();
          setAnalyticsData(data);
        }

        if (trafficRes.ok) {
          const data = await trafficRes.json();
          setTrafficData(data);
        }

        if (deviceRes.ok) {
          const data = await deviceRes.json();
          setDeviceData(data);
        }

        if (geoRes.ok) {
          const data = await geoRes.json();
          setGeographicData(data);
        }

        if (funnelRes.ok) {
          const data = await funnelRes.json();
          setConversionFunnel(data);
        }

        if (realTimeRes.ok) {
          const data = await realTimeRes.json();
          setRealTimeData(data);
        }

        if (salesRes.ok) {
          const data = await salesRes.json();
          setSalesData(data);
        }

        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Error fetching analytics data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalyticsData();
    
    // Set up real-time updates
    const interval = setInterval(fetchAnalyticsData, 30000);
    return () => clearInterval(interval);
  }, [timeRange]);

  const handleExport = async () => {
    try {
      const response = await fetch('/api/analytics/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          timeRange, 
          format: 'excel',
          includeCharts: true 
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error exporting analytics:', error);
    }
  };

  if (isLoading && !analyticsData) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const keyMetrics = [
    {
      title: 'Total Revenue',
      value: `$${analyticsData?.totalRevenue?.toLocaleString() || '0'}`,
      change: `+${analyticsData?.revenueGrowth || 0}%`,
      changeType: 'positive',
      icon: DollarSign,
      color: 'green',
      trend: [1000, 1200, 1100, 1400, 1600, 1800, 2000]
    },
    {
      title: 'Total Users',
      value: analyticsData?.totalUsers?.toLocaleString() || '0',
      change: `+${analyticsData?.userGrowth || 0}%`,
      changeType: 'positive',
      icon: Users,
      color: 'blue',
      trend: [120, 150, 180, 200, 250, 300, 350]
    },
    {
      title: 'Page Views',
      value: `${analyticsData?.pageViews?.toLocaleString() || '0'}`,
      change: `+${analyticsData?.pageViewGrowth || 0}%`,
      changeType: 'positive',
      icon: Eye,
      color: 'purple',
      trend: [2000, 2500, 2200, 2800, 3200, 3500, 4000]
    },
    {
      title: 'Conversion Rate',
      value: `${analyticsData?.conversionRate || 0}%`,
      change: `+${analyticsData?.conversionGrowth || 0}%`,
      changeType: 'positive',
      icon: Target,
      color: 'orange',
      trend: [2.1, 2.3, 2.5, 2.7, 2.9, 3.0, 3.2]
    }
  ];

  const systemMetrics = [
    { label: 'CPU Usage', value: '45%', status: 'good', icon: Cpu, color: 'green' },
    { label: 'Memory', value: '2.1GB / 8GB', status: 'good', icon: Database, color: 'green' },
    { label: 'Disk Space', value: '156GB / 500GB', status: 'warning', icon: HardDrive, color: 'yellow' },
    { label: 'Network', value: '98%', status: 'excellent', icon: Wifi, color: 'green' }
  ];

  const trafficColumns = [
    {
      key: 'source',
      title: 'Traffic Source',
      dataIndex: 'source',
      render: (value: string) => (
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
          <span className="font-medium">{value}</span>
        </div>
      )
    },
    {
      key: 'visitors',
      title: 'Visitors',
      dataIndex: 'visitors',
      render: (value: number) => (
        <span className="font-medium">{value.toLocaleString()}</span>
      ),
      sorter: true
    },
    {
      key: 'sessions',
      title: 'Sessions',
      dataIndex: 'sessions',
      render: (value: number) => (
        <span className="text-gray-600">{value.toLocaleString()}</span>
      ),
      sorter: true
    },
    {
      key: 'bounceRate',
      title: 'Bounce Rate',
      dataIndex: 'bounceRate',
      render: (value: number) => (
        <div className="flex items-center space-x-2">
          <div className="w-16 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-red-500 h-2 rounded-full" 
              style={{ width: `${value}%` }}
            />
          </div>
          <span className="text-sm font-medium">{value}%</span>
        </div>
      ),
      sorter: true
    },
    {
      key: 'conversionRate',
      title: 'Conversion',
      dataIndex: 'conversionRate',
      render: (value: number) => (
        <div className="flex items-center space-x-2">
          <div className="w-16 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full" 
              style={{ width: `${value}%` }}
            />
          </div>
          <span className="text-sm font-medium">{value}%</span>
        </div>
      ),
      sorter: true
    },
    {
      key: 'revenue',
      title: 'Revenue',
      dataIndex: 'revenue',
      render: (value: number) => (
        <span className="font-medium text-green-600">${value.toLocaleString()}</span>
      ),
      sorter: true
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <Badge variant="success" className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>Live Data</span>
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
              <option value="1y">Last Year</option>
            </select>
            <Button variant="outline" onClick={handleExport} className="flex items-center space-x-2">
              <Download className="h-4 w-4" />
              <span>Export</span>
            </Button>
            <Button variant="outline" className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {keyMetrics.map((metric, index) => (
            <Card key={index} className="p-6 hover:shadow-lg transition-all duration-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 mb-1">{metric.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mb-2">{metric.value}</p>
                  <div className="flex items-center">
                    {metric.changeType === 'positive' ? (
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-sm font-medium ml-1 ${
                      metric.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {metric.change}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">vs last period</span>
                  </div>
                </div>
                <div className={`p-3 rounded-xl bg-${metric.color}-100`}>
                  <metric.icon className={`h-6 w-6 text-${metric.color}-600`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Revenue Overview</h3>
              <div className="flex items-center space-x-2">
                <Badge variant="success">+12.5%</Badge>
              </div>
            </div>
            <div className="h-80">
              <Chart
                data={salesData}
                type="area"
                dataKey="revenue"
                nameKey="month"
                height={300}
                colors={['#3B82F6']}
                gradient={true}
              />
            </div>
          </Card>
          
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">User Growth</h3>
              <div className="flex items-center space-x-2">
                <Badge variant="info">+8.2%</Badge>
              </div>
            </div>
            <div className="h-80">
              <MultiSeriesChart
                data={salesData}
                type="line"
                series={[
                  { dataKey: 'users', name: 'Users', color: '#10B981' },
                  { dataKey: 'sessions', name: 'Sessions', color: '#F59E0B' }
                ]}
                height={300}
              />
            </div>
          </Card>
        </div>

        {/* Traffic Sources and Device Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Traffic Sources</h3>
              <Button variant="outline" size="sm">View All</Button>
            </div>
            <DataTable
              data={trafficData}
              columns={trafficColumns}
              pagination={false}
              size="small"
              bordered={false}
              striped={true}
              hoverable={true}
            />
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Device Analytics</h3>
              <Button variant="outline" size="sm">View All</Button>
            </div>
            <div className="space-y-4">
              {deviceData.map((device, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      device.device === 'Desktop' ? 'bg-blue-100' :
                      device.device === 'Mobile' ? 'bg-green-100' : 'bg-yellow-100'
                    }`}>
                      {device.device === 'Desktop' ? <Monitor className="h-5 w-5 text-blue-600" /> :
                       device.device === 'Mobile' ? <Smartphone className="h-5 w-5 text-green-600" /> :
                       <Tablet className="h-5 w-5 text-yellow-600" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{device.device}</p>
                      <p className="text-sm text-gray-600">{device.visitors.toLocaleString()} visitors</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{device.percentage}%</p>
                    <p className="text-xs text-gray-500">{device.conversionRate}% conversion</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Conversion Funnel */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Conversion Funnel</h3>
            <Button variant="outline" size="sm" className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <span>Filter</span>
            </Button>
          </div>
          <div className="space-y-4">
            {conversionFunnel.map((step, index) => (
              <div key={index} className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">{index + 1}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">{step.step}</span>
                    <span className="text-sm text-gray-600">{step.rate}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${step.rate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                    <span>{step.visitors.toLocaleString()} visitors</span>
                    <span>{step.conversions.toLocaleString()} conversions</span>
                    <span className="text-red-500">{step.dropoff}% dropoff</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Real-time Activity and System Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Real-time Activity</h3>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-gray-600">Live</span>
              </div>
            </div>
            {realTimeData && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{realTimeData.activeUsers}</div>
                    <div className="text-sm text-gray-600">Active Users</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{realTimeData.pageViews}</div>
                    <div className="text-sm text-gray-600">Page Views/min</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{realTimeData.conversions}</div>
                    <div className="text-sm text-gray-600">Conversions/min</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900">Top Pages</h4>
                  {realTimeData.topPages.map((page, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{page.page}</span>
                      <span className="font-medium">{page.views} views</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">System Status</h3>
              <Button variant="outline" size="sm" className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Configure</span>
              </Button>
            </div>
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
        </div>

        {/* Geographic Analytics */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Geographic Analytics</h3>
            <Button variant="outline" size="sm">View All Countries</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {geographicData.map((country, index) => (
              <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">{country.flag}</div>
                  <div>
                    <p className="font-medium text-gray-900">{country.country}</p>
                    <p className="text-sm text-gray-600">{country.visitors.toLocaleString()} visitors</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">${country.revenue.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{country.conversionRate}% conversion</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export { AnalyticsPage };