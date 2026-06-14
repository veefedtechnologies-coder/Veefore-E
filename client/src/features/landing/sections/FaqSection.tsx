import React, { useState } from 'react'
import { Link } from 'wouter'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MessageCircle, Mail } from 'lucide-react'
import { faqs } from '../constants/faqs'

/**
 * FaqSection - Accordion of frequently asked questions with a contact CTA.
 */
export const FaqSection: React.FC = () => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  return (
    <section id="faq" className="py-24 md:py-32 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/10 to-transparent pointer-events-none" />

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 relative">
        <div className="text-center mb-12 md:mb-16">
          <span className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 mb-4 sm:mb-6">
            Got Questions?
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4">
            Frequently Asked <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Questions</span>
          </h2>
          <p className="text-white/40 text-sm sm:text-base lg:text-lg max-w-2xl mx-auto px-2">
            Everything you need to know about VeeFore and how it can help you grow.
          </p>
        </div>

        <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
          {faqs.map((faq, i) => (
            <div key={i}>
              <div className="h-full bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded-xl sm:rounded-2xl overflow-hidden hover:border-white/10 transition-colors duration-300">
                <button
                  onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                  className="w-full p-4 sm:p-5 md:p-6 flex items-start justify-between text-left gap-3 sm:gap-4"
                >
                  <div className="flex-1">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-[9px] sm:text-[10px] md:text-xs font-medium text-blue-300/80 mb-1.5 sm:mb-2">
                      {faq.category}
                    </span>
                    <span className="block font-semibold text-xs sm:text-sm md:text-base text-white/90 leading-snug">{faq.q}</span>
                  </div>
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center shrink-0 transition-all duration-300 ${activeFaq === i ? 'rotate-45 from-blue-500/30 to-purple-500/30' : ''}`}>
                    <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-white/70" />
                  </div>
                </button>
                <AnimatePresence>
                  {activeFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 sm:px-5 md:px-6 pb-4 sm:pb-5 md:pb-6 pt-0">
                        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-3 sm:mb-4" />
                        <p className="text-white/50 text-xs sm:text-sm md:text-[15px] leading-relaxed">
                          {faq.a}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8 sm:mt-12 md:mt-16">
          <p className="text-white/40 text-sm mb-3 sm:mb-4">Still have questions?</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white transition-all duration-300 text-xs sm:text-sm font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              Contact Support
            </Link>
            <a
              href="mailto:support@veefore.com"
              className="inline-flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full bg-transparent border border-white/10 text-white/60 hover:bg-white/5 hover:text-white/80 transition-all duration-300 text-xs sm:text-sm font-medium"
            >
              <Mail className="w-4 h-4" />
              Email Us
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export default FaqSection
