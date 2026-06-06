import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher';
import { apiRequest } from '@/lib/queryClient';
import { 
  Activity, TrendingUp, AlertTriangle, Lightbulb, MessageSquare, 
  Search, Bot, Plus, Zap, ArrowUpRight, ArrowDownRight, Globe, ExternalLink, Heart, MessageCircle, Settings, Target, RefreshCw, Loader2
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, LineChart, Line
} from 'recharts';

export default function SocialListeningPage() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useCurrentWorkspace();
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);

  const [isNicheDialogOpen, setIsNicheDialogOpen] = useState(false);
  const [nicheInput, setNicheInput] = useState('');

  const { data: userData, refetch: refetchUser } = useQuery({
    queryKey: ['social-listening-user-profile'],
    queryFn: async () => await apiRequest('/api/v1/user')
  });

  const resolvedUser = userData?.data || userData?.user || null;

  const updateNicheMutation = useMutation({
    mutationFn: async (niche: string) => {
      return await apiRequest('/api/v1/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche })
      });
    },
    onSuccess: () => {
      refetchUser();
      setIsNicheDialogOpen(false);
    }
  });

  const userNiche = resolvedUser?.niche || 'Not Set';

  const fetchLiveMutation = useMutation({
    mutationFn: async () => {
      if (!currentWorkspace?.id) throw new Error('No workspace');
      return await apiRequest(`/api/social-listening/fetch-live/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`, {
        method: 'POST'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['social-listening-overview', currentWorkspace?.id] });
      queryClient.invalidateQueries({ queryKey: ['social-listening-timeline', currentWorkspace?.id] });
      queryClient.invalidateQueries({ queryKey: ['social-listening-clusters', currentWorkspace?.id] });
      queryClient.invalidateQueries({ queryKey: ['social-listening-hooks', currentWorkspace?.id] });
      queryClient.invalidateQueries({ queryKey: ['social-listening-posts', currentWorkspace?.id] });
    }
  });

  // 1. Dashboard Overview
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['social-listening-overview', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { data: null };
      return await apiRequest(`/api/social-listening/dashboard/overview/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);
    },
    enabled: !!currentWorkspace?.id
  });

  // 2. Sentiment Timeline
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ['social-listening-timeline', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { timeline: [] };
      return await apiRequest(`/api/social-listening/dashboard/sentiment-timeline/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);
    },
    enabled: !!currentWorkspace?.id
  });

  // 3. Topic Clusters (Radar)
  const { data: clusterData, isLoading: clusterLoading } = useQuery({
    queryKey: ['social-listening-clusters', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { clusters: [] };
      return await apiRequest(`/api/social-listening/dashboard/topic-clusters/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);
    },
    enabled: !!currentWorkspace?.id
  });

  // 4. Extracted Insights (Hooks & Pain Points)
  const { data: hooksData, isLoading: hooksLoading } = useQuery({
    queryKey: ['social-listening-hooks', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { hooks: [], painPoints: [] };
      return await apiRequest(`/api/social-listening/dashboard/viral-hooks/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);
    },
    enabled: !!currentWorkspace?.id
  });

  // 5. Live Posts Feed
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['social-listening-posts', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { posts: [] };
      return await apiRequest(`/api/social-listening/posts/${currentWorkspace.id}?niche=${encodeURIComponent(userNiche)}`);
    },
    enabled: !!currentWorkspace?.id
  });

  // 6. Chat Assistant Mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest(`/api/social-listening/chat/${currentWorkspace?.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context: { userNiche, currentTrends: clusters, hooks, painPoints } })
      });
    },
    onSuccess: (data) => {
      if (data.reply) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    }
  });

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    setChatHistory(prev => [...prev, { role: 'user', content: chatMessage }]);
    chatMutation.mutate(chatMessage);
    setChatMessage('');
  };

  const overview = overviewData?.data || null;
  const timeline = timelineData?.timeline || [];
  const clusters = clusterData?.clusters || [];
  const hooks = hooksData?.hooks || [];
  const painPoints = hooksData?.painPoints || [];
  const posts = postsData?.posts || [];

  const sparklineData = timeline.length > 0 ? timeline : [];

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8 bg-slate-50 dark:bg-[#030712] min-h-screen text-slate-900 dark:text-slate-50 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-sm">
            Social Intelligence
          </h1>
          <div className="flex items-center mt-2 gap-3">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium tracking-wide uppercase">Real-time audience analytics</p>
            <Dialog open={isNicheDialogOpen} onOpenChange={(open) => {
              setIsNicheDialogOpen(open);
              if (open) setNicheInput(resolvedUser?.niche || '');
            }}>
              <DialogTrigger asChild>
                <Badge variant="outline" className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 px-3 py-1 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10">
                  <Target className="w-3.5 h-3.5" />
                  Niche: {userNiche}
                  <Settings className="w-3 h-3 ml-1 opacity-70" />
                </Badge>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Configure Target Niche</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <p className="text-sm text-slate-500">
                    Set your specific industry or audience niche. The AI Intelligence Assistant and data extraction will be tailored to track signals relevant to this niche.
                  </p>
                  <Input 
                    value={nicheInput} 
                    onChange={e => setNicheInput(e.target.value)} 
                    placeholder="e.g. Real Estate Automation, Fitness Tech..." 
                  />
                  <Button 
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" 
                    onClick={() => updateNicheMutation.mutate(nicheInput.trim())}
                    disabled={updateNicheMutation.isPending || !nicheInput.trim()}
                  >
                    {updateNicheMutation.isPending ? 'Saving...' : 'Save Niche Preferences'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative group flex-1 md:flex-none shadow-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <Input 
              type="search" 
              placeholder="Search global network..." 
              className="w-full md:w-[280px] pl-9 h-10 bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200 placeholder:text-slate-400 focus-visible:ring-indigo-500 rounded-lg shadow-sm transition-all" 
            />
          </div>
          <Button 
            variant="default" 
            className="h-10 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 text-white font-semibold transition-all disabled:opacity-50"
            onClick={() => fetchLiveMutation.mutate()}
            disabled={fetchLiveMutation.isPending || userNiche === 'Not Set'}
          >
            {fetchLiveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Live Data
          </Button>
        </div>
      </div>

      {/* Grid Layout: 12 Columns */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Top 4 Overview Cards (Span 3 each) */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {sparklineData.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-16 opacity-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <Area type="monotone" dataKey="positive" stroke="#6366f1" fill="#6366f1" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Mentions</p>
                  <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tighter">
                    {overview?.totalMentions?.toLocaleString() || '0'}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-inner">
                  <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 w-fit px-2 py-1 rounded-md">
                Niche-filtered only
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            {sparklineData.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-16 opacity-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <Area type="step" dataKey="negative" stroke="#a855f7" fill="#a855f7" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Active Trends</p>
                  <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tighter">
                    {overview?.activeTrends || '0'}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center border border-purple-100 dark:border-purple-500/20 shadow-inner">
                  <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 w-fit px-2 py-1 rounded-md">
                <Zap className="w-3 h-3 mr-1" /> Based on niche matches
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Overall Sentiment</p>
                  <div className={`text-3xl font-extrabold tracking-tighter mt-1 ${(overview?.averageSentiment || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {(overview?.averageSentiment || 0) > 0.2 ? 'Positive' : (overview?.averageSentiment || 0) < -0.2 ? 'Negative' : 'Neutral'}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-inner">
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="mt-5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{width: `${Math.max(0, 50 + (overview?.averageSentiment || 0) * 50)}%`}}></div>
                <div className="bg-rose-500 h-full" style={{width: `${Math.max(0, 50 - (overview?.averageSentiment || 0) * 50)}%`}}></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Risk Factors</p>
                  <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tighter">
                    {overview?.topPainPoints || '0'}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center border border-rose-100 dark:border-rose-500/20 shadow-inner">
                  <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
              </div>
              <div className={`mt-4 flex items-center text-xs font-semibold w-fit px-2 py-1 rounded-md ${overview?.topPainPoints > 0 ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
                {overview?.topPainPoints > 0 ? 'Requires attention' : 'Audience is stable'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle Row: Trend Radar (Span 8) & Live Feed (Span 4) */}
        <div className="col-span-12 lg:col-span-8">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-md flex flex-col h-[400px]">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30 px-6 py-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-extrabold flex items-center text-slate-900 dark:text-white">
                  <Globe className="w-5 h-5 text-indigo-500 mr-2" />
                  Topic Velocity Matrix
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 text-xs font-medium mt-1">Growth velocity plotted against total engagement volume</CardDescription>
              </div>
              <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20 px-3 py-1 animate-pulse shadow-sm shadow-indigo-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2" /> Live
              </Badge>
            </CardHeader>
            <CardContent className="flex-1 p-6 flex flex-col justify-center relative">
              {clusterLoading ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : clusters.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" opacity={0.6} />
                    <XAxis type="number" dataKey="volume" name="Volume" stroke="currentColor" className="text-slate-400 dark:text-slate-500" tick={{fontSize: 12}} tickLine={false} axisLine={false} domain={[0, 'dataMax + 20']} />
                    <YAxis type="number" dataKey="velocity" name="Velocity" stroke="currentColor" className="text-slate-400 dark:text-slate-500" tick={{fontSize: 12}} tickLine={false} axisLine={false} />
                    <ZAxis type="number" dataKey="volume" range={[200, 800]} name="Engagement" />
                    <RechartsTooltip cursor={{ strokeDasharray: '3 3', stroke: '#6366f1' }} content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)]">
                            <p className="text-slate-900 dark:text-white font-extrabold mb-3 flex items-center border-b border-slate-100 dark:border-slate-800 pb-2"><Zap className="w-4 h-4 text-amber-500 mr-2"/> {data.topic}</p>
                            <p className="text-slate-600 dark:text-slate-300 text-sm flex justify-between gap-6 mb-1"><span className="font-medium text-slate-500 dark:text-slate-400">Mentions:</span> <span className="font-bold text-slate-900 dark:text-white">{data.volume}</span></p>
                            <p className="text-slate-600 dark:text-slate-300 text-sm flex justify-between gap-6"><span className="font-medium text-slate-500 dark:text-slate-400">Velocity:</span> <span className="font-bold text-emerald-600 dark:text-emerald-400">+{data.velocity}%</span></p>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Scatter name="Topics" data={clusters} fill="#6366f1" fillOpacity={0.8} shape="circle" className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)] cursor-pointer hover:fill-indigo-400 transition-colors" />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full opacity-50">
                  <TrendingUp className="w-12 h-12 text-slate-400 mb-4" />
                  <p className="text-slate-500 font-medium">Awaiting data signals...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-md flex flex-col h-[400px] overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/30 px-6 py-4">
              <CardTitle className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center">
                <Activity className="w-5 h-5 text-rose-500 mr-2" /> Live Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-y-auto custom-scrollbar">
              {postsLoading ? (
                 <div className="p-6 space-y-4">
                   {[1,2,3].map(i => <div key={i} className="animate-pulse flex space-x-4"><div className="rounded-full bg-slate-200 dark:bg-slate-800 h-8 w-8"></div><div className="flex-1 space-y-2 py-1"><div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div><div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2"></div></div></div>)}
                 </div>
              ) : posts.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {posts.slice(0, 10).map((post: any) => (
                    <div key={post._id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${post.platform.toLowerCase() === 'youtube' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'}`}>
                            {post.platform}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            @{post.author?.username || 'anonymous'}
                          </span>
                        </div>
                        <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-indigo-500 transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed font-medium group-hover:text-slate-900 dark:group-hover:text-white transition-colors mb-3">
                        "{post.content}"
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          {post.aiMetadata?.topics?.slice(0,2).map((t: string) => (
                            <span key={t} className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">#{t}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                          <span className="flex items-center"><Heart className="w-3 h-3 mr-1"/> {post.metrics?.likes || 0}</span>
                          <span className="flex items-center"><MessageCircle className="w-3 h-3 mr-1"/> {post.metrics?.comments || 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 font-medium text-sm mt-10">No live signals fetched.</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row: Audience Mood (6) | Viral Opportunities (3) | Assistant (3) */}
        <div className="col-span-12 lg:col-span-5">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-md overflow-hidden h-[380px] flex flex-col">
            <CardHeader className="pb-2 px-6 pt-5">
              <CardTitle className="text-lg font-extrabold flex items-center text-slate-900 dark:text-white">
                <Activity className="w-5 h-5 mr-2 text-emerald-500" /> Audience Mood History
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-6 pt-2">
              <div className="h-full w-full relative">
                {timelineLoading ? (
                   <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /></div>
                ) : timeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" opacity={0.5} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} stroke="currentColor" className="text-slate-400 dark:text-slate-500" tick={{fontSize: 11, fontWeight: 500}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} stroke="currentColor" className="text-slate-400 dark:text-slate-500" tick={{fontSize: 11, fontWeight: 500}} />
                      <RechartsTooltip contentStyle={{backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)'}} itemStyle={{fontWeight: 700}} />
                      <Area type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPos)" />
                      <Area type="monotone" dataKey="negative" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorNeg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Activity className="w-10 h-10 mb-3 opacity-30" />
                    <p className="font-medium text-sm">No historical data available.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <Card className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border-slate-200 dark:border-slate-800 shadow-md overflow-hidden h-[380px] flex flex-col">
            <CardHeader className="pb-4 px-6 pt-5 border-b border-slate-100 dark:border-slate-800/50">
              <CardTitle className="text-lg font-extrabold flex items-center text-slate-900 dark:text-white">
                <Lightbulb className="w-5 h-5 mr-2 text-amber-500" /> Viral Hooks
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-y-auto custom-scrollbar">
              <div className="p-4 space-y-3">
                {hooksLoading ? (
                  <div className="animate-pulse space-y-4"><div className="h-16 bg-slate-100 dark:bg-slate-800 rounded-xl"></div></div>
                ) : hooks.length > 0 ? hooks.map((hook: any, i: number) => (
                  <div key={i} className="group relative flex flex-col p-4 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 shadow-sm hover:shadow-md transition-all cursor-pointer">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">"{hook.content}"</p>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="secondary" className="text-[10px] h-5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                        Score: {hook.score}
                      </Badge>
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 transition-colors">Use Hook</span>
                    </div>
                  </div>
                )) : <p className="text-sm text-slate-500 text-center mt-8">No hooks detected.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-3">
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-slate-950/60 backdrop-blur-xl border border-indigo-100 dark:border-indigo-500/20 shadow-lg overflow-hidden flex flex-col h-[380px] relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl rounded-full -mr-10 -mt-10" />
            <CardHeader className="pb-3 px-5 pt-5 z-10">
              <CardTitle className="text-base font-extrabold flex items-center text-slate-900 dark:text-white">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center mr-2 shadow-lg shadow-indigo-500/30">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                AI Analyst
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-4 flex flex-col justify-between overflow-hidden z-10">
              <div className="flex-1 overflow-y-auto mb-3 pr-1 custom-scrollbar">
                <div className="space-y-3">
                  {chatHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-2 mt-4">
                      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center mb-4 shadow-sm border border-slate-200 dark:border-slate-800">
                        <Zap className="w-6 h-6 text-amber-500" />
                      </div>
                      <p className="text-xs text-slate-600 dark:text-indigo-200/70 font-semibold leading-relaxed">
                        What should we analyze today?
                      </p>
                    </div>
                  ) : (
                    chatHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-xs font-medium leading-relaxed shadow-sm ${
                          msg.role === 'user' 
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-sm' 
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))
                  )}
                  {chatMutation.isPending && (
                    <div className="flex justify-start">
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center space-x-1.5 shadow-sm">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <form onSubmit={handleChatSubmit} className="relative mt-auto">
                <Input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask a question..."
                  className="pr-10 bg-white dark:bg-slate-900/80 backdrop-blur-md border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:ring-indigo-500 rounded-xl h-10 text-xs font-medium shadow-inner transition-all"
                  disabled={chatMutation.isPending}
                />
                <Button 
                  type="submit" 
                  size="icon"
                  className="absolute right-1 top-1 h-8 w-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
                  disabled={chatMutation.isPending || !chatMessage.trim()}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
