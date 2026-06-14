import React, { memo } from 'react'
import { TrendingUp, Clock, Sparkles, Crown, CheckCircle } from 'lucide-react'

/**
 * StaticDashboardPreview - Lightweight, non-animated iPhone mockup shown on
 * mobile devices instead of the heavy AnimatedDashboard (performance optimization).
 */
export const StaticDashboardPreview = memo(() => (
  <div className="relative mx-auto max-w-[380px] w-full px-4">
    <div className="relative">
      {/* iPhone mockup shell */}
      <div className="relative bg-[#1a1a1a] rounded-[3rem] p-2 shadow-2xl border-[6px] border-[#2a2a2a]">
        <div className="relative bg-black rounded-[2.5rem] overflow-hidden">
          {/* Status bar */}
          <div className="bg-[#0a0a0a] px-6 pt-3 pb-2 flex items-center justify-between">
            <span className="text-white text-sm font-semibold">10:57</span>
            <div className="flex items-center space-x-1">
              <div className="flex items-end space-x-[2px]">
                <div className="w-[3px] h-2 bg-white rounded-full"></div>
                <div className="w-[3px] h-3 bg-white rounded-full"></div>
                <div className="w-[3px] h-4 bg-white rounded-full"></div>
                <div className="w-[3px] h-5 bg-white rounded-full"></div>
              </div>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2.166 8.606a.5.5 0 01.708-.708A8 8 0 0117.126 7.9a.5.5 0 11.708.708 9 9 0 00-15.668-.002zm2.828 2.829a.5.5 0 01.708-.708 5 5 0 017.071 0 .5.5 0 11.707.707 6 6 0 00-8.486 0zm2.829 2.828a.5.5 0 01.707-.707 2 2 0 012.828 0 .5.5 0 11.708.707 3 3 0 00-4.243 0zM10 15a1 1 0 100-2 1 1 0 000 2z"/>
              </svg>
              <div className="flex items-center space-x-0.5">
                <div className="w-6 h-3 border border-white rounded-sm relative">
                  <div className="absolute inset-0.5 bg-white rounded-[1px]" style={{ width: '80%' }}></div>
                </div>
                <div className="w-[2px] h-2 bg-white rounded-full"></div>
              </div>
            </div>
          </div>

          {/* App header */}
          <div className="bg-[#0a0a0a] px-4 py-3 flex items-center justify-between border-b border-white/10">
            <div className="flex items-center space-x-2">
              <img src="/veefore-logo.png" alt="V" className="w-7 h-7 object-contain" />
              <span className="text-white font-bold text-lg">eefore</span>
            </div>
            <button className="text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Main content - NON-SCROLLABLE, fits in viewport */}
          <div className="bg-gradient-to-b from-[#0a0a0a] to-[#0f0f0f] flex flex-col" style={{ height: '540px' }}>
            <div className="p-3 flex flex-col flex-1 space-y-2.5">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
                  <TrendingUp className="w-4 h-4 text-blue-400 mb-1.5" />
                  <div className="text-xl font-bold text-white">24,847</div>
                  <div className="text-[10px] text-white/60 mt-0.5">Engagements</div>
                  <div className="text-[10px] text-blue-400 font-semibold mt-0.5">+18%</div>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20">
                  <Clock className="w-4 h-4 text-purple-400 mb-1.5" />
                  <div className="text-xl font-bold text-white">3,291</div>
                  <div className="text-[10px] text-white/60 mt-0.5">Posts</div>
                  <div className="text-[10px] text-purple-400 font-semibold mt-0.5">+42%</div>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-pink-500/10 to-pink-600/5 border border-pink-500/20">
                  <Sparkles className="w-4 h-4 text-pink-400 mb-1.5" />
                  <div className="text-xl font-bold text-white">847</div>
                  <div className="text-[10px] text-white/60 mt-0.5">Hooks</div>
                  <div className="text-[10px] text-pink-400 font-semibold mt-0.5">+28%</div>
                </div>
                <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20">
                  <Crown className="w-4 h-4 text-amber-400 mb-1.5" />
                  <div className="text-base font-bold text-white">892/1200</div>
                  <div className="text-[10px] text-white/60 mt-0.5">Credits</div>
                  <div className="text-[10px] text-amber-400 font-semibold mt-0.5">74%</div>
                </div>
              </div>

              {/* Chart section */}
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex flex-col flex-1">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-sm font-semibold text-white">Engagement Velocity</h3>
                  <div className="flex space-x-2 text-[10px]">
                    <span className="flex items-center text-white/60">
                      <span className="w-2 h-2 rounded-full bg-blue-500 mr-1" />
                      Posts
                    </span>
                  </div>
                </div>
                <div className="flex-1 flex items-end space-x-1.5">
                  {[40, 55, 45, 70, 60, 80, 75, 90, 85, 95, 88, 100].map((h, i) => (
                    <div key={i} style={{ height: `${h}%` }} className="flex-1 rounded-t-md bg-gradient-to-t from-blue-600 to-blue-400" />
                  ))}
                </div>
              </div>

              {/* AI status card */}
              <div className="p-3 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20">
                <div className="flex items-start space-x-2.5">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-green-300">AI is optimizing</h3>
                    <p className="text-[10px] text-white/60 mt-0.5">3 posts scheduled for peak engagement</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom navigation */}
          <div className="bg-[#0a0a0a] border-t border-white/10 px-6 py-2 flex justify-around">
            <button className="flex flex-col items-center space-y-0.5 text-white/60">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-[9px]">Home</span>
            </button>
            <button className="flex flex-col items-center space-y-0.5 text-blue-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-[9px] font-medium">Dashboard</span>
            </button>
            <button className="flex flex-col items-center space-y-0.5 text-white/60">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[9px]">Create</span>
            </button>
            <button className="flex flex-col items-center space-y-0.5 text-white/60">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="text-[9px]">Alerts</span>
            </button>
            <button className="flex flex-col items-center space-y-0.5 text-white/60">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-[9px]">Profile</span>
            </button>
          </div>

          {/* iPhone home indicator */}
          <div className="bg-[#0a0a0a] pb-2 flex justify-center">
            <div className="w-28 h-1 bg-white/30 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Physical buttons */}
      <div className="absolute -left-[2px] top-24 w-[2px] h-8 bg-[#1a1a1a] rounded-l"></div>
      <div className="absolute -left-[2px] top-36 w-[2px] h-12 bg-[#1a1a1a] rounded-l"></div>
      <div className="absolute -left-[2px] top-52 w-[2px] h-12 bg-[#1a1a1a] rounded-l"></div>
      <div className="absolute -right-[2px] top-32 w-[2px] h-16 bg-[#1a1a1a] rounded-r"></div>
    </div>
  </div>
))
StaticDashboardPreview.displayName = 'StaticDashboardPreview'
