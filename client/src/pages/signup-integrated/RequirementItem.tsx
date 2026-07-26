import { Check } from "lucide-react"

/**
 * RequirementItem — a single password-requirement checklist row.
 * Extracted verbatim from SignUpIntegrated (identical markup/styles).
 */
export const RequirementItem = ({ met, label }: { met: boolean; label: string }) => (
  <div className="flex items-center gap-1.5">
    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${met ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-white/5 border-white/10 text-white/20'}`}>
      {met && <Check className="w-2.5 h-2.5" />}
    </div>
    <span className={`text-[10px] ${met ? 'text-emerald-400 font-medium' : 'text-white/40'}`}>{label}</span>
  </div>
)
