/**
 * MyReportsPage — report history + slide-up export drawer.
 * Main view: list of past exports stored in localStorage.
 * Header: "New Report" button opens a slide-up sheet with all export options.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  FileText, Table2, Presentation, Download, Loader2,
  CheckSquare, Square, Calendar, Users, Radar, Heart, FileBarChart,
  CalendarDays, List, Zap, Globe, Plus, X, Clock, ChevronRight,
  Trash2, RefreshCw, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useUser } from '@/hooks/useUser'
import useSubscription from '@/hooks/useSubscription'
import { SURFACE_CLASS } from '../design-system/tokens'
import { AnalyticsPageContainer } from '../components/AnalyticsPageContainer'
import { useAnalyticsActiveRoute } from '../hooks/useAnalyticsActiveRoute'
import {
  resolveDateRange,
  type DateRangePreset,
  type CustomDateRange,
  type ComparisonConfig,
  DEFAULT_DATE_RANGE,
} from '../design-system'
import { DateRangeSelect } from '../design-system/components/DateRangeSelect'
import { runExport, type ExportOptions, type ReportData } from '../reports/exportUtils'
import {
  PlatformFilterProvider,
  useOptionalPlatformFilter,
  type PlatformSelection,
} from '../context/PlatformFilterContext'

// ── Types ────────────────────────────────────────────────────────────────

interface SavedReport {
  id: string
  name: string
  format: 'pdf' | 'excel' | 'csv' | 'pptx'
  sections: string[]
  periodLabel: string
  compareLabel?: string
  exportedAt: string // ISO
  exportedBy: string
  workspaceId: string
}

// ── Sections ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'overview', label: 'Overview KPIs', icon: BarChart3, description: 'Reach, views, engagement, followers summary' },
  { id: 'daily', label: 'Daily Trend', icon: Calendar, description: 'Day-by-day reach, views, engagements, followers' },
  { id: 'audience', label: 'Audience Demographics', icon: Users, description: 'Country, city, gender & age breakdown' },
  { id: 'reach', label: 'Reach & Impressions', icon: Radar, description: 'Total views and reach per period' },
  { id: 'engagement', label: 'Engagement Breakdown', icon: Heart, description: 'Likes, comments, shares, saves, rate' },
  { id: 'content', label: 'Content Performance', icon: FileBarChart, description: 'Total views, saves, share rate across content' },
  { id: 'publishing', label: 'Publishing Stats', icon: CalendarDays, description: 'Published vs failed, success rate' },
  { id: 'posts', label: 'Top Posts (up to 50)', icon: List, description: 'Full post-level metrics with links' },
]

const QUICK_REPORTS = [
  { id: 'monthly', label: 'Monthly Performance', preset: 'last_month' as DateRangePreset, sections: ['overview', 'daily', 'audience', 'engagement', 'publishing', 'posts'], icon: Calendar },
  { id: 'weekly', label: 'Weekly Summary', preset: 'last_7d' as DateRangePreset, sections: ['overview', 'daily', 'engagement', 'posts'], icon: Zap },
  { id: 'audience', label: 'Audience Report', preset: 'last_30d' as DateRangePreset, sections: ['overview', 'audience'], icon: Globe },
  { id: 'content', label: 'Content Deep Dive', preset: 'last_30d' as DateRangePreset, sections: ['overview', 'content', 'posts'], icon: FileBarChart },
]

const FORMATS = [
  { id: 'pdf', label: 'PDF', icon: FileText, desc: 'Executive report with charts & tables', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' },
  { id: 'excel', label: 'Excel', icon: Table2, desc: 'Multi-sheet workbook with full data', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
  { id: 'csv', label: 'CSV', icon: Table2, desc: 'Raw data for BI tools & analysis', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' },
  { id: 'pptx', label: 'PowerPoint', icon: Presentation, desc: 'Editable slides with AI speaker notes', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' },
]

const FORMAT_ICONS: Record<string, React.FC<any>> = { pdf: FileText, excel: Table2, csv: Table2, pptx: Presentation }
const FORMAT_COLORS: Record<string, string> = { pdf: 'text-red-500', excel: 'text-emerald-600', csv: 'text-blue-500', pptx: 'text-orange-500' }
const FORMAT_BG: Record<string, string> = { pdf: 'bg-red-50 dark:bg-red-900/20', excel: 'bg-emerald-50 dark:bg-emerald-900/20', csv: 'bg-blue-50 dark:bg-blue-900/20', pptx: 'bg-orange-50 dark:bg-orange-900/20' }

const STORAGE_KEY = 'vf_report_history'

function loadHistory(wsId: string): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const all: SavedReport[] = JSON.parse(raw)
    return all.filter((r) => r.workspaceId === wsId).sort((a, b) => b.exportedAt.localeCompare(a.exportedAt))
  } catch { return [] }
}

function saveToHistory(report: SavedReport) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all: SavedReport[] = raw ? JSON.parse(raw) : []
    all.unshift(report)
    // Keep last 50 per workspace
    const trimmed = all.slice(0, 100)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {}
}

function deleteFromHistory(id: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all: SavedReport[] = raw ? JSON.parse(raw) : []
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.filter((r) => r.id !== id)))
  } catch {}
}

// ── Export Drawer (slide-up) ───────────────────────────────────────────────

interface ExportDrawerProps {
  open: boolean
  onClose: () => void
  workspaceId: string
  workspaceName: string
  userName: string
  onExported: (report: SavedReport) => void
  /** Active platform selection from PlatformFilterContext. Requirements: 6.1, 6.2, 6.4 */
  platforms?: PlatformSelection
}

function ExportDrawer({ open, onClose, workspaceId, workspaceName, userName, onExported, platforms }: ExportDrawerProps) {
  const { limits } = useSubscription()
  // Free plan (analyticsExport === 'watermarked_pdf') may only export a
  // watermarked PDF. Creator+ (analyticsExport === 'full') unlock all formats.
  const canFullExport = limits?.features?.analyticsExport === 'full'
  const willWatermark = !canFullExport && limits?.features?.whiteLabelReports !== true
  const [dateRange, setDateRange] = useState<DateRangePreset>(DEFAULT_DATE_RANGE)
  const [customRange, setCustomRange] = useState<CustomDateRange>({})
  const [comparison, setComparison] = useState<ComparisonConfig>({ mode: 'previous' })
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set(SECTIONS.map((s) => s.id)))
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'excel' | 'csv' | 'pptx'>('pdf')
  const [reportName, setReportName] = useState('Veefore Analytics Report')
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'fetching' | 'generating' | 'done' | 'error'>('idle')

  // If the plan doesn't allow full export, force the format back to PDF.
  useEffect(() => {
    if (!canFullExport && selectedFormat !== 'pdf') setSelectedFormat('pdf')
  }, [canFullExport, selectedFormat])

  const range = useMemo(
    () => resolveDateRange(dateRange, new Date(), customRange, comparison),
    [dateRange, customRange, comparison]
  )

  const toggleSection = (id: string) =>
    setSelectedSections((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const applyQuick = (q: typeof QUICK_REPORTS[0]) => {
    setDateRange(q.preset)
    setSelectedSections(new Set(q.sections))
    setReportName(`${q.label} — ${workspaceName}`)
  }

  const handleExport = async () => {
    if (!workspaceId || selectedSections.size === 0 || isExporting) return
    setIsExporting(true); setStatus('fetching')
    try {
      const params = new URLSearchParams({ workspaceId })
      if (range.from) params.set('from', range.from)
      if (range.to) params.set('to', range.to)
      if (range.compareFrom) params.set('compareFrom', range.compareFrom)
      if (range.compareTo) params.set('compareTo', range.compareTo)
      // Thread the platform selection into the export-data request.
      // 'all' → omit param (backend returns merged data for all platforms).
      // 'instagram' | 'facebook' → scope the report to that platform.
      // Requirements: 6.1, 6.2, 6.4
      if (platforms && platforms !== 'all') {
        params.set('platforms', platforms)
      }
      const data: ReportData = await apiRequest(`/api/v1/analytics/reports/export-data?${params}`)
      data.meta.exportedBy = userName
      setStatus('generating')
      await runExport({ reportName, sections: [...selectedSections], format: selectedFormat, data })
      // Save to history
      const saved: SavedReport = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: reportName,
        format: selectedFormat,
        sections: [...selectedSections],
        periodLabel: data.meta.periodLabel,
        compareLabel: data.meta.prevPeriodLabel,
        exportedAt: new Date().toISOString(),
        exportedBy: userName,
        workspaceId,
      }
      saveToHistory(saved)
      onExported(saved)
      setStatus('done')
      setTimeout(() => { setStatus('idle'); onClose() }, 1500)
    } catch (err) {
      console.error('[EXPORT]', err)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    } finally {
      setIsExporting(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}
      {/* Right-side panel — full height from top since no global header */}
      <div className={cn(
        'fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-white dark:bg-gray-900 shadow-2xl transition-transform duration-300 ease-in-out border-l border-gray-200 dark:border-gray-800',
        open ? 'translate-x-0' : 'translate-x-full'
      )} style={{ width: 'min(760px, 95vw)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Create New Report</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure and export your analytics report</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Quick templates */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quick templates</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUICK_REPORTS.map((q) => {
                const Icon = q.icon
                return (
                  <button key={q.id} type="button" onClick={() => applyQuick(q)}
                    className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-left transition-all">
                    <Icon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <div>
                      <p className="text-[12px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">{q.label}</p>
                      <p className="text-[10px] text-gray-400">{q.sections.length} sections</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2-col layout: left config, right format */}
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Left: name + time + sections */}
            <div className="sm:col-span-2 space-y-4">
              {/* Report name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Report name</label>
                <input type="text" value={reportName} onChange={(e) => setReportName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="My Analytics Report" />
              </div>
              {/* Time range */}
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Time range & comparison</p>
                <DateRangeSelect value={dateRange} onChange={setDateRange}
                  customRange={customRange} onCustomRangeChange={setCustomRange}
                  comparison={comparison} onComparisonChange={setComparison} />
                {range.from && range.to && (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-600 dark:text-gray-300">Period:</span>{' '}
                      {new Date(range.from).toLocaleDateString()} – {new Date(range.to).toLocaleDateString()}
                    </p>
                    {range.compareFrom && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="font-medium text-gray-600 dark:text-gray-300">vs:</span>{' '}
                        {new Date(range.compareFrom).toLocaleDateString()} – {range.compareTo ? new Date(range.compareTo).toLocaleDateString() : ''}
                      </p>
                    )}
                    {comparison.mode === 'none' && (
                      <p className="text-[11px] text-amber-500">No comparison selected — change % will not appear in report</p>
                    )}
                  </div>
                )}
              </div>
              {/* Sections */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Report sections</p>
                  <div className="flex gap-3 text-[11px] text-blue-600 dark:text-blue-400">
                    <button type="button" onClick={() => setSelectedSections(new Set(SECTIONS.map((s) => s.id)))}>All</button>
                    <button type="button" onClick={() => setSelectedSections(new Set())}>None</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {SECTIONS.map((s) => {
                    const checked = selectedSections.has(s.id)
                    const Icon = s.icon
                    return (
                      <button key={s.id} type="button" onClick={() => toggleSection(s.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors',
                          checked ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                            : 'border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600'
                        )}>
                        {checked
                          ? <CheckSquare className="h-3.5 w-3.5 flex-shrink-0 text-blue-600" />
                          : <Square className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <Icon className="h-3 w-3 flex-shrink-0 text-gray-400" />
                            <span className="text-[12px] font-medium text-gray-900 dark:text-gray-100 truncate">{s.label}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            {/* Right: format picker */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Export format</p>
              {FORMATS.map((f) => {
                const Icon = f.icon
                const sel = selectedFormat === f.id
                // Free plan: only PDF (watermarked) is allowed. Other formats are
                // locked and route to billing.
                const locked = !canFullExport && f.id !== 'pdf'
                return (
                  <button key={f.id} type="button"
                    onClick={() => { if (locked) { window.location.href = '/settings/billing'; return } setSelectedFormat(f.id as any) }}
                    title={locked ? 'Full exports require the Creator plan or higher' : ''}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                      locked ? 'opacity-50 border-gray-100 dark:border-gray-700/50'
                        : sel ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                        : cn('border-gray-100 dark:border-gray-700/50 hover:border-gray-200', f.border)
                    )}>
                    <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', f.bg)}>
                      <Icon className={cn('h-5 w-5', f.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className={cn('text-sm font-semibold flex items-center gap-1.5', sel ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100')}>
                        {f.label}
                        {locked && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-900/30 rounded px-1 py-0.5">Creator+</span>}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{f.desc}</p>
                    </div>
                  </button>
                )
              })}
              {willWatermark && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
                  Free exports are watermarked PDFs. Upgrade to Creator for clean PDF, Excel, CSV & PowerPoint exports.
                </p>
              )}
            </div>
          </div>
        </div>
        {/* Footer CTA */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          {status !== 'idle' && (
            <p className={cn('text-center text-[12px] font-medium mb-2',
              status === 'done' ? 'text-emerald-600' : status === 'error' ? 'text-red-500' : 'text-gray-500'
            )}>
              {status === 'fetching' ? 'Fetching analytics data...'
                : status === 'generating' ? 'Generating report...'
                : status === 'done' ? 'Report exported successfully!'
                : 'Export failed. Please try again.'}
            </p>
          )}
          <button type="button" onClick={handleExport}
            disabled={isExporting || selectedSections.size === 0}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition-all',
              isExporting || selectedSections.size === 0
                ? 'cursor-not-allowed bg-gray-300 dark:bg-gray-700'
                : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white shadow-lg active:scale-[0.99]'
            )}>
            {isExporting
              ? <><Loader2 className="h-4 w-4 animate-spin" />{status === 'fetching' ? 'Fetching...' : 'Generating...'}</>
              : <><Download className="h-4 w-4" />Export as {selectedFormat.toUpperCase()} · {selectedSections.size} sections</>
            }
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

function MyReportsPageInner() {
  const { breadcrumbs } = useAnalyticsActiveRoute()
  const { currentWorkspace, currentWorkspaceId } = useCurrentWorkspace()
  const { user, userData } = useUser()
  const userName = user?.email ?? userData?.email ?? userData?.displayName ?? 'Unknown'
  // Consume platform filter (optional — safe when outside PlatformFilterProvider).
  const platformFilter = useOptionalPlatformFilter()
  const platformSelection = platformFilter?.selection ?? 'all'

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [history, setHistory] = useState<SavedReport[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Load history from localStorage
  useEffect(() => {
    if (currentWorkspaceId) {
      setHistory(loadHistory(currentWorkspaceId))
    }
  }, [currentWorkspaceId])

  const handleExported = useCallback((report: SavedReport) => {
    setHistory((prev) => [report, ...prev])
  }, [])

  const handleDelete = (id: string) => {
    deleteFromHistory(id)
    setHistory((prev) => prev.filter((r) => r.id !== id))
    setDeletingId(null)
  }

  const formatLabel = (f: string) => FORMATS.find((x) => x.id === f)?.label ?? f.toUpperCase()

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <AnalyticsPageContainer
      title="My Reports"
      description="View your exported reports history and create new ones."
      breadcrumbs={breadcrumbs}
      workspaceName={currentWorkspace?.name}
      actions={
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-gray-900 shadow-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Report
        </button>
      }
    >
      <div className="space-y-6">
        {/* Empty state */}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">No reports yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-6">
              Create your first report to see it here. All exports are saved for quick re-download.
            </p>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-gray-900 shadow hover:bg-gray-800 transition-all"
            >
              <Plus className="h-4 w-4" />
              Create your first report
            </button>
          </div>
        )}

        {/* Report history list */}
        {history.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Export History <span className="ml-1 text-gray-400 font-normal">({history.length})</span>
              </h2>
              <button
                type="button"
                onClick={() => currentWorkspaceId && setHistory(loadHistory(currentWorkspaceId))}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
            </div>

            {history.map((report) => {
              const FmtIcon = FORMAT_ICONS[report.format] ?? FileText
              const fmtColor = FORMAT_COLORS[report.format] ?? 'text-gray-500'
              const fmtBg = FORMAT_BG[report.format] ?? 'bg-gray-50'
              const isDeleting = deletingId === report.id

              return (
                <div key={report.id}
                  className="group flex items-center gap-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:border-gray-200 dark:hover:border-gray-700 transition-all">
                  {/* Format icon */}
                  <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', fmtBg)}>
                    <FmtIcon className={cn('h-5 w-5', fmtColor)} />
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{report.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{formatLabel(report.format)}</span>
                      <span className="text-[11px] text-gray-400">·</span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{report.periodLabel}</span>
                      {report.compareLabel && (
                        <>
                          <span className="text-[11px] text-gray-400">vs</span>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">{report.compareLabel}</span>
                        </>
                      )}
                      <span className="text-[11px] text-gray-400">·</span>
                      <span className="text-[11px] text-gray-400">{report.sections.length} sections</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                      <Clock className="h-3 w-3" />
                      {timeAgo(report.exportedAt)} · {report.exportedBy}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isDeleting ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setDeletingId(report.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div className="text-[11px] text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1 font-mono uppercase">
                          {report.format}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">Delete?</span>
                        <button type="button" onClick={() => handleDelete(report.id)}
                          className="text-[11px] font-medium text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          Yes
                        </button>
                        <button type="button" onClick={() => setDeletingId(null)}
                          className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Quick action card at bottom */}
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex w-full items-center justify-between rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-4 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                <Plus className="h-4 w-4 text-gray-500" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Create another report</p>
                <p className="text-[11px] text-gray-400">PDF, Excel, CSV, or PowerPoint</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          </button>
        )}
      </div>

      {/* Slide-up export drawer */}
      <ExportDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        workspaceId={currentWorkspaceId ?? ''}
        workspaceName={currentWorkspace?.name ?? 'My Workspace'}
        userName={userName}
        onExported={handleExported}
        platforms={platformSelection}
      />
    </AnalyticsPageContainer>
  )
}

/**
 * Public export — wraps MyReportsPageInner with PlatformFilterProvider so that
 * the platform selection propagates into the ExportDrawer API call.
 * Requirements: 6.1, 6.2, 6.4
 */
export function MyReportsPage() {
  return (
    <PlatformFilterProvider>
      <MyReportsPageInner />
    </PlatformFilterProvider>
  )
}
