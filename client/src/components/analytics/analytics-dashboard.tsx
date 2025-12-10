import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SEO, seoConfig, generateStructuredData } from '@/lib/seo-optimization'
import { TrendingUp, Users, Eye, Heart, Share, ArrowUpRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { SkeletonDashboardStats, SkeletonAnalyticsChart, SkeletonMetricCard } from '@/components/ui/skeleton'

const performanceData = [
  { date: 'Sep 24', score: 50 },
  { date: 'Nov 24', score: 40 },
  { date: '2025', score: 45 },
  { date: 'Mar 25', score: 380 },
  { date: 'May 25', score: 420 },
]

const socialMetrics = [
  { platform: 'Facebook', followers: '12.5K', engagement: '+5.2%', color: 'bg-blue-600' },
  { platform: 'Instagram', followers: '8.3K', engagement: '+12.8%', color: 'bg-pink-500' },
  { platform: 'Twitter', followers: '3.2K', engagement: '-2.1%', color: 'bg-sky-500' },
  { platform: 'LinkedIn', followers: '1.8K', engagement: '+8.4%', color: 'bg-blue-700' },
]

interface AnalyticsDashboardProps {
  isLoading?: boolean
  isFetching?: boolean
}

export function AnalyticsDashboard({ isLoading = false, isFetching = false }: AnalyticsDashboardProps) {
  // Show full skeleton during initial load
  if (isLoading) {
    return (
      <>
        <SEO 
          {...seoConfig.analytics}
          structuredData={generateStructuredData.softwareApplication()}
        />
        <div className="space-y-6">
          <SkeletonDashboardStats />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkeletonAnalyticsChart />
            <SkeletonAnalyticsChart />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <SEO 
        {...seoConfig.analytics}
        structuredData={generateStructuredData.softwareApplication()}
      />
      <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isFetching ? (
          <>
            <SkeletonMetricCard />
            <SkeletonMetricCard />
            <SkeletonMetricCard />
            <SkeletonMetricCard />
          </>
        ) : (
          <>
        <Card className="border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Followers</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">25.8K</p>
                <div className="flex items-center text-green-600 dark:text-green-400 text-sm mt-1">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>+12.5%</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Reach</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">847K</p>
                <div className="flex items-center text-green-600 dark:text-green-400 text-sm mt-1">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>+8.2%</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <Eye className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Engagement Rate</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">4.7%</p>
                <div className="flex items-center text-red-600 dark:text-red-400 text-sm mt-1">
                  <ArrowUpRight className="w-4 h-4 mr-1 rotate-180" />
                  <span>-0.3%</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Heart className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Posts This Month</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">24</p>
                <div className="flex items-center text-green-600 dark:text-green-400 text-sm mt-1">
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  <span>+9 from last month</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Share className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>

      {/* Performance Score */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gray-200 dark:border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Social performance score</CardTitle>
              <Button variant="outline" size="sm">
                View social score and insights
              </Button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This score sums up how your content performs across your Facebook Pages, Instagram 
              Business, and LinkedIn Pages accounts. Dive in for more data and AI-driven insights to 
              refine your strategy.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-baseline space-x-4">
                <span className="text-4xl font-bold text-blue-600 dark:text-blue-400">183</span>
                <span className="text-gray-500 dark:text-gray-400">/ 1,000</span>
                <div className="flex items-center text-red-600 dark:text-red-400 text-sm">
                  <TrendingUp className="w-4 h-4 mr-1 rotate-180" />
                  <span>-12</span>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Doing great!</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Schedule a few posts each week to increase your activity and engagement.
                </p>
              </div>

              {/* Score History Chart */}
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-gray-700" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social Impact */}
        <Card className="border-gray-200 dark:border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your social impact at a glance</CardTitle>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-blue-600 rounded"></div>
                <div className="w-6 h-6 bg-pink-500 rounded"></div>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              See the combined impact of your social accounts, then explore reports 
              for deeper insights.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {socialMetrics.map((metric, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded ${metric.color}`}></div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{metric.platform}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{metric.followers} followers</div>
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${
                    metric.engagement.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {metric.engagement}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  )
}