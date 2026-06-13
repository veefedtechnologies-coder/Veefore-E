import { useState } from "react"
import { Lock, Eye, EyeOff, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface PasswordInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
  strength?: number
  requirements?: {
    length: boolean
    uppercase: boolean
    lowercase: boolean
    number: boolean
    special: boolean
    typesCount: number
  }
  showStrengthIndicator?: boolean
}

const RequirementItem = ({ met, label }: { met: boolean; label: string }) => (
  <div className="flex items-center gap-1.5">
    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${met ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-white/5 border-white/10 text-white/20'}`}>
      {met && <Check className="w-2.5 h-2.5" />}
    </div>
    <span className={`text-[10px] ${met ? 'text-emerald-400 font-medium' : 'text-white/40'}`}>{label}</span>
  </div>
)

export function PasswordInput({
  value,
  onChange,
  error,
  disabled,
  strength = 0,
  requirements,
  showStrengthIndicator = true
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="space-y-1">
      <label htmlFor="password" className="text-xs font-medium text-white/70 block">
        Password <span className="text-red-400">*</span>
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <Lock className={`w-4 h-4 ${error ? 'text-red-400' : 'text-white/40'}`} />
        </div>
        <input
          id="password"
          type={showPassword ? 'text' : 'password'}
          name="new-password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Create a strong password"
          className="w-full h-11 pl-10 pr-10 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
          disabled={disabled}
          aria-invalid={!!error}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      {/* Password Strength Indicator - Compact & Inline */}
      {showStrengthIndicator && (
        <AnimatePresence>
          {value && requirements && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-2 space-y-2">
                {/* Bars */}
                <div className="flex gap-1 h-0.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div 
                      key={level} 
                      className={`flex-1 rounded-full ${
                        strength >= level 
                          ? (strength <= 2 ? 'bg-red-500' : strength <= 4 ? 'bg-yellow-500' : 'bg-emerald-500') 
                          : 'bg-white/10'
                      }`} 
                    />
                  ))}
                </div>

                {/* Mini Checklist */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <RequirementItem met={requirements.length} label="8+ Chars" />
                  <RequirementItem met={requirements.uppercase} label="Upper" />
                  <RequirementItem met={requirements.lowercase} label="Lower" />
                  <RequirementItem met={requirements.number} label="Number" />
                  <RequirementItem met={requirements.special} label="Special" />
                  <div className="text-[9px] text-white/30 col-span-2 pt-0.5">* Require 3 of 4 types</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {error && <p className="text-red-400 text-xs mt-1 pl-1">{error}</p>}
    </div>
  )
}
