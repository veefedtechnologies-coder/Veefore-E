import fs from 'fs';
import path from 'path';

const content = `import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Badge } from '@components/ui/badge';
import { useCurrentWorkspace } from '@hooks/useCurrentWorkspace';
import { apiRequest } from '@lib/queryClient';
import { 
  Activity, TrendingUp, AlertTriangle, Lightbulb, MessageSquare, 
  Search, Bot, Plus, Zap, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

export default function SocialListeningPage() {
  const { currentWorkspace } = useCurrentWorkspace();
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);

  // 1. Dashboard Overview
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['social-listening-overview', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { data: null };
      const res = await apiRequest(\`/api/social-listening/dashboard/overview/\${currentWorkspace.id}\`);
      return res;
    },
    enabled: !!currentWorkspace?.id
  });

  // 2. Sentiment Timeline
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ['social-listening-timeline', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { timeline: [] };
      const res = await apiRequest(\`/api/social-listening/dashboard/sentiment-timeline/\${currentWorkspace.id}\`);
      return res;
    },
    enabled: !!currentWorkspace?.id
  });

  // 3. Topic Clusters (Radar)
  const { data: clusterData, isLoading: clusterLoading } = useQuery({
    queryKey: ['social-listening-clusters', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { clusters: [] };
      const res = await apiRequest(\`/api/social-listening/dashboard/topic-clusters/\${currentWorkspace.id}\`);
      return res;
    },
    enabled: !!currentWorkspace?.id
  });

  // 4. Extracted Insights (Hooks & Pain Points)
  const { data: hooksData, isLoading: hooksLoading } = useQuery({
    queryKey: ['social-listening-hooks', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return { hooks: [], painPoints: [] };
      const res = await apiRequest(\`/api/social-listening/dashboard/viral-hooks/\${currentWorkspace.id}\`);
      return res;
    },
    enabled: !!currentWorkspace?.id
  });

  // 5. Chat Assistant Mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest(\`/api/social-listening/chat/\${currentWorkspace?.id}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context: { currentTrends: clusters, hooks, painPoints } })
      });
      return res;
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

  const handleAddSource = async () => {
    await apiRequest('/api/social-listening/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: currentWorkspace?.id,
        platform: 'reddit',
        keywords: ['creator economy', 'content creation'],
        isActive: true
      })
    });
    // Optimistic UI or refetch logic would go here
    alert('Mock source added! Real integration pending.');
  }

  const overview = overviewData?.data || null;
  const timeline = timelineData?.timeline || [];
  const clusters = clusterData?.clusters || [];
  const hooks = hooksData?.hooks || [];
  const painPoints = hooksData?.painPoints || [];

  return (
    <div className="flex-1 space-y-8 p-8 bg-[#030712] min-h-screen text-slate-50 font-sans">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-sm">
            Social Intelligence
          </h1>
          <p className="text-slate-400 mt-2 text-lg font-medium">AI-powered audience pain point extraction and real-time trend radar.</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative group flex-1 md:flex-none">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <Input 
              type="search" 
              placeholder="Search insights..." 
              className="w-full md:w-[300px] pl-10 h-11 bg-slate-900/50 border-slate-800 text-slate-200 placeholder:text-slate-500 focus-visible:ring-indigo-500 rounded-xl backdrop-blur-xl transition-all" 
            />
          </div>
          <Button variant="default" onClick={handleAddSource} className="h-11 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/20 text-white font-medium transition-all hover:scale-[1.02]">
            <Plus className="w-5 h-5 mr-2" /> Add Source
          </Button>
        </div>
      </div>

      {/* Top Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="bg-slate-900/40 backdrop-blur-xl border-slate-800/50 hover:bg-slate-900/60 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">Total Mentions</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="text-4xl font-bold text-white">{overview?.totalMentions?.toLocaleString() || '0'}</div>
              {overview?.totalMentions > 0 && (
                <div className="flex items-center text-emerald-400 text-sm font-medium mb-1 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  <ArrowUpRight className="w-3 h-3 mr-1" /> 12%
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">Across tracked sources</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur-xl border-slate-800/50 hover:bg-slate-900/60 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/10 overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">Active Trends</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="text-4xl font-bold text-white">{overview?.activeTrends || '0'}</div>
              {overview?.activeTrends > 0 && (
                <div className="flex items-center text-emerald-400 text-sm font-medium mb-1 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  <ArrowUpRight className="w-3 h-3 mr-1" /> 3 new
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">Currently emerging topics</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur-xl border-slate-800/50 hover:bg-slate-900/60 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/10 overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">Audience Sentiment</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className={\`text-3xl font-bold \${(overview?.averageSentiment || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}\`}>
                {(overview?.averageSentiment || 0) > 0.2 ? 'Positive' : (overview?.averageSentiment || 0) < -0.2 ? 'Negative' : 'Neutral'}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">Score: {(overview?.averageSentiment || 0).toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur-xl border-slate-800/50 hover:bg-slate-900/60 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/10 overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-400">Top Pain Point</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={\`text-xl font-bold leading-tight \${overview?.topPainPoints > 0 ? 'text-rose-400' : 'text-slate-300'}\`}>
              {overview?.topPainPoints > 0 ? \`\${overview.topPainPoints} Critical Issues\` : 'No Critical Issues'}
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">Requires immediate attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Middle Area: Radar & Chat */}
      <div className="grid gap-6 md:grid-cols-[60%_40%]">
        
        {/* Trend Radar */}
        <Card className="bg-slate-900/40 backdrop-blur-xl border-slate-800/50 shadow-xl overflow-hidden flex flex-col h-[450px]">
          <CardHeader className="border-b border-slate-800/50 bg-slate-900/50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center text-white">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center mr-3">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                  </div>
                  Trend Radar
                </CardTitle>
                <CardDescription className="text-slate-400 ml-11">Topic Volume vs Growth Velocity</CardDescription>
              </div>
              <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 px-3 py-1 animate-pulse">
                Real-time
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-6 flex flex-col justify-center relative">
            {clusterLoading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-slate-400 animate-pulse font-medium">Scanning network vectors...</p>
              </div>
            ) : clusters.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis type="number" dataKey="volume" name="Volume" stroke="#64748b" tick={{fill: '#64748b'}} axisLine={{stroke: '#334155'}} />
                  <YAxis type="number" dataKey="velocity" name="Velocity" stroke="#64748b" tick={{fill: '#64748b'}} axisLine={{stroke: '#334155'}} />
                  <ZAxis type="number" dataKey="volume" range={[100, 1000]} name="Engagement" />
                  <RechartsTooltip cursor={{ strokeDasharray: '3 3', stroke: '#4f46e5' }} content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl">
                          <p className="text-white font-bold mb-2 flex items-center"><Zap className="w-4 h-4 text-yellow-400 mr-2"/> {data.topic}</p>
                          <p className="text-slate-300 text-sm flex justify-between gap-4"><span>Volume:</span> <span className="font-semibold text-white">{data.volume} mentions</span></p>
                          <p className="text-slate-300 text-sm flex justify-between gap-4"><span>Velocity:</span> <span className="font-semibold text-emerald-400">+{data.velocity}%</span></p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Scatter name="Topics" data={clusters} fill="#6366f1" fillOpacity={0.7} className="cursor-pointer hover:fill-indigo-400 transition-colors" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-60">
                <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-700/50">
                  <TrendingUp className="w-10 h-10 text-slate-500" />
                </div>
                <p className="text-slate-400 font-medium">No trends detected yet.</p>
                <p className="text-sm text-slate-500 mt-1">Add sources to start gathering data.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Intelligence Chat */}
        <Card className="bg-gradient-to-b from-indigo-900/20 to-slate-900/40 backdrop-blur-xl border border-indigo-500/20 shadow-xl overflow-hidden flex flex-col h-[450px]">
          <CardHeader className="border-b border-indigo-500/10 bg-indigo-500/5 px-6 py-4">
            <CardTitle className="text-xl font-bold flex items-center text-white">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center mr-3 shadow-lg shadow-indigo-500/30">
                <Bot className="w-4 h-4 text-white" />
              </div>
              Intelligence Assistant
            </CardTitle>
            <CardDescription className="text-indigo-200/70 ml-11">Ask about pain points, hooks, or emerging trends.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-6 flex flex-col justify-between overflow-hidden relative">
            <div className="flex-1 overflow-y-auto mb-4 pr-2 custom-scrollbar">
              <div className="space-y-4">
                {chatHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4 mt-8">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6 shadow-inner border border-indigo-500/20 relative">
                      <Zap className="w-8 h-8 text-indigo-400" />
                      <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full" />
                    </div>
                    <p className="text-sm text-indigo-200/60 font-medium leading-relaxed">
                      Try asking: <br/><span className="text-indigo-300">"What are the biggest pain points in my niche right now?"</span>
                    </p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={\`flex \${msg.role === 'user' ? 'justify-end' : 'justify-start'}\`}>
                      <div className={\`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-md \${
                        msg.role === 'user' 
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-sm' 
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
                      }\`}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {chatMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center space-x-2">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <form onSubmit={handleChatSubmit} className="relative mt-auto">
              <Input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask about trends..."
                className="pr-12 bg-slate-950/50 backdrop-blur-md border-slate-700 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-500 rounded-xl h-12 transition-all"
                disabled={chatMutation.isPending}
              />
              <Button 
                type="submit" 
                size="icon"
                className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
                disabled={chatMutation.isPending || !chatMessage.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Area: Timeline & Opportunities */}
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* Sentiment Timeline */}
        <Card className="bg-slate-900/40 backdrop-blur-xl border-slate-800/50 shadow-xl overflow-hidden h-[400px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-bold flex items-center text-white">
              <Activity className="w-5 h-5 mr-3 text-emerald-400" /> Audience Mood
            </CardTitle>
            <CardDescription className="text-slate-400 ml-8">Sentiment evolution over time</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-6 pt-0">
            <div className="h-full w-full relative">
              {timelineLoading ? (
                 <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /></div>
              ) : timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                    <RechartsTooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', color: '#f8fafc', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} itemStyle={{fontWeight: 600}} />
                    <Area type="monotone" dataKey="positive" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorPos)" />
                    <Area type="monotone" dataKey="negative" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorNeg)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Activity className="w-10 h-10 mb-3 opacity-20" />
                  <p className="font-medium">No timeline data available.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Viral Opportunities */}
        <Card className="bg-slate-900/40 backdrop-blur-xl border-slate-800/50 shadow-xl overflow-hidden h-[400px] flex flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold flex items-center text-white">
              <Lightbulb className="w-5 h-5 mr-3 text-amber-400" /> Viral Opportunities
            </CardTitle>
            <CardDescription className="text-slate-400 ml-8">AI-extracted hooks & audience pain points</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden relative">
            <div className="absolute inset-0 overflow-y-auto px-6 pb-6 custom-scrollbar">
              <div className="space-y-8">
                
                {/* Hooks */}
                <div>
                  <h4 className="text-sm font-bold tracking-wider uppercase mb-4 flex items-center text-indigo-400">
                    <TrendingUp className="w-4 h-4 mr-2" /> Top Performing Hooks
                  </h4>
                  <div className="space-y-3">
                    {hooksLoading ? (
                      <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-slate-800 rounded w-3/4"></div><div className="h-4 bg-slate-800 rounded w-1/2"></div></div></div>
                    ) : hooks.length > 0 ? hooks.map((hook: any, i: number) => (
                      <div key={i} className="group relative flex flex-col p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-indigo-900/20 hover:border-indigo-500/30 transition-all">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <p className="text-sm font-medium text-slate-200 leading-relaxed">"{hook.content}"</p>
                        <div className="flex items-center gap-2 mt-3">
                          <Badge variant="secondary" className="text-[10px] h-5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20">
                            Score: {hook.score}
                          </Badge>
                          {hook.topics?.slice(0,2).map((t: string) => (
                            <span key={t} className="text-[11px] text-slate-500 font-medium">#{t}</span>
                          ))}
                        </div>
                      </div>
                    )) : <p className="text-sm text-slate-500 bg-slate-800/30 p-4 rounded-xl border border-slate-800">No hooks detected.</p>}
                  </div>
                </div>

                {/* Pain Points */}
                <div>
                  <h4 className="text-sm font-bold tracking-wider uppercase mb-4 flex items-center text-rose-400">
                    <AlertTriangle className="w-4 h-4 mr-2" /> Critical Pain Points
                  </h4>
                  <div className="space-y-3">
                    {hooksLoading ? (
                      <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-slate-800 rounded w-3/4"></div></div></div>
                    ) : painPoints.length > 0 ? painPoints.map((pp: any, i: number) => (
                      <div key={i} className="group relative flex flex-col p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-rose-900/20 hover:border-rose-500/30 transition-all">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <p className="text-sm font-medium text-slate-200 leading-relaxed">"{pp.content}"</p>
                        <div className="flex items-center gap-2 mt-3">
                          <Badge variant="secondary" className="text-[10px] h-5 bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20">
                            Severity: {pp.score}
                          </Badge>
                        </div>
                      </div>
                    )) : <p className="text-sm text-slate-500 bg-slate-800/30 p-4 rounded-xl border border-slate-800">No pain points detected.</p>}
                  </div>
                </div>

              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
`
fs.writeFileSync(path.join(__dirname, 'client/src/pages/SocialListeningPage.tsx'), content);
