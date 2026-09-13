import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Lock } from 'lucide-react'
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

  const handleSwitch = async (id: string, locked?: boolean) => {
    if (locked) {
      // Don't switch — the UI already shows the upgrade prompt
      return
    }
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

  const lockedCount = visibleWorkspaces.filter((w: any) => w.locked).length

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
              'w-64 rounded-xl shadow-xl border',
              'bg-white dark:bg-slate-800',
              'border-gray-200 dark:border-slate-600',
              'py-1 overflow-hidden',
            )}
          >
            {/* Header label */}
            <div className="px-3 pt-2 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Switch Workspace
              </span>
              {lockedCount > 0 && (
                <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-500">
                  · {visibleWorkspaces.length - lockedCount}/{visibleWorkspaces.length} available
                </span>
              )}
            </div>

            {visibleWorkspaces.map((ws: any) => {
              const isActive = ws.id === activeWorkspace?.id
              const isSuspended = ws.status === 'SUSPENDED'
              const isLocked = !!ws.locked

              return (
                <div key={ws.id} className="relative group/ws">
                  <button
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={isLocked}
                    onClick={() => handleSwitch(ws.id, isLocked)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150',
                      isLocked
                        ? 'opacity-50 cursor-not-allowed text-gray-500 dark:text-gray-400'
                        : isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700',
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0',
                        isLocked
                          ? 'bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700'
                          : `bg-gradient-to-br ${getAvatarGradient(ws.name)}`,
                      )}
                    >
                      {isLocked ? (
                        <Lock className="w-3.5 h-3.5 text-white/80" />
                      ) : (
                        getInitial(ws.name)
                      )}
                    </div>

                    {/* Name + badge */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{ws.name}</span>
                      {isLocked ? (
                        <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400 leading-tight">
                          Upgrade to access
                        </span>
                      ) : isSuspended ? (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400 leading-tight">
                          Suspended
                        </span>
                      ) : null}
                    </div>

                    {/* Active checkmark (only for unlocked) */}
                    {isActive && !isLocked && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 flex-shrink-0" />
                    )}
                  </button>

                  {/* Upgrade tooltip for locked workspaces */}
                  {isLocked && (
                    <div
                      className={cn(
                        'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
                        'hidden group-hover/ws:block',
                        'px-3 py-2 rounded-lg text-xs text-white text-center',
                        'bg-gray-900 shadow-lg w-52',
                      )}
                    >
                      <div className="font-semibold mb-0.5">Workspace locked</div>
                      <div className="text-gray-300 text-[11px]">
                        {ws.lockedReason ?? 'Upgrade your plan to access this workspace. Your data is safe.'}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpen(false); setLocation('/settings/billing') }}
                        className="mt-1.5 px-2.5 py-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-medium transition-colors"
                      >
                        Upgrade plan
                      </button>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  )}
                </div>
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
                <span className="text-sm font-medium">
                  {isAtLimit ? `${visibleWorkspaces.filter((w: any) => !w.locked).length}/${visibleWorkspaces.length} used — upgrade to add more` : 'Create New Workspace'}
                </span>
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
