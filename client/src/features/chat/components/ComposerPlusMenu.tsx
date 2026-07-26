import React, { useEffect, useRef, useState } from 'react'
import {
  Plus,
  Image as ImageIcon,
  Wrench,
  ChevronRight,
  Check,
  Globe,
  TrendingUp,
  Telescope,
  BarChart3,
  Sparkles,
  Clock,
  PenSquare,
} from 'lucide-react'
import { COMPOSER_TOOLS } from '../composerTools'

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe, TrendingUp, Telescope, BarChart3, Sparkles, Clock, PenSquare,
}

interface ComposerPlusMenuProps {
  /** Add picked image/video files (same handler the composer already uses). */
  onAddFiles: (files: FileList | File[]) => void
  /** The currently armed tool id (forces that tool on the next send), or null. */
  selectedTool: string | null
  /** Arm/disarm a tool. */
  onSelectTool: (id: string | null) => void
  /** Smaller trigger for the in-chat composer. */
  compact?: boolean
}

/**
 * The composer "+" menu. Replaces the old paperclip: opens a popover with
 * "Upload image", "Upload video", and a "Tools" submenu. Picking a tool arms it
 * so VeeGPT runs THAT tool on the next message; picking it again clears it.
 */
export function ComposerPlusMenu({ onAddFiles, selectedTool, onSelectTool, compact }: ComposerPlusMenuProps) {
  const [open, setOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setToolsOpen(false) }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setToolsOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const close = () => { setOpen(false); setToolsOpen(false) }
  const size = compact ? 'w-5 h-5' : 'w-5 h-5'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Add photos, videos or a tool"
        aria-label="Add photos, videos or a tool"
        className="flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/70 transition-colors"
        style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }}
      >
        <Plus className={size} style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {/* Single hidden input accepting BOTH images and videos. */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-m4v"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.length) onAddFiles(e.target.files); e.target.value = ''; close() }}
      />

      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-60 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-lg py-1">
          <button
            type="button"
            onClick={() => mediaInputRef.current?.click()}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/70 transition-colors"
          >
            <ImageIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100">Upload photo or video</span>
          </button>

          <div className="my-1 border-t border-gray-100 dark:border-white/10" />

          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/70 transition-colors"
          >
            <Wrench className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            <span className="flex-1 text-[13px] font-medium text-gray-900 dark:text-gray-100">Tools</span>
            {selectedTool
              ? <span className="text-[10px] text-blue-600 dark:text-blue-300 font-semibold">1</span>
              : <ChevronRight className={`w-4 h-4 opacity-60 ${toolsOpen ? 'rotate-90' : ''} transition-transform`} />}
          </button>

          {toolsOpen && (
            <div className="max-h-64 overflow-y-auto">
              {selectedTool && (
                <button
                  type="button"
                  onClick={() => { onSelectTool(null); close() }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700/70"
                >
                  Auto (let VeeGPT decide)
                </button>
              )}
              {COMPOSER_TOOLS.map((t) => {
                const Icon = TOOL_ICONS[t.icon] || Wrench
                const active = selectedTool === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onSelectTool(active ? null : t.id); close() }}
                    className="w-full flex items-start gap-2.5 pl-5 pr-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/70 transition-colors"
                  >
                    <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-gray-900 dark:text-gray-100">{t.label}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{t.description}</span>
                    </span>
                    {active && <Check className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
