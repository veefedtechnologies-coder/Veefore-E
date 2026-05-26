import React, { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { 
  TrendingUp, 
  Search, 
  Filter, 
  BarChart3, 
  Eye, 
  MessageCircle, 
  Hash,
  Globe,
  Clock,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Activity
} from 'lucide-react'

export function Listening() {
  const [selectedCategory, setSelectedCategory] = useState('Business and Finance')
  const [searchTerm, setSearchTerm] = useState('')

  const trendingTopics = [
    {
      title: 'ETH Price Predictions Surge',
      category: 'Cryptocurrency',
      sentiment: 'positive',
      mentions: '12.3K',
      growth: '+45%',
      engagement: '4.7K',
      description: 'Sentiment surrounding Ethereum is overwhelmingly bullish with many predicting significant price increases...',
      hashtags: ['#ETH', '#Ethereum', '#Crypto', '#BullRun'],
      trending: 'up',
      urgency: 'high'
    },
    {
      title: 'AI Development Breakthrough',
      category: 'Technology',
      sentiment: 'positive',
      mentions: '8.7K',
      growth: '+23%',
      engagement: '3.2K',
      description: 'Major tech companies announce breakthrough in artificial intelligence capabilities...',
      hashtags: ['#AI', '#Technology', '#Innovation', '#Future'],
      trending: 'up',
      urgency: 'medium'
    },
    {
      title: 'Sustainable Fashion Movement',
      category: 'Lifestyle',
      sentiment: 'positive',
      mentions: '6.1K',
      growth: '+18%',
      engagement: '2.8K',
      description: 'Growing awareness about sustainable fashion practices gains momentum across social platforms...',
      hashtags: ['#SustainableFashion', '#EcoFriendly', '#Fashion', '#Sustainability'],
      trending: 'up',
      urgency: 'low'
    }
  ]

  const categories = [
    'Business and Finance',
    'Technology',
    'Health & Wellness',
    'Entertainment',
    'Lifestyle',
    'Sports',
    'Politics'
  ]

  return (
    <Card className="bg-white dark:bg-gray-800 shadow-lg border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
      <CardContent className="p-0">
        {/* Enhanced Header */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-b border-gray-100 dark:border-gray-600">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Social Listening</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Real-time trend analysis</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-700 dark:hover:text-blue-300">
              <BarChart3 className="w-4 h-4 mr-2" />
              See insights
            </Button>
          </div>

          {/* Live Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-white/50 dark:border-gray-600/50">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Monitoring</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">247</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Keywords</div>
            </div>
            
            <div className="bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-white/50 dark:border-gray-600/50">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Mentions</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">1.2M</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Last 24h</div>
            </div>
            
            <div className="bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg p-3 border border-white/50 dark:border-gray-600/50">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Alerts</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">12</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Active</div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs defaultValue="trending" className="w-full">
          <TabsList className="w-full bg-gray-50 dark:bg-gray-700 p-1 m-0 rounded-none border-b dark:border-gray-600">
            <TabsTrigger value="trending" className="flex-1">Trending</TabsTrigger>
            <TabsTrigger value="search" className="flex-1">Search</TabsTrigger>
            <TabsTrigger value="alerts" className="flex-1">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="trending" className="mt-0">
            <div className="p-6">
              {/* Category Filter */}
              <div className="mb-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Filter className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Interest Category</span>
                </div>
                <select 
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* Trending Topics */}
              <div className="space-y-4">
                {trendingTopics.map((topic, index) => (
                  <div key={index} className="bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-700 dark:to-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-600 hover:shadow-lg transition-all duration-300 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h5 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{topic.title}</h5>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${
                              topic.urgency === 'high' ? 'bg-red-100 text-red-700' :
                              topic.urgency === 'medium' ? 'bg-orange-100 text-orange-700' :
                              'bg-green-100 text-green-700'
                            }`}
                          >
                            {topic.urgency} priority
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                          {topic.description}
                        </p>
                        
                        {/* Hashtags */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          {topic.hashtags.map((hashtag, idx) => (
                            <span key={idx} className="inline-flex items-center space-x-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                              <Hash className="w-3 h-3" />
                              <span>{hashtag.replace('#', '')}</span>
                            </span>
                          ))}
                        </div>

                        {/* Metrics */}
                        <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center space-x-2">
                            <MessageCircle className="w-4 h-4" />
                            <span className="font-medium">{topic.mentions}</span>
                            <span>mentions</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Eye className="w-4 h-4" />
                            <span className="font-medium">{topic.engagement}</span>
                            <span>engagement</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {topic.trending === 'up' ? (
                              <ArrowUp className="w-4 h-4 text-green-600" />
                            ) : (
                              <ArrowDown className="w-4 h-4 text-red-600" />
                            )}
                            <span className={`font-medium ${topic.trending === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                              {topic.growth}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                                             <Button 
                         size="sm" 
                         className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:text-blue-100 opacity-0 group-hover:opacity-100 transition-opacity"
                       >
                         Create post
                       </Button>
                    </div>

                    {/* Trend Progress */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Trend momentum</span>
                        <span className="text-xs text-gray-500 dark:text-gray-500">{topic.growth} in 24h</span>
                      </div>
                      <Progress 
                        value={parseInt(topic.growth.replace('+', '').replace('%', ''))} 
                        className="h-2"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="search" className="mt-0">
            <div className="p-6">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Advanced Search</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Deep dive into topics, companies, hashtags, and competitor analysis
              </p>
              
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Search keywords, hashtags, or @mentions"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                                     <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 hover:text-blue-100">
                     <Search className="w-4 h-4 mr-2" />
                     Search
                   </Button>
                </div>

                {/* Quick Search Suggestions */}
                <div className="grid grid-cols-2 gap-3">
                  {['#AI', '#Crypto', '@competitor', 'trending now'].map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="p-3 text-left bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors"
                      onClick={() => setSearchTerm(suggestion)}
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{suggestion}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Quick search</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="mt-0">
            <div className="p-6">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Smart Alerts</h4>
              
                             <div className="space-y-4">
                 <div className="flex items-center space-x-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 rounded-lg">
                   <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                   <div className="flex-1">
                     <div className="text-sm font-medium text-red-900 dark:text-red-100">Brand mention spike</div>
                     <div className="text-xs text-red-700 dark:text-red-300">345% increase in mentions detected</div>
                   </div>
                   <Badge className="bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300">High</Badge>
                 </div>

                 <div className="flex items-center space-x-3 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-600 rounded-lg">
                   <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                   <div className="flex-1">
                     <div className="text-sm font-medium text-green-900 dark:text-green-100">Positive sentiment trend</div>
                     <div className="text-xs text-green-700 dark:text-green-300">Brand sentiment improved by 23%</div>
                   </div>
                   <Badge className="bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300">Good</Badge>
                 </div>

                 <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-600 rounded-lg">
                   <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                   <div className="flex-1">
                     <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Keyword opportunity</div>
                     <div className="text-xs text-blue-700 dark:text-blue-300">New trending keyword in your industry</div>
                   </div>
                   <Badge className="bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300">Medium</Badge>
                 </div>
               </div>

                             <Button variant="outline" className="w-full mt-6 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 hover:text-indigo-700 dark:hover:text-indigo-400">
                 Configure alert settings
               </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Real-time Activity Footer */}
        <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Live monitoring active</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Updated 30s ago</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}