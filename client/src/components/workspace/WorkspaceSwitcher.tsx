import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useLocation } from 'wouter'

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

// Deterministic gradient from workspace name for a stable avatar colour
function getAvatarGradient(name: string): string {
  const gradients = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-orange-500 to-amber-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-sky-600',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return gradients[Math.abs(hash) % gradients.length]
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchWorkspace, isAtLimit } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [, setLocation] = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)

  // Only render when user has more than one workspace
  if (workspaces.length <= 1) return null

  const visibleWorkspaces = workspaces.filter((w) => w.status !== 'DELETED')

  const handleSwitch = async (id: string) => {
    if (id === activeWorkspace?.id) {
      setOpen(false)
      return
    }
    await switchWorkspace(id)
    setOpen(false)
  }

  const handleAddWorkspace = () => {
    if (isAtLimit) return
    setOpen(false)
    setLocation('/settings/add-workspace')
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center w-full px-2 py-2"
    >
      {/* Trigger button */}
      <button
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex flex-col items-center w-full gap-1 rounded-xl p-2 transition-all duration-200',
          'text-gray-600 dark:text-gray-300',
          'hover:bg-gray-100 dark:hover:bg-slate-700',
          open && 'bg-gray-100 dark:bg-slate-700',
        )}
      >
        {/* Avatar */}
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0',
            `bg-gradient-to-br ${activeWorkspace ? getAvatarGradient(activeWorkspace.name) : 'from-gray-400 to-gray-500'}`,
          )}
        >
          {activeWorkspace ? getInitial(activeWorkspace.name) : '?'}
        </div>

        {/* Workspace name (truncated) + chevron */}
        <div className="flex items-center gap-0.5 max-w-full">
          <span className="text-xs font-medium truncate max-w-[56px] leading-tight">
            {activeWorkspace?.name ?? 'Workspace'}
          </span>
          <ChevronDown
            className={cn(
              'w-3 h-3 flex-shrink-0 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            role="listbox"
            aria-label="Switch workspace"
            className={cn(
              'absolute left-full top-0 ml-2 z-50',
              'w-56 rounded-xl shadow-xl border',
              'bg-white dark:bg-slate-800',
              'border-gray-200 dark:border-slate-600',
              'py-1 overflow-hidden',
            )}
          >
            {visibleWorkspaces.map((ws) => {
              const isActive = ws.id === activeWorkspace?.id
              const isSuspended = ws.status === 'SUSPENDED'
              return (
                <button
                  key={ws.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSwitch(ws.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150',
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700',
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0',
                      `bg-gradient-to-br ${getAvatarGradient(ws.name)}`,
                    )}
                  >
                    {getInitial(ws.name)}
                  </div>

                  {/* Name + suspended badge */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{ws.name}</span>
                    {isSuspended && (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400 leading-tight">
                        Suspended
                      </span>
                    )}
                  </div>

                  {/* Active checkmark */}
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 flex-shrink-0" />
                  )}
                </button>
              )
            })}

            {/* Divider */}
            <div className="my-1 border-t border-gray-100 dark:border-slate-700" />

            {/* Add Workspace */}
            <div className="relative group/add">
              <button
                onClick={handleAddWorkspace}
                disabled={isAtLimit}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150',
                  isAtLimit
                    ? 'opacity-40 cursor-not-allowed text-gray-400 dark:text-gray-500'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700',
                )}
              >
                <div className="w-8 h-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-500 flex items-center justify-center flex-shrink-0">
                  <Plus className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                </div>
                <span className="text-sm font-medium">Add Workspace</span>
              </button>

              {/* Tooltip shown when at limit */}
              {isAtLimit && (
                <div
                  className={cn(
                    'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
                    'hidden group-hover/add:block',
                    'px-3 py-1.5 rounded-lg text-xs text-white',
                    'bg-gray-800 dark:bg-gray-900 shadow-lg whitespace-nowrap',
                  )}
                >
                  Upgrade your plan to add more workspaces
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-900" />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
