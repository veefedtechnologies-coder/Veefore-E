import { motion } from "framer-motion"

/**
 * SignUpGraphicsPanel — the left-side decorative graphics panel of the signup
 * page (desktop only). Pure presentational markup extracted verbatim from
 * SignUpIntegrated; no behaviour or styling was changed.
 */
export const SignUpGraphicsPanel = () => (
  <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center">
    <div className="absolute inset-y-10 left-6 -right-24 bg-[#0d4f4f] rounded-2xl flex items-center justify-center overflow-hidden">
      {/* Grain texture */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
        <filter id="grain-signup">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="15" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-signup)" />
      </svg>

      {/* Floating blur orbs */}
      <div className="absolute top-20 left-20 w-32 h-32 bg-teal-300/15 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-20 w-40 h-40 bg-cyan-400/10 rounded-full blur-3xl"></div>
      <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl"></div>

      {/* Top Left Corner Flourish */}
      <svg className="absolute top-0 left-0 w-40 h-40 lg:w-52 lg:h-52 pointer-events-none z-[5]" viewBox="0 0 200 200" fill="none">
        <motion.path
          d="M 0 80 Q 40 80, 60 50 Q 80 20, 120 0"
          stroke="#14b8a6"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ delay: 0.3, duration: 1.5, ease: "easeOut" }}
          style={{ filter: 'drop-shadow(0 0 4px rgba(20, 184, 166, 0.4))' }}
        />
        <motion.circle cx="120" cy="20" r="4" fill="#14b8a6"
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 1.5, type: "spring" }}
        />
      </svg>

      {/* Bottom Right Corner Flourish */}
      <svg className="absolute bottom-0 right-0 w-40 h-40 lg:w-52 lg:h-52 pointer-events-none z-[5]" viewBox="0 0 200 200" fill="none">
        <motion.path
          d="M 200 120 Q 160 120, 140 150 Q 120 180, 80 200"
          stroke="#14b8a6"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ delay: 0.5, duration: 1.5, ease: "easeOut" }}
          style={{ filter: 'drop-shadow(0 0 4px rgba(20, 184, 166, 0.4))' }}
        />
        <motion.circle cx="80" cy="180" r="4" fill="#14b8a6"
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ delay: 1.8, type: "spring" }}
        />
      </svg>

      {/* Main Content - PHONE MOCKUP + BEFORE/AFTER + TESTIMONIAL + 3D ELEMENTS */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-4 w-full h-full">

        {/* 3D Floating Social Icons - Orbiting */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Instagram - Top */}
          <motion.div
            className="absolute top-16 left-1/4 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCAF45 100%)', boxShadow: '0 8px 32px rgba(131, 58, 180, 0.5)' }}
            initial={{ y: -50, opacity: 0, rotateY: -30 }}
            animate={{ y: 0, opacity: 1, rotateY: 0 }}
            transition={{ delay: 0.4, type: "spring" }}
            whileHover={{ scale: 1.2, rotate: 10 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-6 h-6">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            </svg>
          </motion.div>

          {/* TikTok - Right */}
          <motion.div
            className="absolute top-1/3 right-8 w-11 h-11 rounded-xl bg-black flex items-center justify-center border border-white/20"
            style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)' }}
            initial={{ x: 50, opacity: 0, rotateY: 30 }}
            animate={{ x: 0, opacity: 1, rotateY: 0 }}
            transition={{ delay: 0.5, type: "spring" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
            </svg>
          </motion.div>

          {/* YouTube - Bottom Right */}
          <motion.div
            className="absolute bottom-32 right-16 w-10 h-10 rounded-xl bg-[#FF0000] flex items-center justify-center"
            style={{ boxShadow: '0 8px 32px rgba(255, 0, 0, 0.5)' }}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, type: "spring" }}
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </motion.div>

          {/* LinkedIn - Left */}
          <motion.div
            className="absolute top-1/2 left-6 w-10 h-10 rounded-xl bg-[#0A66C2] flex items-center justify-center"
            style={{ boxShadow: '0 8px 32px rgba(10, 102, 194, 0.5)' }}
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.7, type: "spring" }}
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </motion.div>

          {/* Floating Stats Bubbles */}
          <motion.div
            className="absolute top-24 right-1/4 bg-white/10 backdrop-blur-md rounded-full px-4 py-2 border border-white/20"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.0, type: "spring" }}
          >
            <span className="text-white text-sm font-bold">+847K</span>
            <span className="text-white/60 text-xs ml-1">followers</span>
          </motion.div>

          <motion.div
            className="absolute bottom-40 left-12 bg-white/10 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.1, type: "spring" }}
          >
            <span className="text-emerald-400 text-xs font-bold">▲ 284%</span>
          </motion.div>
        </div>

        {/* Main Visual Container */}
        <div className="relative w-full max-w-md">

          {/* iPhone Mockup - Central */}
          <motion.div
            initial={{ y: 40, opacity: 0, rotateX: 10 }}
            animate={{ y: 0, opacity: 1, rotateX: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
            className="relative mx-auto"
            style={{ perspective: '1000px' }}
          >
            {/* Phone Frame */}
            <div className="relative w-48 h-[380px] mx-auto bg-gray-900 rounded-[2.5rem] p-2 shadow-2xl border-4 border-gray-800"
              style={{ boxShadow: '0 25px 80px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(20, 184, 166, 0.15)' }}
            >
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-b-2xl z-20"></div>

              {/* Screen Content */}
              <div className="w-full h-full bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 rounded-[2rem] overflow-hidden relative">
                {/* App Header */}
                <div className="px-4 pt-8 pb-3 bg-gradient-to-b from-teal-600/20 to-transparent">
                  <div className="flex items-center gap-2">
                    <img src="/veefore.svg" alt="V" className="w-6 h-6" />
                    <span className="text-white font-bold text-sm">VeeFore</span>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="px-3 space-y-2">
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10"
                  >
                    <div className="text-white/60 text-[10px] mb-1">Total Followers</div>
                    <div className="text-white text-xl font-bold">248.5K</div>
                    <div className="text-emerald-400 text-xs">↗ +12.4% this week</div>
                  </motion.div>

                  <motion.div
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-xl p-3 border border-teal-500/30"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🚀</span>
                      <span className="text-white text-xs font-medium">AI Post Ready</span>
                    </div>
                    <div className="text-white/80 text-[10px] leading-relaxed">
                      "5 productivity hacks that changed my business..."
                    </div>
                    <div className="flex gap-1 mt-2">
                      {['#growth', '#tips'].map((tag, i) => (
                        <span key={i} className="text-[8px] px-2 py-0.5 bg-teal-500/30 rounded-full text-teal-300">{tag}</span>
                      ))}
                    </div>
                  </motion.div>

                  {/* Mini Chart */}
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="bg-white/5 rounded-xl p-3"
                  >
                    <div className="text-white/60 text-[10px] mb-2">Growth Chart</div>
                    <div className="flex items-end gap-1 h-12">
                      {[30, 45, 40, 60, 55, 75, 70, 90, 85, 100].map((h, i) => (
                        <motion.div
                          key={i}
                          className="flex-1 bg-gradient-to-t from-teal-500 to-cyan-400 rounded-t"
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: 1.0 + i * 0.05, duration: 0.4 }}
                        />
                      ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>

            {/* Phone Reflection/Glow */}
            <div className="absolute -inset-4 bg-gradient-to-b from-teal-500/10 to-transparent rounded-[3rem] -z-10 blur-xl"></div>
          </motion.div>

          {/* BEFORE/AFTER Card - Left Side */}
          <motion.div
            initial={{ x: -60, opacity: 0, rotate: -5 }}
            animate={{ x: 0, opacity: 1, rotate: -5 }}
            transition={{ delay: 0.5, type: "spring" }}
            whileHover={{ rotate: 0, scale: 1.02 }}
            className="absolute -left-8 top-16 bg-white rounded-2xl shadow-2xl p-4 w-36 cursor-pointer"
            style={{ boxShadow: '0 20px 60px -15px rgba(0, 0, 0, 0.3)' }}
          >
            <div className="text-center mb-3">
              <div className="text-gray-400 text-[10px] font-medium uppercase tracking-wide">Transformation</div>
            </div>
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-gray-400 text-[9px] mb-0.5">BEFORE</div>
                <div className="text-gray-600 text-lg font-bold">2.4K</div>
              </div>
              <div className="flex items-center justify-center">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm"
                >
                  ↓
                </motion.div>
              </div>
              <div className="text-center">
                <div className="text-emerald-500 text-[9px] mb-0.5">AFTER</div>
                <div className="text-emerald-600 text-xl font-bold">247K</div>
              </div>
            </div>
            <div className="mt-3 text-center">
              <span className="text-[9px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">+10,191% Growth</span>
            </div>
          </motion.div>

          {/* TESTIMONIAL Card - Right Side */}
          <motion.div
            initial={{ x: 60, opacity: 0, rotate: 5 }}
            animate={{ x: 0, opacity: 1, rotate: 5 }}
            transition={{ delay: 0.6, type: "spring" }}
            whileHover={{ rotate: 0, scale: 1.02 }}
            className="absolute -right-6 top-24 bg-white rounded-2xl shadow-2xl p-4 w-40 cursor-pointer"
            style={{ boxShadow: '0 20px 60px -15px rgba(0, 0, 0, 0.3)' }}
          >
            {/* Stars */}
            <div className="flex gap-0.5 mb-2">
              {[1, 2, 3, 4, 5].map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.9 + i * 0.1, type: "spring" }}
                  className="text-yellow-400 text-sm"
                >★</motion.span>
              ))}
            </div>
            <p className="text-gray-600 text-[10px] leading-relaxed mb-3 italic">
              "VeeFore transformed my content game. 10x growth in just 3 months!"
            </p>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold">
                SM
              </div>
              <div>
                <div className="text-gray-800 text-[10px] font-semibold">Sarah M.</div>
                <div className="text-gray-400 text-[8px]">@sarahcreates</div>
              </div>
            </div>
          </motion.div>

          {/* AI Badge - Bottom */}
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8, type: "spring" }}
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full px-5 py-2 shadow-lg flex items-center gap-2"
            style={{ boxShadow: '0 10px 40px -10px rgba(20, 184, 166, 0.5)' }}
          >
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="text-white text-sm"
            >✨</motion.div>
            <span className="text-white text-xs font-semibold">Powered by AI</span>
          </motion.div>
        </div>

        {/* Headline - Below Visual */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="text-center mt-12"
        >
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
            Your Growth <span className="text-teal-300">Starts Here</span>
          </h2>
          <p className="text-white/50 text-sm">Join 10,000+ creators already growing with AI</p>
        </motion.div>
      </div>
    </div>
  </div>
)
