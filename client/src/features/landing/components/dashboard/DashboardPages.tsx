import React, { memo } from 'react'
import {
  MessageSquare, Bot, TrendingUp, Sparkles, Brain, Clock, Send,
} from 'lucide-react'
import { isPhase1 } from '../../constants/phase'

/**
 * The three "pages" shown inside the animated Live Dashboard preview.
 * Extracted from the old monolithic Landing page so the dashboard mockup
 * stays self-contained and composable.
 */

export const DashboardPageContent = memo(() => (
  <div className="space-y-4">
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: 'Total Engagements', value: '24,847', change: '+18%', color: 'text-blue-400' },
        isPhase1
          ? { label: 'Posts Scheduled', value: '3,291', change: '+42%', color: 'text-purple-400' }
          : { label: 'DMs Processed', value: '3,291', change: '+42%', color: 'text-purple-400' },
        { label: 'Hooks Created', value: '847', change: '+28%', color: 'text-pink-400' },
        { label: 'Credits Used', value: '892/1200', change: '74%', color: 'text-amber-400' }
      ].map((stat) => (
        <div key={stat.label} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[10px] text-white/40 mb-1">{stat.label}</p>
          <div className="flex items-end justify-between">
            <span className="text-xl font-bold">{stat.value}</span>
            <span className={`text-xs ${stat.color}`}>{stat.change}</span>
          </div>
        </div>
      ))}
    </div>
    <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">Engagement Velocity</h4>
        <div className="flex items-center space-x-2 text-xs text-white/40">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5" />{isPhase1 ? 'Posts' : 'Comments'}</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-purple-500 mr-1.5" />{isPhase1 ? 'Saves' : 'DMs'}</span>
        </div>
      </div>
      <div className="h-32 flex items-end space-x-2">
        {[40, 55, 45, 70, 60, 80, 75, 90, 85, 95, 88, 100].map((h, i) => (
          <div key={i} style={{ height: `${h}%` }} className="flex-1 rounded-t-sm bg-gradient-to-t from-blue-600 to-blue-400" />
        ))}
      </div>
    </div>
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <h4 className="text-sm font-medium mb-3">Recent AI Activity</h4>
      <div className="space-y-2">
        {[
          isPhase1 ? { text: 'Scheduled 3 posts for peak engagement windows', time: '2m ago' } : { text: 'Replied to 12 comments on latest post', time: '2m ago' },
          isPhase1 ? { text: 'Hook score improved by 12 points this week', time: '5m ago' } : { text: 'Processed 8 DM inquiries automatically', time: '5m ago' },
          { text: 'Generated 3 hook variations for carousel', time: '8m ago' }
        ].map((activity, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
            <span className="text-xs text-white/60">{activity.text}</span>
            <span className="text-[10px] text-white/30">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
))
DashboardPageContent.displayName = 'DashboardPageContent'

export const EngagementPageContent = memo(() => isPhase1 ? (
  <div className="space-y-4">
    <div className="p-5 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">AI Smart Scheduler</h4>
            <p className="text-xs text-white/40">Best-time publishing active</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Active</span>
        </div>
      </div>
      <div className="space-y-3">
        {[
          { time: 'Mon 9:00 AM', label: 'Product Reel', reach: '+94% reach', status: 'scheduled' },
          { time: 'Wed 12:00 PM', label: 'Carousel Post', reach: '+87% reach', status: 'optimal' },
          { time: 'Fri 6:00 PM', label: 'Story Series', reach: '+78% reach', status: 'scheduled' }
        ].map((item, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-start justify-between mb-1">
              <span className="text-xs font-medium text-blue-400">{item.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'optimal' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>{item.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-white/50">{item.time}</p>
              <p className="text-[11px] text-green-400 font-medium">{item.reach}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="p-5 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Hook Intelligence</h4>
            <p className="text-xs text-white/40">Viral patterns analyzed</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-purple-400">94</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[{ label: 'Hooks Scored', value: '847' }, { label: 'Avg Score', value: '91%' }, { label: 'Top Hook', value: '#FOMO' }].map((s, i) => (
          <div key={i} className="p-2 rounded-lg bg-white/[0.03]">
            <p className="text-lg font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-white/40">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
) : (
  <div className="space-y-4">
    <div className="p-5 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Comment Automation</h4>
            <p className="text-xs text-white/40">AI-powered reply engine active</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Active</span>
        </div>
      </div>
      <div className="space-y-3">
        {[
          { user: '@sarah_creates', comment: 'Love this content! How do you...', reply: 'Thanks Sarah! I use a combination of...', status: 'sent' },
          { user: '@mike_growth', comment: 'Can you share more about your process?', reply: 'Absolutely! My process involves...', status: 'sending' },
          { user: '@julia_design', comment: 'This is exactly what I needed!', reply: 'So glad it helped Julia! Check out...', status: 'queued' }
        ].map((item, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium text-blue-400">{item.user}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'sent' ? 'bg-green-500/20 text-green-400' : item.status === 'sending' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40'}`}>{item.status}</span>
            </div>
            <p className="text-[11px] text-white/50 mb-1.5">"{item.comment}"</p>
            <div className="flex items-center space-x-2">
              <Bot className="w-3 h-3 text-purple-400" />
              <p className="text-[11px] text-white/70">{item.reply}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="p-5 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">DM Automation</h4>
            <p className="text-xs text-white/40">Smart funnel responses</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-purple-400">847</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[{ label: 'Leads Captured', value: '324' }, { label: 'Responded', value: '98%' }, { label: 'Converted', value: '23%' }].map((s, i) => (
          <div key={i} className="p-2 rounded-lg bg-white/[0.03]">
            <p className="text-lg font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-white/40">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
))
EngagementPageContent.displayName = 'EngagementPageContent'

export const HooksPageContent = memo(() => (
  <div className="space-y-4">
    <div className="p-5 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold">AI Hook Generator</h4>
            <p className="text-xs text-white/40">Trending patterns detected</p>
          </div>
        </div>
        <Sparkles className="w-5 h-5 text-indigo-400" />
      </div>
      <div className="space-y-3">
        {[
          { hook: "Stop scrolling. This changed everything for me...", score: 94, type: 'Curiosity' },
          { hook: "I made $10K in 30 days using this one strategy", score: 91, type: 'Result' },
          { hook: "Nobody talks about this creator secret...", score: 88, type: 'Exclusive' }
        ].map((item, i) => (
          <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm text-white/80 flex-1">"{item.hook}"</p>
              <div className="ml-3 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-green-500/20">
                <span className="text-xs font-bold text-green-400">{item.score}</span>
                <TrendingUp className="w-3 h-3 text-green-400" />
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">{item.type}</span>
          </div>
        ))}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <h5 className="text-xs font-medium text-white/60 mb-2">Trending Patterns</h5>
        <div className="flex flex-wrap gap-1.5">
          {['Story hooks', 'Questions', 'Contrarian', 'Numbers', 'Emotional'].map((tag) => (
            <span key={tag} className="px-2 py-1 text-[10px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">{tag}</span>
          ))}
        </div>
      </div>
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <h5 className="text-xs font-medium text-white/60 mb-2">Your Hook Score</h5>
        <div className="flex items-end space-x-2">
          <span className="text-3xl font-bold text-indigo-400">87</span>
          <span className="text-xs text-green-400 mb-1">+12 this week</span>
        </div>
      </div>
    </div>
  </div>
))
HooksPageContent.displayName = 'HooksPageContent'
