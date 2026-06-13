import { Mail } from "lucide-react"

interface EmailInputProps {
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}

export function EmailInput({ value, onChange, error, disabled }: EmailInputProps) {
  return (
    <div className="space-y-1">
      <label htmlFor="email" className="text-xs font-medium text-white/70 block">
        Email Address <span className="text-red-400">*</span>
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <Mail className={`w-4 h-4 ${error ? 'text-red-400' : 'text-white/40'}`} />
        </div>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="name@company.com"
          className="w-full h-11 pl-10 pr-3 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
          disabled={disabled}
          aria-invalid={!!error}
        />
      </div>
      {error && <p className="text-red-400 text-xs mt-1 pl-1">{error}</p>}
    </div>
  )
}
