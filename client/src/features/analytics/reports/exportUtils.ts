/**
 * Veefore Enterprise Report Export System
 * Four completely separate export engines:
 *   1. PDF  — Executive business report with narrative + charts
 *   2. PPTX — Presentation with AI speaker notes + editable charts
 *   3. Excel — Multi-sheet workbook with formulas + conditional formatting
 *   4. CSV  — Clean machine-readable raw data
 *
 * Brand identity: Black / White / Gray — NO purple, NO blue gradients
 * Accent: Near-black (#111827), Mid-gray (#6b7280), Light (#f9fafb)
 * Positive highlight: #16a34a (green), Negative: #dc2626 (red), Warning: #d97706 (orange)
 *
 * Multi-platform support (Requirements 9.1–9.7):
 * - shouldIncludeMetricSection() gates every metric row via the Platform Registry
 * - platformData map carries per-platform KPI snapshots for combined reports
 * - All four export formats prefix headers / add section labels for multi-platform reports
 */

import {
  shouldIncludeMetricSection,
  getSupportingPlatforms,
  isComparisonMetric,
  platformDisplayName,
} from './reportGuard'
import type { PlatformId } from './reportGuard'

// ── Shared Types ───────────────────────────────────────────────────────────

export interface ReportData {
  meta: {
    workspaceId: string; workspaceName: string; from: string; to: string; spanDays: number
    generatedAt: string; exportedBy: string; periodLabel: string; prevPeriodLabel: string
    platform: string; apiVersion: string
    /** Plan-driven export capabilities (set by the server). */
    exportMode?: 'watermarked_pdf' | 'full'
    /** When true, the export must carry a Veefore watermark (Free plan). */
    watermark?: boolean
    /** Business+ can strip Veefore branding from exports. */
    whiteLabel?: boolean
    /** Pro+ unlocks richer report sections. */
    advancedReports?: boolean
    /** Export formats the plan permits. */
    allowedFormats?: Array<'pdf' | 'excel' | 'csv' | 'pptx'>
  }
  /**
   * Task 12.1 / 12.2 additions — multi-platform fields.
   *
   * `platforms`    — ordered list of active PlatformIds for this report.
   *                  When absent/empty the report is treated as single-platform.
   * `platformData` — per-platform KPI snapshot keyed by PlatformId.
   *                  Only the keys actually supported by that platform are
   *                  present (never set to 0 for unsupported metrics).
   * `platformDataUnavailable` — platforms whose data could not be fetched at
   *                  report generation time.  They still receive a branded
   *                  section labelled "[Platform] — Data unavailable as of …"
   *                  (Requirement 9.5).
   */
  platforms?: PlatformId[]
  platformData?: Record<string, Partial<ReportData['kpis']>>
  platformDataUnavailable?: PlatformId[]

  accountInfo: { username: string; platform: string; accountType: string; followersCount: number; followingCount: number; mediaCount: number; engagementRate: number; profilePictureUrl?: string } | null
  kpis: {
    reach: number; prevReach: number; reachChange: number | null
    views: number; prevViews: number; viewsChange: number | null
    engagements: number; prevEngagements: number; engagementsChange: number | null
    engRate: number; prevEngRate: number; engRateChange: number | null
    likes: number; prevLikes: number; likesChange: number | null
    comments: number; prevComments: number; commentsChange: number | null
    shares: number; prevShares: number; sharesChange: number | null
    saves: number; prevSaves: number; savesChange: number | null
    saveRate: number; prevSaveRate: number; saveRateChange: number | null
    shareRate: number; prevShareRate: number; shareRateChange: number | null
    profileViews: number; prevProfileViews: number; profileViewsChange: number | null
    websiteClicks: number; prevWebsiteClicks: number; websiteClicksChange: number | null
    followersTotal: number; followingTotal: number
    newFollowers: number; prevNewFollowers: number; lostFollowers: number; prevLostFollowers: number
    netFollowers: number; prevNetFollowers: number
    newFollowersChange: number | null; lostFollowersChange: number | null
    publishedPosts: number; failedPosts: number; publishingSuccessRate: number
    performanceScore: number; scoreLabel: string
  }
  dailySeries: Array<{ date: string; reach: number; views: number; likes: number; comments: number; shares: number; saves: number; engagements: number; profileViews: number; websiteClicks: number; newFollowers: number; lostFollowers: number }>
  demographics: { country: Array<{ label: string; value: number }>; city: Array<{ label: string; value: number }>; genderAge: Array<{ label: string; value: number }>; activeTime: Record<string, number>; weeklyActiveTime: Record<string, number> }
  posts: PostItem[]; topPosts: PostItem[]; worstPosts: PostItem[]; reels: PostItem[]; carousels: PostItem[]; images: PostItem[]
  aiSummary: string; aiInsights: string[]; contentStrategy: string
  recommendations: Array<{ title: string; explanation: string; confidence: string; priority: string; expectedImpact: string; difficulty: string }>
  opportunities: Array<{ area: string; description: string; priority: string; impact: string; difficulty: string }>
}

export interface PostItem {
  rank: number; id: string; title: string; publishedAt: string | null
  mediaType: string; permalink: string | null; thumbnailUrl: string | null
  metrics: { reach: number; views: number; likes: number; comments: number; shares: number; saves: number; engagements: number; engRate: number }
}

export interface ExportOptions {
  reportName: string; format: 'pdf' | 'excel' | 'csv' | 'pptx'; data: ReportData
}

// ── Brand Tokens ───────────────────────────────────────────────────────────

const B = {
  // Core identity — black/white/gray
  black: '#111827',      blackHex: '111827',
  charcoal: '#1f2937',   charcoalHex: '1f2937',
  darkGray: '#374151',   darkGrayHex: '374151',
  midGray: '#6b7280',    midGrayHex: '6b7280',
  lightGray: '#d1d5db',  lightGrayHex: 'd1d5db',
  offWhite: '#f3f4f6',   offWhiteHex: 'f3f4f6',
  white: '#ffffff',      whiteHex: 'ffffff',
  // Accent
  green: '#16a34a',      greenHex: '16a34a',
  greenLight: '#dcfce7', greenLightHex: 'dcfce7',
  red: '#dc2626',        redHex: 'dc2626',
  redLight: '#fee2e2',   redLightHex: 'fee2e2',
  orange: '#d97706',     orangeHex: 'd97706',
  orangeLight: '#fef3c7',orangeLightHex: 'fef3c7',
  // NO PURPLE/BLUE anywhere
} as const

// ── Multi-platform utilities ───────────────────────────────────────────────

/**
 * Returns the active platforms array from the report data, falling back to
 * the single legacy platform string so all callers get a typed array.
 */
function activePlatforms(data: ReportData): PlatformId[] {
  if (data.platforms && data.platforms.length > 0) return data.platforms
  // Legacy single-platform path
  const p = (data.meta.platform || data.accountInfo?.platform || 'instagram').toLowerCase() as PlatformId
  return [p]
}

/** True when the report covers more than one platform. */
function isMultiPlatform(data: ReportData): boolean {
  return activePlatforms(data).length > 1
}

/**
 * Platform logo assets keyed by PlatformId.
 *
 * In PDF/PPTX we embed a small Unicode symbol + styled text label because
 * embedding binary PNG assets requires async fetching in the browser bundle.
 * For Excel/CSV the prefix is pure text.
 *
 * Requirement 9.4: "embed platform logos adjacent to every metric section header"
 */
const PLATFORM_LABEL: Record<string, string> = {
  instagram: '📸 Instagram',
  facebook: '📘 Facebook',
  linkedin: '💼 LinkedIn',
  youtube: '▶ YouTube',
  tiktok: '🎵 TikTok',
  pinterest: '📌 Pinterest',
  x: '✖ X',
  threads: '🧵 Threads',
}

/**
 * Column prefix used in Excel/CSV exports to unambiguously label data origin.
 * Requirement 9.4: "prefix column headers with Instagram_ or Facebook_"
 */
function platformColPrefix(platform: PlatformId): string {
  return `${platformDisplayName(platform)}_`
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function fmtNum(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return 'n/a'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'n/a'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtChange(c: number | null | undefined, suffix = '%'): string {
  if (c == null) return 'n/a'
  return `${c > 0 ? '+' : ''}${c}${suffix}`
}

function fmtHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function statusColor(c: number | null): string {
  if (c == null) return B.midGray
  return c > 0 ? B.green : c < 0 ? B.red : B.midGray
}

// ── Canvas Chart Renderers ─────────────────────────────────────────────────
// Render charts to PNG using HTML5 Canvas — black/white/gray only

function drawLineAreaChart(
  series: { label: string; values: number[]; color: string }[],
  xLabels: string[], width = 800, height = 240, title = '', showArea = true
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  const pad = { top: 38, right: 24, bottom: 44, left: 64 }
  const cw = width - pad.left - pad.right; const ch = height - pad.top - pad.bottom
  const allVals = series.flatMap((s) => s.values)
  const maxVal = Math.max(...allVals, 1)
  const skip = Math.max(1, Math.ceil(xLabels.length / 12))

  // Background
  ctx.fillStyle = B.white; ctx.fillRect(0, 0, width, height)

  // Title
  if (title) {
    ctx.fillStyle = B.black; ctx.font = 'bold 13px "Arial", sans-serif'
    ctx.fillText(title, pad.left, 22)
  }

  // Grid lines + y-labels
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i
    ctx.strokeStyle = B.lightGray; ctx.lineWidth = 0.5
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke()
    ctx.setLineDash([])
    const v = Math.round(maxVal - (maxVal / 4) * i)
    ctx.fillStyle = B.midGray; ctx.font = '9px Arial'; ctx.textAlign = 'right'
    ctx.fillText(fmtNum(v), pad.left - 6, y + 3)
  }

  // X-axis
  ctx.strokeStyle = B.lightGray; ctx.lineWidth = 1; ctx.setLineDash([])
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ch); ctx.lineTo(pad.left + cw, pad.top + ch); ctx.stroke()

  const px = (i: number) => pad.left + (i / Math.max(xLabels.length - 1, 1)) * cw
  const py = (v: number) => pad.top + ch - (v / maxVal) * ch

  // Area + line per series
  series.forEach(({ values, color }) => {
    if (showArea) {
      ctx.beginPath()
      ctx.moveTo(px(0), pad.top + ch)
      values.forEach((v, i) => ctx.lineTo(px(i), py(v)))
      ctx.lineTo(px(values.length - 1), pad.top + ch)
      ctx.closePath()
      ctx.globalAlpha = 0.08; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1
    }
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([])
    values.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)))
    ctx.stroke()
  })

  // X labels
  xLabels.forEach((lbl, i) => {
    if (i % skip !== 0 && i !== xLabels.length - 1) return
    ctx.fillStyle = B.midGray; ctx.font = '8px Arial'; ctx.textAlign = 'center'
    ctx.fillText(lbl.slice(5), px(i), height - 6)
  })

  // Legend
  if (series.length > 1) {
    let lx = pad.left
    series.forEach(({ label, color }) => {
      ctx.fillStyle = color; ctx.fillRect(lx, height - 16, 12, 4)
      ctx.fillStyle = B.midGray; ctx.font = '9px Arial'; ctx.textAlign = 'left'
      ctx.fillText(label, lx + 14, height - 10)
      lx += ctx.measureText(label).width + 30
    })
  }

  return canvas.toDataURL('image/png')
}

function drawBarChart(labels: string[], values: number[], color: string, width = 800, height = 200, title = ''): string {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  const pad = { top: 36, right: 20, bottom: 44, left: 64 }
  const cw = width - pad.left - pad.right; const ch = height - pad.top - pad.bottom
  const maxVal = Math.max(...values, 1)
  const skip = Math.max(1, Math.ceil(labels.length / 14))

  ctx.fillStyle = B.white; ctx.fillRect(0, 0, width, height)
  if (title) { ctx.fillStyle = B.black; ctx.font = 'bold 12px Arial'; ctx.fillText(title, pad.left, 22) }

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i
    ctx.strokeStyle = B.lightGray; ctx.lineWidth = 0.5; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = B.midGray; ctx.font = '9px Arial'; ctx.textAlign = 'right'
    ctx.fillText(fmtNum(Math.round(maxVal - (maxVal / 4) * i)), pad.left - 6, y + 3)
  }

  const bw = Math.max(2, (cw / labels.length) * 0.6)
  const step = cw / labels.length
  labels.forEach((lbl, i) => {
    const h = (values[i] / maxVal) * ch
    const x = pad.left + i * step + (step - bw) / 2
    const y = pad.top + ch - h
    ctx.fillStyle = color
    // Rounded top
    const r = Math.min(3, bw / 2)
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + bw - r, y)
    ctx.arcTo(x + bw, y, x + bw, y + r, r); ctx.lineTo(x + bw, y + h)
    ctx.lineTo(x, y + h); ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); ctx.fill()

    if (i % skip === 0) {
      ctx.fillStyle = B.midGray; ctx.font = '8px Arial'; ctx.textAlign = 'center'
      ctx.fillText(lbl.slice(5), pad.left + i * step + step / 2, height - 6)
    }
  })

  ctx.strokeStyle = B.lightGray; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ch); ctx.lineTo(pad.left + cw, pad.top + ch); ctx.stroke()
  return canvas.toDataURL('image/png')
}

function drawHorizontalBar(labels: string[], values: number[], color: string, width = 400, height = 220): string {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = B.white; ctx.fillRect(0, 0, width, height)
  const maxVal = Math.max(...values, 1)
  const labelW = 120; const rowH = height / Math.min(labels.length, 12)
  const maxItems = Math.floor(height / rowH)

  labels.slice(0, maxItems).forEach((lbl, i) => {
    const bw = Math.max(2, (values[i] / maxVal) * (width - labelW - 40))
    const y = i * rowH
    const r = 3
    ctx.fillStyle = color; ctx.globalAlpha = 0.85
    ctx.beginPath(); ctx.moveTo(labelW, y + 4); ctx.lineTo(labelW + bw - r, y + 4)
    ctx.arcTo(labelW + bw, y + 4, labelW + bw, y + 4 + r, r)
    ctx.lineTo(labelW + bw, y + rowH - 6); ctx.arcTo(labelW + bw, y + rowH - 2, labelW + bw - r, y + rowH - 2, r)
    ctx.lineTo(labelW, y + rowH - 2); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = B.black; ctx.font = '9px Arial'; ctx.textAlign = 'right'
    ctx.fillText(lbl.slice(0, 18), labelW - 6, y + rowH * 0.65)
    ctx.fillStyle = B.midGray; ctx.font = '8px Arial'; ctx.textAlign = 'left'
    ctx.fillText(fmtNum(values[i]), labelW + bw + 4, y + rowH * 0.65)
  })
  return canvas.toDataURL('image/png')
}

function drawDonutChart(labels: string[], values: number[], width = 220, height = 220): string {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = B.white; ctx.fillRect(0, 0, width, height)
  const total = values.reduce((a, b) => a + b, 0) || 1
  const cx = width / 2; const cy = height / 2; const r = Math.min(cx, cy) - 12
  // Grayscale palette
  const grays = ['111827', '374151', '6b7280', '9ca3af', 'd1d5db', 'e5e7eb', 'f3f4f6', '1f2937']
  let start = -Math.PI / 2
  values.forEach((v, i) => {
    const arc = (v / total) * 2 * Math.PI
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, start + arc)
    ctx.closePath(); ctx.fillStyle = `#${grays[i % grays.length]}`; ctx.fill()
    start += arc
  })
  // Donut hole + center text
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.58, 0, 2 * Math.PI)
  ctx.fillStyle = B.white; ctx.fill()
  ctx.fillStyle = B.black; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'
  ctx.fillText(fmtNum(total), cx, cy + 3)
  ctx.fillStyle = B.midGray; ctx.font = '9px Arial'
  ctx.fillText('Total', cx, cy + 15)
  return canvas.toDataURL('image/png')
}

function drawHeatmapGrid(weeklyData: Record<string, number>, width = 720, height = 160): string {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = B.white; ctx.fillRect(0, 0, width, height)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const labelW = 36; const cellW = (width - labelW) / 24; const cellH = (height - 20) / 7
  const vals = Object.values(weeklyData).map(Number)
  const maxV = Math.max(...vals, 1)

  // Hour labels
  const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21]
  hourTicks.forEach((h) => {
    ctx.fillStyle = B.midGray; ctx.font = '8px Arial'; ctx.textAlign = 'center'
    ctx.fillText(fmtHour(h), labelW + h * cellW + cellW / 2, height - 2)
  })

  days.forEach((day, d) => {
    ctx.fillStyle = B.midGray; ctx.font = '8px Arial'; ctx.textAlign = 'right'
    ctx.fillText(day, labelW - 4, 20 + d * cellH + cellH * 0.65)
    hours.forEach((h) => {
      const v = weeklyData[`${d}_${h}`] ?? 0
      const intensity = v / maxV
      const gray = Math.round(240 - intensity * 200)
      const x = labelW + h * cellW; const y = 10 + d * cellH
      ctx.fillStyle = `rgb(${gray},${gray},${gray})`
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2)
    })
  })
  return canvas.toDataURL('image/png')
}

// ── 1. PDF Export — Enterprise Executive Report ────────────────────────────

export async function exportPDF(opts: ExportOptions): Promise<void> {
  const jsPDFMod = await import('jspdf')
  const autoMod = await import('jspdf-autotable')
  const jsPDF = jsPDFMod.default ?? (jsPDFMod as any).jsPDF
  const autoTable = (autoMod.default ?? autoMod) as any

  const { data, reportName } = opts
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  let y = 0; let pageNum = 0

  // Colour helpers (RGB arrays for jsPDF)
  const RGB = {
    black: [17, 24, 39] as [number,number,number],
    charcoal: [31, 41, 55] as [number,number,number],
    darkGray: [55, 65, 81] as [number,number,number],
    midGray: [107, 114, 128] as [number,number,number],
    lightGray: [209, 213, 219] as [number,number,number],
    offWhite: [243, 244, 246] as [number,number,number],
    white: [255, 255, 255] as [number,number,number],
    green: [22, 163, 74] as [number,number,number],
    greenLight: [220, 252, 231] as [number,number,number],
    red: [220, 38, 38] as [number,number,number],
    redLight: [254, 226, 226] as [number,number,number],
    orange: [217, 119, 6] as [number,number,number],
  }

  const addHeader = (title: string) => {
    doc.setFillColor(...RGB.black)
    doc.rect(0, 0, W, 10, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.offWhite)
    doc.text('VEEFORE', 14, 6.5)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
    doc.text(title, W / 2, 6.5, { align: 'center' })
    doc.text(`${data.meta.workspaceName}  ·  ${data.meta.periodLabel}`, W - 14, 6.5, { align: 'right' })
  }

  // Free-plan exports carry a diagonal Veefore watermark. Business+ (whiteLabel)
  // and Creator/Pro (full export) never watermark.
  const showWatermark = data.meta.watermark === true && data.meta.whiteLabel !== true

  const addPageFooter = () => {
    const total = (doc as any).internal.pages.length - 1
    for (let i = 1; i <= total; i++) {
      doc.setPage(i)
      if (showWatermark) {
        doc.setFontSize(52)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(230, 230, 230)
        try {
          doc.text('VEEFORE • FREE', W / 2, H / 2, { align: 'center', angle: 38 } as any)
        } catch {
          doc.text('VEEFORE • FREE', W / 2, H / 2, { align: 'center' })
        }
        doc.setTextColor(...RGB.black)
      }
      doc.setDrawColor(...RGB.lightGray); doc.setLineWidth(0.3)
      doc.line(14, H - 10, W - 14, H - 10)
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
      const footerLabel = data.meta.whiteLabel === true
        ? `${data.meta.workspaceName}  ·  Generated ${fmtDate(data.meta.generatedAt)}`
        : `Veefore Analytics Report  ·  ${data.meta.workspaceName}  ·  Generated ${fmtDate(data.meta.generatedAt)}`
      doc.text(footerLabel, 14, H - 6)
      doc.text(`Page ${i} of ${total}`, W - 14, H - 6, { align: 'right' })
    }
  }

  const newSection = (title: string, forceNewPage = false, minSpaceNeeded = 40) => {
    if (forceNewPage) { doc.addPage(); addHeader(reportName); y = 18 }
    else if (y > H - minSpaceNeeded) { doc.addPage(); addHeader(reportName); y = 18 }
    doc.setFillColor(...RGB.charcoal)
    doc.rect(14, y, W - 28, 8, 'F')
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
    doc.text(title.toUpperCase(), 18, y + 5.5)
    doc.setTextColor(...RGB.black)
    return y + 11
  }

  const kpiCard = (x: number, y: number, w: number, h: number, label: string, val: string, change?: string | null, positive?: boolean | null) => {
    doc.setFillColor(...RGB.offWhite)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F')
    doc.setDrawColor(...RGB.lightGray); doc.setLineWidth(0.3)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
    doc.text(label.toUpperCase(), x + w / 2, y + 4.5, { align: 'center' })
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.black)
    doc.text(val, x + w / 2, y + 11.5, { align: 'center' })
    if (change && change !== '—') {
      const pos = change.startsWith('+') || positive === true
      const neg = change.startsWith('-') && change !== '—' && positive !== true
      doc.setFontSize(7); doc.setFont('helvetica', 'bold')
      doc.setTextColor(...(pos ? RGB.green : neg ? RGB.red : RGB.midGray))
      doc.text(change, x + w / 2, y + 16.5, { align: 'center' })
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER (full-bleed, fills entire A4)
  // ════════════════════════════════════════════════════════════════════════
  doc.setFillColor(...RGB.black); doc.rect(0, 0, W, H, 'F')

  // ── Left accent stripe ───────────────────────────────────────────────
  doc.setFillColor(...RGB.darkGray); doc.rect(0, 0, 4, H, 'F')

  // ── Top header band ──────────────────────────────────────────────────
  doc.setFillColor(31, 41, 55); doc.rect(4, 0, W - 4, 16, 'F')
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(209, 213, 219)
  doc.text('VEEFORE', 14, 10)
  doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
  doc.text('ANALYTICS PLATFORM', 14, 14)
  doc.setFontSize(6); doc.setTextColor(107, 114, 128)
  doc.text('CONFIDENTIAL  ·  NOT FOR DISTRIBUTION', W - 14, 10, { align: 'right' })

  // ── Category chip ────────────────────────────────────────────────────
  doc.setFillColor(55, 65, 81); doc.roundedRect(14, 24, 44, 6.5, 1, 1, 'F')
  doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(209, 213, 219)
  doc.text('ANALYTICS REPORT', 36, 28.5, { align: 'center' })

  // ── Report title ─────────────────────────────────────────────────────
  doc.setFontSize(26); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  const titleLines = doc.splitTextToSize(reportName, W - 32) as string[]
  doc.text(titleLines, 14, 40)
  let cy = 40 + titleLines.length * 10 + 2

  // Subtitle rule
  doc.setDrawColor(55, 65, 81); doc.setLineWidth(0.4)
  doc.line(14, cy, 14 + 110, cy); cy += 8

  // ── Account info ─────────────────────────────────────────────────────
  if (data.accountInfo) {
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(209, 213, 219)
    doc.text(`@${data.accountInfo.username}`, 14, cy); cy += 6
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
    doc.text(`${data.accountInfo.platform}  ·  ${data.accountInfo.accountType}  ·  ${fmtNum(data.accountInfo.followersCount)} followers`, 14, cy); cy += 10
  }

  // ── Meta rows ────────────────────────────────────────────────────────
  const metaRows = [
    ['Report Period', data.meta.periodLabel],
    ['Comparison', data.meta.prevPeriodLabel],
    ['Exported by', data.meta.exportedBy],
    ['Generated', `${fmtDate(data.meta.generatedAt)}  ·  API ${data.meta.apiVersion}`],
  ]
  metaRows.forEach(([label, value]) => {
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128)
    doc.text(`${label}:`, 14, cy)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(209, 213, 219)
    doc.text(value, 42, cy); cy += 5.5
  })
  cy += 8

  // ── Performance score + 3 hero KPIs ──────────────────────────────────
  const score = data.kpis.performanceScore
  const scoreBg: [number,number,number] = score >= 80 ? [22,163,74] : score >= 60 ? [37,99,235] : [217,119,6]
  // Score box
  doc.setFillColor(...scoreBg); doc.roundedRect(14, cy, 46, 30, 2.5, 2.5, 'F')
  doc.setFontSize(24); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(`${score}`, 37, cy + 14, { align: 'center' })
  doc.setFontSize(6); doc.setFont('helvetica', 'normal')
  doc.text('PERFORMANCE SCORE', 37, cy + 21, { align: 'center' })
  doc.text(data.kpis.scoreLabel.toUpperCase(), 37, cy + 26, { align: 'center' })
  // 3 hero KPIs beside score
  const heroM = [
    { l: 'REACH', v: fmtNum(data.kpis.reach), c: data.kpis.reachChange },
    { l: 'ENGAGEMENTS', v: fmtNum(data.kpis.engagements), c: data.kpis.engagementsChange },
    { l: 'ENG. RATE', v: `${data.kpis.engRate}%`, c: data.kpis.engRateChange },
  ]
  heroM.forEach((m, i) => {
    const mx = 66 + i * 44
    doc.setFillColor(31, 41, 55); doc.roundedRect(mx, cy, 40, 30, 2, 2, 'F')
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
    doc.text(m.l, mx + 20, cy + 6, { align: 'center' })
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    doc.text(m.v, mx + 20, cy + 16, { align: 'center' })
    if (m.c !== null && m.c !== undefined) {
      const cc: [number,number,number] = m.c > 0 ? [22,163,74] : m.c < 0 ? [220,38,38] : [107,114,128]
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...cc)
      doc.text(`${m.c > 0 ? '+' : '-'}${Math.abs(m.c)}%`, mx + 20, cy + 25, { align: 'center' })
    }
  })
  cy += 36

  // ── Quick stats strip ─────────────────────────────────────────────────
  doc.setDrawColor(31, 41, 55); doc.setLineWidth(0.4)
  doc.line(14, cy, W - 14, cy); cy += 6
  const quickStats = [
    `${data.kpis.publishedPosts} posts published`,
    `${fmtNum(data.kpis.newFollowers)} new followers`,
    `${fmtNum(data.kpis.saves)} saves`,
    `${data.kpis.publishingSuccessRate}% success rate`,
    `${fmtNum(data.kpis.views)} impressions`,
  ]
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
  const qsW = (W - 28) / quickStats.length
  quickStats.forEach((s, i) => {
    doc.text(`· ${s}`, 14 + i * qsW, cy)
  })
  cy += 10

  // ── Divider before visual summary ────────────────────────────────────
  doc.setDrawColor(31, 41, 55); doc.line(14, cy, W - 14, cy); cy += 8

  // ── Visual KPI grid (2-col, 3 rows) — fills remaining space ──────────
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128)
  doc.text('PERIOD HIGHLIGHTS', 14, cy); cy += 5

  const hlKpis = [
    { label: 'Total Reach', value: fmtNum(data.kpis.reach), prev: fmtNum(data.kpis.prevReach), chg: data.kpis.reachChange },
    { label: 'Views / Impressions', value: fmtNum(data.kpis.views), prev: fmtNum(data.kpis.prevViews), chg: data.kpis.viewsChange },
    { label: 'Likes', value: fmtNum(data.kpis.likes), prev: fmtNum(data.kpis.prevLikes ?? 0), chg: null },
    { label: 'Comments', value: fmtNum(data.kpis.comments), prev: fmtNum(data.kpis.prevComments ?? 0), chg: null },
    { label: 'Saves', value: fmtNum(data.kpis.saves), prev: fmtNum(data.kpis.prevSaves ?? 0), chg: null },
    { label: 'New Followers', value: fmtNum(data.kpis.newFollowers), prev: fmtNum(data.kpis.prevNewFollowers ?? 0), chg: data.kpis.newFollowersChange },
  ]
  const hlCols = 3; const hlW = (W - 28 - 6) / hlCols; const hlH = 18
  hlKpis.forEach(({ label, value, prev, chg }, i) => {
    const col = i % hlCols; const row = Math.floor(i / hlCols)
    const hx = 14 + col * (hlW + 3); const hy = cy + row * (hlH + 3)
    doc.setFillColor(17, 24, 39); doc.roundedRect(hx, hy, hlW, hlH, 1.5, 1.5, 'F')
    doc.setDrawColor(55, 65, 81); doc.setLineWidth(0.3); doc.roundedRect(hx, hy, hlW, hlH, 1.5, 1.5, 'S')
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
    doc.text(label.toUpperCase(), hx + 5, hy + 4.5)
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    doc.text(value, hx + 5, hy + 12.5)
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
    doc.text(`prev: ${prev}`, hx + hlW - 5, hy + 12.5, { align: 'right' })
    if (chg !== null && chg !== undefined) {
      const chgC: [number,number,number] = chg > 0 ? [22,163,74] : chg < 0 ? [220,38,38] : [107,114,128]
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(...chgC)
      doc.text(`${chg > 0 ? '+' : ''}${chg}%`, hx + hlW - 5, hy + 4.5, { align: 'right' })
    }
  })
  cy += 2 * (hlH + 3) + 8

  // ── Bottom footer band ────────────────────────────────────────────────
  // Fill remaining space before footer
  doc.setFillColor(17, 24, 39); doc.rect(4, cy, W - 4, H - cy - 12, 'F')
  // Content of info band
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81)
  doc.text('This report contains confidential analytics data from your Veefore workspace. Distribution is restricted to authorised recipients.', 14, cy + 8, { maxWidth: W - 28 })
  // Final footer
  doc.setFillColor(31, 41, 55); doc.rect(0, H - 12, W, 12, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128)
  doc.text('Veefore Analytics  ·  enterprise-grade social media intelligence  ·  veefore.com', W / 2, H - 5, { align: 'center' })

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 2 — EXECUTIVE SUMMARY (standalone, full content)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); addHeader(reportName); y = 18

  // Table of Contents — compact 2-col layout
  doc.setFillColor(...RGB.offWhite); doc.roundedRect(14, y, W - 28, 22, 2, 2, 'F')
  doc.setFillColor(...RGB.charcoal); doc.roundedRect(14, y, 36, 22, 2, 2, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
  doc.text('CONTENTS', 32, y + 9, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
  const toc = ['1  Executive Summary', '2  Key Performance Indicators', '3  Growth & Trend Analysis', '4  Audience Demographics', '5  Content Performance', '6  AI Insights', '7  Recommendations', '8  Appendix']
  toc.forEach((item, i) => {
    const col = Math.floor(i / 4); const row = i % 4
    doc.text(item, 55 + col * 82, y + 5 + row * 4.5)
  })
  y += 28

  // Executive Summary section
  y = newSection('Executive Summary')

  // ── Task 12.3: Unavailability notices for platforms with missing data ──
  const unavailPlatforms = data.platformDataUnavailable ?? []
  if (unavailPlatforms.length > 0) {
    unavailPlatforms.forEach((up) => {
      if (y > H - 20) { doc.addPage(); addHeader(reportName); y = 18 }
      const notice = `${platformDisplayName(up)} — Data unavailable as of ${fmtDate(data.meta.generatedAt)}`
      doc.setFillColor(...RGB.orange); doc.roundedRect(14, y, W - 28, 8, 1.5, 1.5, 'F')
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
      doc.text(notice, 18, y + 5.5); y += 11
    })
  }

  // ── Task 12.2: Multi-platform AI summary (per-platform paragraphs + cross-platform) ──
  if (data.aiSummary) {
    // Background box for summary
    const summaryLines = doc.splitTextToSize(data.aiSummary, W - 40) as string[]
    const boxH = summaryLines.length * 5 + 10
    doc.setFillColor(249, 250, 251); doc.roundedRect(14, y - 2, W - 28, boxH, 2, 2, 'F')
    doc.setDrawColor(...RGB.lightGray); doc.setLineWidth(0.3)
    doc.roundedRect(14, y - 2, W - 28, boxH, 2, 2, 'S')
    // Left accent stripe on box
    doc.setFillColor(...RGB.charcoal); doc.roundedRect(14, y - 2, 3, boxH, 1, 1, 'F')
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.black)
    doc.text(summaryLines, 20, y + 4); y += boxH + 6
  }

  // ── Task 12.2: Per-platform summary blocks when multi-platform ──────────
  const actPlatforms = activePlatforms(data)
  if (isMultiPlatform(data)) {
    actPlatforms.forEach((platform) => {
      const isUnavail = unavailPlatforms.includes(platform)
      const label = PLATFORM_LABEL[platform] ?? platformDisplayName(platform)

      if (y > H - 24) { doc.addPage(); addHeader(reportName); y = 18 }
      // Platform section chip
      doc.setFillColor(...RGB.darkGray); doc.roundedRect(14, y, W - 28, 7, 1.5, 1.5, 'F')
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
      doc.text(label.toUpperCase(), 18, y + 5); y += 10

      if (isUnavail) {
        doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...RGB.midGray)
        doc.text(`${platformDisplayName(platform)} — Data unavailable as of ${fmtDate(data.meta.generatedAt)}`, 18, y)
        y += 8
      } else {
        const platformKpis = data.platformData?.[platform]
        if (platformKpis) {
          const kvPairs: [string, string][] = []
          if (shouldIncludeMetricSection('reach_total', [platform]) && platformKpis.reach != null) kvPairs.push(['Reach', fmtNum(platformKpis.reach)])
          if (shouldIncludeMetricSection('total_engagements', [platform]) && platformKpis.engagements != null) kvPairs.push(['Engagements', fmtNum(platformKpis.engagements)])
          if (shouldIncludeMetricSection('followers_total', [platform]) && platformKpis.followersTotal != null) kvPairs.push(['Followers', fmtNum(platformKpis.followersTotal)])
          if (shouldIncludeMetricSection('facebook_reactions', [platform]) && platformKpis.engagements != null) kvPairs.push(['Reactions', fmtNum(platformKpis.engagements)])

          kvPairs.forEach(([label2, val], idx) => {
            const mx = 18 + idx * 44
            doc.setFillColor(...RGB.offWhite); doc.roundedRect(mx, y, 40, 14, 1.5, 1.5, 'F')
            doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
            doc.text(label2.toUpperCase(), mx + 20, y + 4.5, { align: 'center' })
            doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.black)
            doc.text(val, mx + 20, y + 11.5, { align: 'center' })
          })
          y += kvPairs.length > 0 ? 18 : 0
        }
      }
    })

    // Cross-platform section (Requirement 9.3)
    if (y > H - 20) { doc.addPage(); addHeader(reportName); y = 18 }
    doc.setFillColor(...RGB.charcoal); doc.roundedRect(14, y, W - 28, 7, 1.5, 1.5, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
    doc.text('CROSS-PLATFORM SUMMARY', 18, y + 5); y += 10

    // Comparison metrics for platforms that both support them
    const comparisonMetricKeys = ['reach_total', 'total_engagements', 'likes', 'comments', 'shares', 'video_views', 'impressions_total']
    const compMetrics = comparisonMetricKeys.filter((k) => isComparisonMetric(k, actPlatforms.filter((p) => !unavailPlatforms.includes(p))))
    if (compMetrics.length > 0) {
      // Header row
      const colW = (W - 28 - 50) / actPlatforms.length
      doc.setFillColor(...RGB.darkGray); doc.rect(14, y, W - 28, 6, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
      doc.text('METRIC', 16, y + 4.3)
      actPlatforms.forEach((p, i) => doc.text(platformDisplayName(p).toUpperCase(), 50 + i * colW + colW / 2, y + 4.3, { align: 'center' }))
      y += 6

      compMetrics.slice(0, 6).forEach((mk, ri) => {
        if (y > H - 12) { doc.addPage(); addHeader(reportName); y = 18 }
        const isAlt = ri % 2 === 0
        if (isAlt) { doc.setFillColor(249, 250, 251); doc.rect(14, y, W - 28, 8, 'F') }
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.black)
        doc.text(mk.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 16, y + 5.5)
        actPlatforms.forEach((p, i) => {
          const pData = data.platformData?.[p] as any
          const val = pData ? (pData[mk] ?? pData[mk.replace('_total', '').replace('_', '')]) : undefined
          const txt = unavailPlatforms.includes(p) ? 'Unavailable' : val != null ? fmtNum(val) : 'n/a'
          doc.setFont('helvetica', unavailPlatforms.includes(p) ? 'italic' : 'bold')
          if (unavailPlatforms.includes(p)) {
            doc.setTextColor(...RGB.midGray)
          } else {
            doc.setTextColor(...RGB.black)
          }
          doc.text(txt, 50 + i * colW + colW / 2, y + 5.5, { align: 'center' })
        })
        y += 8
      })
      y += 4
    }
  }

  // Key AI insights as numbered callout cards
  if (data.aiInsights.length > 0) {
    y = newSection('Key Insights')
    data.aiInsights.slice(0, 5).forEach((insight, i) => {
      if (y > H - 28) { doc.addPage(); addHeader(reportName); y = 18 }
      const lines = doc.splitTextToSize(insight, W - 48) as string[]
      const cardH = Math.max(12, lines.length * 4.5 + 6)
      // Card bg
      doc.setFillColor(i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 251 : 255)
      doc.roundedRect(14, y, W - 28, cardH, 1.5, 1.5, 'F')
      // Number badge
      doc.setFillColor(...RGB.charcoal); doc.circle(22, y + cardH / 2, 3.5, 'F')
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
      doc.text(`${i + 1}`, 22, y + cardH / 2 + 2.5, { align: 'center' })
      // Text
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.black)
      doc.text(lines, 30, y + 5)
      y += cardH + 3
    })
  }

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 3 — KEY PERFORMANCE INDICATORS (editorial table-style, no plain cards)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); addHeader(reportName); y = 18

  y = newSection('Key Performance Indicators', false, 40)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
  // Task 12.2: label platforms in header for multi-platform reports
  const pdfPlatforms = activePlatforms(data)
  const pdfPlatformLabel = isMultiPlatform(data)
    ? `  [${pdfPlatforms.map((p) => platformDisplayName(p)).join(' + ')}]`
    : ''
  doc.text(`${data.meta.periodLabel}  vs  ${data.meta.prevPeriodLabel}${pdfPlatformLabel}`, 14, y); y += 7

  // ── Helper: KPI table row with inline spark bar ──────────────────────
  const kpiRow = (
    label: string, cur: string, prev: string,
    chg: number | null, barPct: number | null,
    rowY: number, isAlt: boolean, barColor?: [number,number,number],
    chgIsAbsolute?: boolean  // when true, show raw number not %
  ) => {
    const rH = 9
    if (isAlt) { doc.setFillColor(249, 250, 251); doc.rect(14, rowY, W - 28, rH, 'F') }
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.black)
    doc.text(label, 16, rowY + 6.2)
    doc.setFont('helvetica', 'bold')
    doc.text(cur, 85, rowY + 6.2, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
    doc.text(prev, 115, rowY + 6.2, { align: 'right' })
    if (chg !== null) {
      const pos = chg > 0; const neg = chg < 0
      const bgC: [number,number,number] = pos ? [220,252,231] : neg ? [254,226,226] : [243,244,246]
      const txtC: [number,number,number] = pos ? [22,163,74] : neg ? [220,38,38] : [107,114,128]
      doc.setFillColor(...bgC); doc.roundedRect(118, rowY + 1.5, 20, 5.5, 1, 1, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...txtC)
      const arrow = chg > 0 ? '+' : chg < 0 ? '-' : '='
      const label2 = chgIsAbsolute
        ? `${arrow}${Math.abs(chg)}`
        : `${arrow}${Math.abs(chg)}%`
      doc.text(label2, 128, rowY + 5.8, { align: 'center' })
    } else {
      doc.setFontSize(6.5); doc.setTextColor(...RGB.midGray); doc.text('n/a', 128, rowY + 5.8, { align: 'center' })
    }
    if (barPct !== null && barPct > 0) {
      const bx = 142; const bwBar = W - 28 - 150; const pctClamped = Math.min(barPct, 1)
      const filled = Math.max(2, pctClamped * bwBar)
      // Track
      doc.setFillColor(235, 237, 240); doc.roundedRect(bx, rowY + 3, bwBar, 3, 1, 1, 'F')
      // Fill
      doc.setFillColor(...(barColor ?? RGB.charcoal)); doc.roundedRect(bx, rowY + 3, filled, 3, 1, 1, 'F')
      // Percentage label at bar end
      doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.midGray)
      doc.text(`${Math.round(pctClamped * 100)}%`, bx + bwBar + 3, rowY + 6)
    }
  }
  // Column headers — with tooltip explaining relative scale
  doc.setFillColor(...RGB.charcoal); doc.rect(14, y, W - 28, 7, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
  doc.text('METRIC', 16, y + 4.8); doc.text('CURRENT', 85, y + 4.8, { align: 'right' })
  doc.text('PREV PERIOD', 115, y + 4.8, { align: 'right' }); doc.text('CHANGE', 128, y + 4.8, { align: 'center' })
  // Relative scale header with description
  doc.text('SCALE (% of group max)', 144, y + 4.8); y += 7

  // GROUP: REACH & VISIBILITY
  doc.setFillColor(31, 41, 55); doc.rect(14, y, W - 28, 6, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(209, 213, 219)
  // Task 12.3: platform logo/label in section header (Requirement 9.4)
  const rvSectionLabel = isMultiPlatform(data)
    ? `  REACH & VISIBILITY  [${pdfPlatforms.map((p) => platformDisplayName(p)).join(' + ')}]`
    : '  REACH & VISIBILITY'
  doc.text(rvSectionLabel, 16, y + 4.2); y += 6
  const maxRV = Math.max(data.kpis.reach, data.kpis.views, data.kpis.profileViews, data.kpis.websiteClicks, 1)
  // Task 12.1: gate each row
  const rvRows: [string, string, string, number | null, number, string][] = [
    ['Total Reach (Unique Accounts)', fmtNum(data.kpis.reach), fmtNum(data.kpis.prevReach), data.kpis.reachChange, data.kpis.reach / maxRV, 'reach_total'],
    ['Views / Impressions', fmtNum(data.kpis.views), fmtNum(data.kpis.prevViews), data.kpis.viewsChange, data.kpis.views / maxRV, 'impressions_total'],
    ['Profile Page Views', fmtNum(data.kpis.profileViews), fmtNum(data.kpis.prevProfileViews), data.kpis.profileViewsChange, data.kpis.profileViews / maxRV, 'profile_visits'],
    ['Website Link Clicks', fmtNum(data.kpis.websiteClicks), fmtNum(data.kpis.prevWebsiteClicks), data.kpis.websiteClicksChange, data.kpis.websiteClicks / maxRV, 'website_clicks'],
  ]
  let rvRowIdx = 0
  rvRows.forEach(([l, cur, prev, ch, b, metricKey]) => {
    if (!shouldIncludeMetricSection(metricKey, pdfPlatforms)) return
    kpiRow(String(l), String(cur), String(prev), ch as number|null, b as number, y, rvRowIdx%2===0, RGB.charcoal)
    y += 9; rvRowIdx++
  }); y += 3

  // GROUP: ENGAGEMENT
  doc.setFillColor(31, 41, 55); doc.rect(14, y, W - 28, 6, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(209, 213, 219)
  // Task 12.3: embed platform label in section header for multi-platform PDF (Requirement 9.4)
  const engSectionLabel = isMultiPlatform(data)
    ? `  ENGAGEMENT  [${pdfPlatforms.map((p) => PLATFORM_LABEL[p] ?? platformDisplayName(p)).join(' · ')}]`
    : '  ENGAGEMENT'
  doc.text(engSectionLabel, 16, y + 4.2); y += 6
  const maxE2 = Math.max(data.kpis.engagements, data.kpis.likes, data.kpis.comments, data.kpis.shares, data.kpis.saves, 1)
  const pER2 = data.kpis.prevEngRate ?? 0
  // Task 12.1: each row is gated by shouldIncludeMetricSection
  const engRows: [string, string, string, number | null, number, string][] = [
    ['Total Engagements', fmtNum(data.kpis.engagements), fmtNum(data.kpis.prevEngagements), data.kpis.engagementsChange, data.kpis.engagements / maxE2, 'total_engagements'],
    ['Engagement Rate (Eng ÷ Reach)', `${data.kpis.engRate}%`, `${pER2}%`, data.kpis.engRateChange, data.kpis.engRate / Math.max(data.kpis.engRate, pER2, 1), 'total_engagements'],
    ['Likes', fmtNum(data.kpis.likes), fmtNum(data.kpis.prevLikes), data.kpis.likesChange, data.kpis.likes / maxE2, 'likes'],
    ['Comments', fmtNum(data.kpis.comments), fmtNum(data.kpis.prevComments), data.kpis.commentsChange, data.kpis.comments / maxE2, 'comments'],
    ['Shares', fmtNum(data.kpis.shares), fmtNum(data.kpis.prevShares), data.kpis.sharesChange, data.kpis.shares / maxE2, 'shares'],
    ['Saves', fmtNum(data.kpis.saves), fmtNum(data.kpis.prevSaves), data.kpis.savesChange, data.kpis.saves / maxE2, 'saves'],
    ['Save Rate (Saves ÷ Reach)', `${data.kpis.saveRate}%`, `${data.kpis.prevSaveRate}%`, data.kpis.saveRateChange, data.kpis.saveRate / Math.max(data.kpis.saveRate, 1), 'saves'],
    ['Share Rate (Shares ÷ Reach)', `${data.kpis.shareRate}%`, `${data.kpis.prevShareRate}%`, data.kpis.shareRateChange, data.kpis.shareRate / Math.max(data.kpis.shareRate, 1), 'shares'],
  ]
  let engRowIdx = 0
  engRows.forEach(([l, c, p, ch, b, metricKey]) => {
    if (!shouldIncludeMetricSection(metricKey, pdfPlatforms)) return
    kpiRow(String(l), String(c), String(p), ch as number|null, b as number, y, engRowIdx%2===0, RGB.darkGray)
    y += 9; engRowIdx++
  }); y += 3

  // GROUP: AUDIENCE GROWTH
  if (y > H - 60) { doc.addPage(); addHeader(reportName); y = 18 }
  doc.setFillColor(31, 41, 55); doc.rect(14, y, W - 28, 6, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(209, 213, 219)
  doc.text('  AUDIENCE GROWTH', 16, y + 4.2); y += 6
  const maxFL2 = Math.max(data.kpis.newFollowers, data.kpis.lostFollowers, data.kpis.prevNewFollowers ?? 0, data.kpis.prevLostFollowers ?? 0, 1)
  const netChg = data.kpis.netFollowers >= 0
  const prevNet = data.kpis.prevNetFollowers ?? 0
  // Net follower change: compute improvement as absolute delta vs prev period net
  // e.g. net went from +10 to -4 = -14 absolute, shown as "▼ 14"
  const netDelta = data.kpis.netFollowers - prevNet
  const netDeltaDisplay = netDelta !== 0 ? netDelta : null
  ;[
    ['Total Followers (Snapshot)', fmtNum(data.kpis.followersTotal), 'Live count', null, null, false],
    ['New Followers Gained', fmtNum(data.kpis.newFollowers), fmtNum(data.kpis.prevNewFollowers ?? 0), data.kpis.newFollowersChange, data.kpis.newFollowers / maxFL2, false],
    ['Followers Lost (Unfollows)', fmtNum(data.kpis.lostFollowers), fmtNum(data.kpis.prevLostFollowers ?? 0), data.kpis.lostFollowersChange ?? null, data.kpis.lostFollowers / maxFL2, false],
    ['Net Follower Change', `${netChg ? '+' : ''}${fmtNum(data.kpis.netFollowers)}`, `${prevNet >= 0 ? '+' : ''}${fmtNum(prevNet)}`, netDeltaDisplay, null, true],
  ].forEach(([l, c, p, ch, b, abs], i) => {
    kpiRow(String(l), String(c), String(p), ch as number|null, b as number|null, y, i%2===0, netChg ? RGB.green : RGB.red, abs as boolean); y += 9
  }); y += 3

  // GROUP: PUBLISHING HEALTH
  if (y > H - 40) { doc.addPage(); addHeader(reportName); y = 18 }
  doc.setFillColor(31, 41, 55); doc.rect(14, y, W - 28, 6, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(209, 213, 219)
  doc.text('  PUBLISHING HEALTH', 16, y + 4.2); y += 6
  const totP2 = Math.max(data.kpis.publishedPosts + data.kpis.failedPosts, 1)
  ;[
    ['Posts Published', String(data.kpis.publishedPosts), 'n/a', null, data.kpis.publishedPosts / totP2],
    ['Posts Failed', String(data.kpis.failedPosts), 'n/a', null, data.kpis.failedPosts / totP2],
    ['Publishing Success Rate', `${data.kpis.publishingSuccessRate}%`, 'n/a', null, data.kpis.publishingSuccessRate / 100],
  ].forEach(([l, c, p, ch, b], i) => {
    const bClr: [number,number,number] = l === 'Posts Failed' ? RGB.red : (data.kpis.publishingSuccessRate >= 90 ? RGB.green : RGB.orange)
    kpiRow(String(l), String(c), String(p), ch as number|null, b as number, y, i%2===0, bClr); y += 9
  }); y += 6
  // Performance score progress bar summary
  const psBg2: [number,number,number] = data.kpis.performanceScore >= 80 ? RGB.green : data.kpis.performanceScore >= 60 ? [37,99,235] : RGB.orange
  doc.setFillColor(249, 250, 251); doc.roundedRect(14, y, W - 28, 16, 2, 2, 'F')
  doc.setDrawColor(...RGB.lightGray); doc.roundedRect(14, y, W - 28, 16, 2, 2, 'S')
  doc.setFillColor(...psBg2); doc.roundedRect(16, y + 9, (data.kpis.performanceScore / 100) * (W - 32), 4, 1, 1, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.black)
  doc.text(`Overall Performance Score: ${data.kpis.performanceScore}/100 - ${data.kpis.scoreLabel}`, 16, y + 6.5); y += 20
  if (data.dailySeries.length > 0) {
    doc.addPage(); addHeader(reportName); y = 18
    y = newSection('Growth & Trend Analysis')

    const xLbls = data.dailySeries.map((d) => d.date)

    // Reach area chart
    const reachImg = drawLineAreaChart([{ label: 'Reach', values: data.dailySeries.map((d) => d.reach), color: B.black }], xLbls, 760, 200, 'Reach Over Time', true)
    doc.addImage(reachImg, 'PNG', 14, y, W - 28, 48); y += 51

    // Engagements bar
    const engImg = drawBarChart(xLbls, data.dailySeries.map((d) => d.engagements), B.darkGray, 760, 180, 'Daily Engagements')
    doc.addImage(engImg, 'PNG', 14, y, W - 28, 43); y += 46

    // Views line
    const viewsImg = drawLineAreaChart([{ label: 'Views', values: data.dailySeries.map((d) => d.views), color: B.midGray }], xLbls, 760, 160, 'Content Views / Impressions', false)
    doc.addImage(viewsImg, 'PNG', 14, y, W - 28, 38); y += 41

    // Follower flow
    const follImg = drawBarChart(xLbls, data.dailySeries.map((d) => d.newFollowers), B.charcoal, 760, 150, 'New Followers per Day')
    doc.addImage(follImg, 'PNG', 14, y, W - 28, 36)
  }

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 4 — AUDIENCE INSIGHTS
  // ════════════════════════════════════════════════════════════════════════
  // AUDIENCE DEMOGRAPHICS (new page, always)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); addHeader(reportName); y = 18
  y = newSection('Audience Demographics & Insights', false, 60)

  if (data.demographics.country.length > 0) {
    // Country donut + bar side by side
    const countryPie = drawDonutChart(data.demographics.country.slice(0, 8).map((c) => c.label), data.demographics.country.slice(0, 8).map((c) => c.value), 220, 220)
    doc.addImage(countryPie, 'PNG', 14, y, 52, 52)

    const countryBar = drawHorizontalBar(data.demographics.country.slice(0, 10).map((c) => c.label), data.demographics.country.slice(0, 10).map((c) => c.value), B.charcoal, 400, 180)
    doc.addImage(countryBar, 'PNG', 70, y, 62, 52)

    // Country table
    autoTable(doc, {
      startY: y, margin: { left: 136, right: 14 }, tableWidth: W - 150,
      head: [['Country', 'Followers', 'Share %']],
      body: data.demographics.country.slice(0, 10).map((c) => {
        const total = data.demographics.country.reduce((s, x) => s + x.value, 0) || 1
        return [c.label, fmtNum(c.value), `${Math.round((c.value / total) * 100)}%`]
      }),
      headStyles: { fillColor: RGB.charcoal, textColor: RGB.white, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 }, alternateRowStyles: { fillColor: RGB.offWhite },
      theme: 'grid',
    })
    y = Math.max(y + 55, (doc as any).lastAutoTable.finalY) + 8

    // Gender-age bar
    if (data.demographics.genderAge.length > 0) {
      y = newSection('Gender & Age Breakdown', false, 55)
      const gaBar = drawHorizontalBar(data.demographics.genderAge.slice(0, 12).map((g) => g.label), data.demographics.genderAge.slice(0, 12).map((g) => g.value), B.black, 400, 200)
      doc.addImage(gaBar, 'PNG', 14, y, W / 2 - 20, 48)
      autoTable(doc, {
        startY: y, margin: { left: W / 2 - 4, right: 14 }, tableWidth: W / 2 - 10,
        head: [['Segment', 'Followers']], body: data.demographics.genderAge.slice(0, 12).map((g) => [g.label, fmtNum(g.value)]),
        headStyles: { fillColor: RGB.charcoal, textColor: RGB.white, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 }, alternateRowStyles: { fillColor: RGB.offWhite }, theme: 'grid',
      })
      y = Math.max(y + 50, (doc as any).lastAutoTable.finalY) + 8
    }

    // Weekly heatmap — fits on same page if space, otherwise new page
    const atKeys = Object.keys(data.demographics.weeklyActiveTime)
    if (atKeys.length > 0) {
      y = newSection('Best Time to Post — Weekly Heatmap', false, 55)
      const hmImg = drawHeatmapGrid(data.demographics.weeklyActiveTime, 760, 160)
      doc.addImage(hmImg, 'PNG', 14, y, W - 28, 38); y += 42
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...RGB.midGray)
      doc.text('Darker cells indicate higher average follower activity. Schedule posts during peak hours for maximum initial reach.', 14, y)
      y += 8
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // CONTENT PERFORMANCE (new page)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); addHeader(reportName); y = 18
  y = newSection('Content Performance Analysis', false, 60)

  // Content Strategy narrative in a styled box
  if (data.contentStrategy) {
    const csLines = doc.splitTextToSize(data.contentStrategy, W - 38) as string[]
    const csBoxH = csLines.length * 4.8 + 10
    doc.setFillColor(249, 250, 251); doc.roundedRect(14, y, W - 28, csBoxH, 2, 2, 'F')
    doc.setDrawColor(...RGB.lightGray); doc.setLineWidth(0.3); doc.roundedRect(14, y, W - 28, csBoxH, 2, 2, 'S')
    doc.setFillColor(...RGB.charcoal); doc.roundedRect(14, y, 3, csBoxH, 1, 1, 'F')
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.black)
    doc.text(csLines, 20, y + 6); y += csBoxH + 8
  }

  // Top posts table
  if (data.topPosts.length > 0) {
    y = newSection('Top Performing Posts', false, 60)
    autoTable(doc, {
      startY: y, margin: { left: 14, right: 14 },
      head: [['#', 'Post', 'Type', 'Published', 'Reach', 'Views', 'Likes', 'Comments', 'Shares', 'Saves', 'Eng%']],
      body: data.topPosts.slice(0, 15).map((p) => [p.rank, p.title.slice(0, 38), p.mediaType, fmtDate(p.publishedAt), fmtNum(p.metrics.reach), fmtNum(p.metrics.views), fmtNum(p.metrics.likes), fmtNum(p.metrics.comments), fmtNum(p.metrics.shares), fmtNum(p.metrics.saves), `${p.metrics.engRate}%`]),
      headStyles: { fillColor: RGB.charcoal, textColor: RGB.white, fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5 }, alternateRowStyles: { fillColor: RGB.offWhite },
      columnStyles: { 0: { cellWidth: 7, halign: 'center' }, 1: { cellWidth: 52 }, 2: { cellWidth: 18 }, 3: { cellWidth: 22 } },
      theme: 'striped',
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Worst posts — only if there's space, otherwise new page
  if (data.worstPosts.length > 0) {
    y = newSection('Posts Needing Attention (Lowest Engagement Rate)', false, 50)
    autoTable(doc, {
      startY: y, margin: { left: 14, right: 14 },
      head: [['#', 'Post', 'Type', 'Published', 'Reach', 'Engagements', 'Eng%', 'Note']],
      body: data.worstPosts.map((p) => [p.rank, p.title.slice(0, 38), p.mediaType, fmtDate(p.publishedAt), fmtNum(p.metrics.reach), fmtNum(p.metrics.engagements), `${p.metrics.engRate}%`, 'Review format & timing']),
      headStyles: { fillColor: RGB.darkGray, textColor: RGB.white, fontSize: 7.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5 }, alternateRowStyles: { fillColor: [254, 242, 242] as any },
      theme: 'striped',
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ════════════════════════════════════════════════════════════════════════
  // AI INSIGHTS + RECOMMENDATIONS (new page)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); addHeader(reportName); y = 18
  y = newSection('AI-Generated Insights & Analysis', false, 40)

  data.aiInsights.forEach((insight, idx) => {
    if (y > H - 30) { doc.addPage(); addHeader(reportName); y = 18 }
    const lines = doc.splitTextToSize(insight, W - 48) as string[]
    const cardH = Math.max(12, lines.length * 4.5 + 6)
    doc.setFillColor(idx % 2 === 0 ? 249 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 251 : 255)
    doc.roundedRect(14, y, W - 28, cardH, 1.5, 1.5, 'F')
    doc.setFillColor(...RGB.charcoal); doc.circle(22, y + cardH / 2, 3.5, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
    doc.text(`${idx + 1}`, 22, y + cardH / 2 + 2.5, { align: 'center' })
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...RGB.black)
    doc.text(lines, 30, y + 5); y += cardH + 3
  })

  y = newSection('Strategic Recommendations', false, 80)

  data.recommendations.forEach((rec, i) => {
    if (y > H - 35) { doc.addPage(); addHeader(reportName); y = 18 }
    // Priority badge
    const badgeBg = rec.priority === 'HIGH' ? RGB.black : rec.priority === 'MEDIUM' ? RGB.darkGray : RGB.midGray
    doc.setFillColor(...badgeBg); doc.roundedRect(14, y, 16, 6, 1, 1, 'F')
    doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.white)
    doc.text(rec.priority, 22, y + 4.3, { align: 'center' })
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RGB.black)
    doc.text(`${i + 1}. ${rec.title}`, 33, y + 4.3)
    y += 8
    const exLines = doc.splitTextToSize(rec.explanation, W - 36) as string[]
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
    doc.text(exLines, 17, y); y += exLines.length * 5
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...RGB.midGray)
    doc.text(`Expected Impact: ${rec.expectedImpact}  ·  Difficulty: ${rec.difficulty}  ·  Confidence: ${rec.confidence.toUpperCase()}`, 17, y + 1)
    y += 7
  })

  // Opportunities — continue on same page if space, otherwise new page
  if (data.opportunities.length > 0) {
    y = newSection('Growth Opportunities', false, 60)
    autoTable(doc, {
      startY: y, margin: { left: 14, right: 14 },
      head: [['Opportunity', 'Description', 'Priority', 'Impact', 'Difficulty']],
      body: data.opportunities.map((o) => [o.area, o.description.slice(0, 90), o.priority, o.impact, o.difficulty]),
      headStyles: { fillColor: RGB.charcoal, textColor: RGB.white, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 }, alternateRowStyles: { fillColor: RGB.offWhite },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 85 }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 28 }, 4: { cellWidth: 20, halign: 'center' } },
      theme: 'grid',
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ════════════════════════════════════════════════════════════════════════
  // APPENDIX — Raw metrics + definitions
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); addHeader(reportName); y = 18
  y = newSection('Appendix — Raw Metrics & Definitions')
  const defs = [
    ['Reach', 'Unique accounts that saw content at least once during the period'],
    ['Views/Impressions', 'Total number of times content was displayed (includes repeat views)'],
    ['Engagement Rate', '(Likes + Comments + Shares + Saves) ÷ Reach × 100'],
    ['Save Rate', 'Saves ÷ Reach × 100 — indicates bookmark-worthy content'],
    ['Share Rate', 'Shares ÷ Reach × 100 — indicates content worthy of amplification'],
    ['Net Followers', 'New Followers − Lost Followers over the selected period'],
    ['Performance Score', 'Composite 0–100 score based on engagement rate, growth, reach, and activity'],
    ['Data Source', `Meta Graph API ${data.meta.apiVersion} — verified platform data`],
    ['Connected Account', `${data.accountInfo?.username ?? '—'} (${data.accountInfo?.accountType ?? 'Business'})`],
    ['Report Generated', fmtDate(data.meta.generatedAt)],
    ['Exported By', data.meta.exportedBy],
  ]
  autoTable(doc, {
    startY: y, margin: { left: 14, right: 14 },
    head: [['Term', 'Definition']],
    body: defs,
    headStyles: { fillColor: RGB.charcoal, textColor: RGB.white, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 }, alternateRowStyles: { fillColor: RGB.offWhite },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } }, theme: 'grid',
  })

  addPageFooter()
  doc.save(`${reportName}.pdf`)
}

// ── 2. PowerPoint — Presentation (NOT a PDF clone) ────────────────────────
// Each slide = one insight, large visuals, AI speaker notes

export async function exportPPTX(opts: ExportOptions): Promise<void> {
  const mod = await import('pptxgenjs')
  const PptxGenJS = mod.default ?? (mod as any)
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"
  const { data, reportName } = opts

  // Brand tokens for PPTX
  const BK = '111827'; const CG = '1f2937'; const DG = '374151'; const MG = '6b7280'
  const LG = 'd1d5db'; const OW = 'f3f4f6'; const WH = 'ffffff'
  const GN = '16a34a'; const GNL = 'dcfce7'; const RD = 'dc2626'; const OG = 'd97706'

  const hdr = (slide: any, title: string, sub?: string) => {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.65, fill: { color: BK } })
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.06, h: '100%', fill: { color: DG } })
    slide.addText(title, { x: 0.2, y: 0.08, w: 11, fontSize: 17, bold: true, color: WH, fontFace: 'Arial' })
    if (sub) slide.addText(sub, { x: 0.2, y: 0.4, fontSize: 8.5, color: LG, fontFace: 'Arial' })
    slide.addText(`${data.meta.workspaceName}  ·  ${data.meta.periodLabel}`, { x: 12.5, y: 0.08, w: 0.8, fontSize: 7, color: MG, align: 'right' })
  }

  const ftr = (slide: any) => {
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.3, w: '100%', h: 0.2, fill: { color: OW } })
    slide.addText(`Veefore Analytics  ·  Confidential  ·  ${fmtDate(data.meta.generatedAt)}`, { x: 0.3, y: 7.33, fontSize: 7, color: MG })
  }

  const kpiBox = (slide: any, x: number, y: number, w: number, h: number, label: string, val: string, chg?: string | null, pos?: boolean | null) => {
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: OW }, line: { color: LG, width: 0.5 } })
    slide.addText(label.toUpperCase(), { x, y: y + 0.06, w, align: 'center', fontSize: 6.5, color: MG, fontFace: 'Arial' })
    slide.addText(val, { x, y: y + 0.32, w, align: 'center', fontSize: 19, bold: true, color: BK, fontFace: 'Arial' })
    if (chg && chg !== '—') {
      const c = pos === true ? GN : pos === false ? RD : MG
      slide.addText(chg, { x, y: y + 0.82, w, align: 'center', fontSize: 9, bold: true, color: c })
    }
  }

  // ── Slide 1: Cover ───────────────────────────────────────────────────────
  const s1 = pptx.addSlide()
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: BK } })
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.1, h: '100%', fill: { color: DG } })
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 5.8, w: '100%', h: 1.7, fill: { color: CG } })
  s1.addText('VEEFORE', { x: 0.25, y: 0.25, fontSize: 11, bold: true, color: LG, letterSpacing: 5, fontFace: 'Arial' })
  s1.addText('ANALYTICS', { x: 0.25, y: 0.58, fontSize: 8, color: MG, letterSpacing: 3 })
  s1.addText(reportName, { x: 0.25, y: 1.3, w: 12.8, fontSize: 32, bold: true, color: WH, fontFace: 'Arial' })
  s1.addText(`${data.accountInfo?.username ?? ''}  ·  ${data.accountInfo?.platform ?? 'Instagram'}  ·  ${data.accountInfo?.accountType ?? 'Business'}`, { x: 0.25, y: 2.8, fontSize: 14, color: LG })
  s1.addText(`Report Period:  ${data.meta.periodLabel}`, { x: 0.25, y: 3.4, fontSize: 11, color: MG })
  s1.addText(`Comparison:  ${data.meta.prevPeriodLabel}`, { x: 0.25, y: 3.8, fontSize: 11, color: MG })
  // Score badge
  const sg = data.kpis.performanceScore >= 80 ? GN : data.kpis.performanceScore >= 60 ? DG : OG
  s1.addShape(pptx.ShapeType.roundRect, { x: 0.25, y: 4.55, w: 2.8, h: 1.1, fill: { color: sg } })
  s1.addText(String(data.kpis.performanceScore), { x: 0.25, y: 4.65, w: 2.8, align: 'center', fontSize: 28, bold: true, color: WH })
  s1.addText(`Performance Score  ·  ${data.kpis.scoreLabel}`, { x: 0.25, y: 5.25, w: 2.8, align: 'center', fontSize: 8, color: WH })
  s1.addText(`Exported by: ${data.meta.exportedBy}  ·  Generated: ${fmtDate(data.meta.generatedAt)}`, { x: 0.25, y: 6.0, fontSize: 8.5, color: MG })
  s1.addText(`Prepared by Veefore Analytics  ·  Confidential`, { x: 0.25, y: 7.15, fontSize: 8, color: MG })
  s1.addNotes(`Cover slide for ${reportName}. This report was prepared by Veefore Analytics and is intended for internal use. The data covers ${data.meta.periodLabel}.`)

  // ── Slide 2: Executive Summary ───────────────────────────────────────────
  const s2 = pptx.addSlide()
  hdr(s2, 'Executive Summary', 'AI-Generated Analysis')
  let sy = 0.8

  // Task 12.3: unavailability notices
  const pptxUnavail = data.platformDataUnavailable ?? []
  pptxUnavail.forEach((up) => {
    s2.addShape(pptx.ShapeType.roundRect, { x: 0.2, y: sy, w: 13, h: 0.4, fill: { color: OG }, line: { color: OG, width: 0 } })
    s2.addText(`${platformDisplayName(up)} — Data unavailable as of ${fmtDate(data.meta.generatedAt)}`, { x: 0.35, y: sy + 0.08, w: 12.6, fontSize: 9, bold: true, color: WH })
    sy += 0.55
  })

  if (data.aiSummary) {
    s2.addShape(pptx.ShapeType.rect, { x: 0.2, y: sy, w: 13, h: 1.3, fill: { color: OW }, line: { color: LG, width: 0.4 } })
    s2.addText(data.aiSummary.slice(0, 350), { x: 0.35, y: sy + 0.1, w: 12.6, fontSize: 9.5, color: BK, wrap: true })
    sy += 1.45
  }

  // Task 12.2: per-platform blocks
  const pptxPlatforms = activePlatforms(data)
  if (isMultiPlatform(data)) {
    pptxPlatforms.forEach((platform) => {
      const label = PLATFORM_LABEL[platform] ?? platformDisplayName(platform)
      s2.addShape(pptx.ShapeType.roundRect, { x: 0.2, y: sy, w: 13, h: 0.28, fill: { color: DG }, line: { color: DG, width: 0 } })
      s2.addText(label.toUpperCase(), { x: 0.35, y: sy + 0.05, fontSize: 9, bold: true, color: WH })
      sy += 0.35
      const isUnavail = pptxUnavail.includes(platform)
      if (isUnavail) {
        s2.addText(`Data unavailable as of ${fmtDate(data.meta.generatedAt)}`, { x: 0.35, y: sy, w: 12.6, fontSize: 9, italic: true, color: MG })
        sy += 0.38
      } else {
        const kvPlatform = data.platformData?.[platform] as any
        if (kvPlatform) {
          const kvPairs: [string, string][] = []
          if (shouldIncludeMetricSection('reach_total', [platform]) && kvPlatform.reach != null) kvPairs.push(['Reach', fmtNum(kvPlatform.reach)])
          if (shouldIncludeMetricSection('total_engagements', [platform]) && kvPlatform.engagements != null) kvPairs.push(['Engagements', fmtNum(kvPlatform.engagements)])
          if (shouldIncludeMetricSection('followers_total', [platform]) && kvPlatform.followersTotal != null) kvPairs.push(['Followers', fmtNum(kvPlatform.followersTotal)])
          kvPairs.forEach(([kl, kv], idx) => {
            const kx = 0.3 + idx * 3.0
            s2.addShape(pptx.ShapeType.roundRect, { x: kx, y: sy, w: 2.7, h: 0.9, fill: { color: OW }, line: { color: LG, width: 0.4 } })
            s2.addText(kl.toUpperCase(), { x: kx, y: sy + 0.08, w: 2.7, align: 'center', fontSize: 7, color: MG })
            s2.addText(kv, { x: kx, y: sy + 0.3, w: 2.7, align: 'center', fontSize: 16, bold: true, color: BK })
          })
          sy += kvPairs.length > 0 ? 1.0 : 0
        }
      }
    })
    // Cross-platform section header
    s2.addShape(pptx.ShapeType.roundRect, { x: 0.2, y: sy, w: 13, h: 0.28, fill: { color: BK }, line: { color: BK, width: 0 } })
    s2.addText('CROSS-PLATFORM COMPARISON', { x: 0.35, y: sy + 0.05, fontSize: 9, bold: true, color: WH })
    sy += 0.35
  }

  // Key highlights
  const highlights = [
    { icon: data.kpis.reachChange && data.kpis.reachChange > 0 ? '↑' : '↓', text: `Reach ${fmtChange(data.kpis.reachChange)} vs previous period`, color: statusColor(data.kpis.reachChange) },
    { icon: data.kpis.engagementsChange && data.kpis.engagementsChange > 0 ? '↑' : '↓', text: `Engagements ${fmtChange(data.kpis.engagementsChange)} vs previous period`, color: statusColor(data.kpis.engagementsChange) },
    { icon: data.kpis.netFollowers > 0 ? '↑' : '↓', text: `Net ${fmtNum(Math.abs(data.kpis.netFollowers))} followers ${data.kpis.netFollowers >= 0 ? 'gained' : 'lost'}`, color: data.kpis.netFollowers >= 0 ? B.green : B.red },
    { icon: '📊', text: `${data.kpis.publishedPosts} posts published · ${data.kpis.publishingSuccessRate}% success rate`, color: BK },
    { icon: '💡', text: `Engagement rate: ${data.kpis.engRate}%  ·  Save rate: ${data.kpis.saveRate}%`, color: BK },
  ]
  highlights.forEach(({ icon, text, color }, i) => {
    if (sy + 0.7 > 7.2) return // don't overflow slide
    s2.addText(`${icon}  ${text}`, { x: 0.3, y: sy + i * 0.7, fontSize: 10.5, color, fontFace: 'Arial', bold: i === 0 || i === 1 })
  })
  ftr(s2)
  s2.addNotes(`Executive summary: ${data.aiSummary}\n\nKey metrics for this period:\n- Reach: ${fmtNum(data.kpis.reach)} (${fmtChange(data.kpis.reachChange)})\n- Engagements: ${fmtNum(data.kpis.engagements)} (${fmtChange(data.kpis.engagementsChange)})\n- Engagement Rate: ${data.kpis.engRate}%`)

  // ── Slide 3: KPI Dashboard ───────────────────────────────────────────────
  const s3 = pptx.addSlide()
  // Task 12.3: embed platform labels in PPTX slide subtitle (Requirement 9.4)
  const pptxKpiSubtitle = isMultiPlatform(data)
    ? `${data.meta.periodLabel} — ${pptxPlatforms.map((p) => PLATFORM_LABEL[p] ?? platformDisplayName(p)).join(' · ')}`
    : `Performance Overview — ${data.meta.periodLabel}`
  hdr(s3, 'KPI Dashboard', pptxKpiSubtitle)
  // Task 12.1: gate platform-specific KPI boxes
  const allKpis16: [string, string, string | null, boolean | null, string][] = [
    ['Reach', fmtNum(data.kpis.reach), fmtChange(data.kpis.reachChange), (data.kpis.reachChange ?? 0) > 0, 'reach_total'],
    ['Views', fmtNum(data.kpis.views), fmtChange(data.kpis.viewsChange), (data.kpis.viewsChange ?? 0) > 0, 'impressions_total'],
    ['Engagements', fmtNum(data.kpis.engagements), fmtChange(data.kpis.engagementsChange), (data.kpis.engagementsChange ?? 0) > 0, 'total_engagements'],
    ['Eng. Rate', `${data.kpis.engRate}%`, null, null, 'total_engagements'],
    ['Likes', fmtNum(data.kpis.likes), null, null, 'likes'],
    ['Comments', fmtNum(data.kpis.comments), null, null, 'comments'],
    ['Shares', fmtNum(data.kpis.shares), null, null, 'shares'],
    ['Saves', fmtNum(data.kpis.saves), null, null, 'saves'],
    ['Save Rate', `${data.kpis.saveRate}%`, null, null, 'saves'],
    ['Share Rate', `${data.kpis.shareRate}%`, null, null, 'shares'],
    ['Profile Views', fmtNum(data.kpis.profileViews), null, null, 'profile_visits'],
    ['Website Clicks', fmtNum(data.kpis.websiteClicks), null, null, 'website_clicks'],
    ['New Followers', fmtNum(data.kpis.newFollowers), fmtChange(data.kpis.newFollowersChange), (data.kpis.newFollowersChange ?? 0) > 0, 'followers_total'],
    ['Lost Followers', fmtNum(data.kpis.lostFollowers), null, false, 'followers_total'],
    ['Net Followers', fmtNum(data.kpis.netFollowers), null, data.kpis.netFollowers > 0, 'followers_total'],
    ['Success Rate', `${data.kpis.publishingSuccessRate}%`, null, data.kpis.publishingSuccessRate >= 90, 'published_posts'],
  ]
  const filteredKpis16 = allKpis16.filter(([, , , , metricKey]) => shouldIncludeMetricSection(metricKey, pptxPlatforms))
  filteredKpis16.forEach(([l, v, c, p], i) => {
    const col = i % 4; const row = Math.floor(i / 4)
    kpiBox(s3, 0.18 + col * 3.28, 0.8 + row * 1.62, 3.1, 1.48, String(l), String(v), c as string | null, p as boolean | null)
  })
  ftr(s3)
  s3.addNotes(`KPI slide. Key metrics:\nReach: ${fmtNum(data.kpis.reach)}\nEngagement Rate: ${data.kpis.engRate}%\nNew Followers: ${fmtNum(data.kpis.newFollowers)}\nPublished Posts: ${data.kpis.publishedPosts}`)

  // ── Slide 4: Growth Trends (area chart) ──────────────────────────────────
  if (data.dailySeries.length > 0) {
    const s4 = pptx.addSlide()
    hdr(s4, 'Growth Trends', 'Daily reach and engagement over the reporting period')
    const labels = data.dailySeries.map((d) => d.date)
    s4.addChart(pptx.ChartType.area, [
      { name: 'Reach', labels, values: data.dailySeries.map((d) => d.reach) },
    ], { x: 0.2, y: 0.75, w: 13, h: 3.6, chartColors: [BK], showLegend: true, legendPos: 'b', valAxisLabelFontSize: 8, catAxisLabelFontSize: 7, dataLabelFontSize: 0, title: 'Daily Reach', showTitle: true, titleFontSize: 11 })
    s4.addChart(pptx.ChartType.bar, [
      { name: 'Engagements', labels, values: data.dailySeries.map((d) => d.engagements) },
    ], { x: 0.2, y: 4.45, w: 13, h: 2.8, chartColors: [DG], showLegend: false, barDir: 'col', valAxisLabelFontSize: 7, catAxisLabelFontSize: 6 })
    ftr(s4)
    s4.addNotes(`Growth trends slide. The top chart shows daily reach over the ${data.meta.spanDays}-day period. The bottom chart shows daily engagement activity. ${data.aiInsights[0] ?? ''}`)

    // Slide 5: Follower Flow
    const s5 = pptx.addSlide()
    hdr(s5, 'Follower Growth', 'New followers gained vs lost per day')
    s5.addChart(pptx.ChartType.bar, [
      { name: 'New Followers', labels, values: data.dailySeries.map((d) => d.newFollowers) },
      { name: 'Lost Followers', labels, values: data.dailySeries.map((d) => d.lostFollowers) },
    ], { x: 0.2, y: 0.75, w: 13, h: 4.5, chartColors: [BK, LG], barDir: 'col', barGrouping: 'clustered', showLegend: true, legendPos: 'b', valAxisLabelFontSize: 8, catAxisLabelFontSize: 7 })
    // Net followers summary
    s5.addShape(pptx.ShapeType.roundRect, { x: 0.2, y: 5.4, w: 4, h: 1.8, fill: { color: data.kpis.netFollowers >= 0 ? GNL : 'fee2e2' }, line: { color: data.kpis.netFollowers >= 0 ? GN : RD, width: 1 } })
    s5.addText(fmtNum(data.kpis.netFollowers), { x: 0.2, y: 5.55, w: 4, align: 'center', fontSize: 28, bold: true, color: data.kpis.netFollowers >= 0 ? GN : RD })
    s5.addText('Net Followers (Period)', { x: 0.2, y: 6.15, w: 4, align: 'center', fontSize: 9, color: MG })
    ftr(s5)
    s5.addNotes(`Follower growth analysis: ${data.kpis.newFollowers.toLocaleString()} new followers, ${data.kpis.lostFollowers.toLocaleString()} unfollows, net: ${data.kpis.netFollowers.toLocaleString()}. ${data.aiInsights[4] ?? ''}`)
  }

  // ── Slide 6: Audience Insights ────────────────────────────────────────────
  const s6 = pptx.addSlide()
  hdr(s6, 'Audience Demographics', 'Country, city and demographic breakdown')
  if (data.demographics.country.length > 0) {
    const top8 = data.demographics.country.slice(0, 8)
    s6.addChart(pptx.ChartType.pie, [{ name: 'Followers', labels: top8.map((c) => c.label), values: top8.map((c) => c.value) }], {
      x: 0.2, y: 0.75, w: 6.5, h: 5.8,
      chartColors: [BK, CG, DG, MG, '9ca3af', LG, OW, '4b5563'],
      showLegend: true, legendPos: 'r', legendFontSize: 9,
      showPercent: true, title: 'Audience by Country', showTitle: true, titleFontSize: 11,
    })
  }
  if (data.demographics.genderAge.length > 0) {
    const gTop = data.demographics.genderAge.slice(0, 10)
    s6.addChart(pptx.ChartType.bar, [{ name: 'Followers', labels: gTop.map((g) => g.label), values: gTop.map((g) => g.value) }], {
      x: 6.9, y: 0.75, w: 6.5, h: 5.8, barDir: 'bar',
      chartColors: [DG], showLegend: false,
      title: 'Gender & Age', showTitle: true, titleFontSize: 11, catAxisLabelFontSize: 8,
    })
  }
  ftr(s6)
  s6.addNotes(`Audience demographics: Top country is ${data.demographics.country[0]?.label ?? 'unknown'} with ${fmtNum(data.demographics.country[0]?.value)} followers. Top gender-age segment is ${data.demographics.genderAge[0]?.label ?? 'unknown'}.`)

  // ── Slide 7: Best Time to Post ────────────────────────────────────────────
  const atKeys = Object.keys(data.demographics.activeTime).map(Number).sort((a, b) => a - b)
  if (atKeys.length > 0) {
    const s7 = pptx.addSlide()
    hdr(s7, 'Best Time to Post', 'Average followers online per hour (local time)')
    s7.addChart(pptx.ChartType.bar, [{
      name: 'Avg. Followers Online',
      labels: atKeys.map((h) => fmtHour(h)),
      values: atKeys.map((h) => data.demographics.activeTime[String(h)]),
    }], { x: 0.2, y: 0.75, w: 13, h: 5.8, barDir: 'col', chartColors: [BK], showLegend: false, valAxisLabelFontSize: 8, catAxisLabelFontSize: 8 })
    ftr(s7)
    const peakHour = atKeys.reduce((best, h) => (data.demographics.activeTime[String(h)] > data.demographics.activeTime[String(best)]) ? h : best, atKeys[0])
    s7.addNotes(`Best time to post: The peak hour for audience activity is ${fmtHour(peakHour)} with an average of ${fmtNum(data.demographics.activeTime[String(peakHour)])} followers online. Schedule your most important content during the 2-hour window around this peak.`)
  }

  // ── Slide 8: Content Performance ─────────────────────────────────────────
  const s8 = pptx.addSlide()
  hdr(s8, 'Top Performing Content', 'Ranked by engagement')
  if (data.topPosts.length > 0) {
    const tRows = [
      [{ text: '#', options: { bold: true, fill: BK, color: WH, align: 'center' } }, { text: 'Post Title', options: { bold: true, fill: BK, color: WH } }, { text: 'Type', options: { bold: true, fill: BK, color: WH, align: 'center' } }, { text: 'Reach', options: { bold: true, fill: BK, color: WH, align: 'center' } }, { text: 'Likes', options: { bold: true, fill: BK, color: WH, align: 'center' } }, { text: 'Comments', options: { bold: true, fill: BK, color: WH, align: 'center' } }, { text: 'Shares', options: { bold: true, fill: BK, color: WH, align: 'center' } }, { text: 'Eng%', options: { bold: true, fill: BK, color: WH, align: 'center' } }],
      ...data.topPosts.slice(0, 18).map((p, i) => {
        const bg = i % 2 ? OW : WH
        return [{ text: String(p.rank), options: { align: 'center', fill: bg } }, { text: p.title.slice(0, 45), options: { fill: bg } }, { text: p.mediaType, options: { align: 'center', fill: bg } }, { text: fmtNum(p.metrics.reach), options: { align: 'center', fill: bg } }, { text: fmtNum(p.metrics.likes), options: { align: 'center', fill: bg } }, { text: fmtNum(p.metrics.comments), options: { align: 'center', fill: bg } }, { text: fmtNum(p.metrics.shares), options: { align: 'center', fill: bg } }, { text: `${p.metrics.engRate}%`, options: { align: 'center', fill: bg } }]
      }),
    ]
    s8.addTable(tRows as any, { x: 0.2, y: 0.78, w: 13, colW: [0.5, 6, 1.2, 1.2, 1.0, 1.1, 1.0, 1.0], border: { pt: 0.3, color: LG }, fontSize: 8, fontFace: 'Arial' })
  }
  ftr(s8)
  s8.addNotes(`Top performing posts slide. Content strategy analysis: ${data.contentStrategy?.slice(0, 300) ?? 'See report for details.'}`)

  // ── Slide 9: AI Insights ──────────────────────────────────────────────────
  const s9 = pptx.addSlide()
  hdr(s9, 'AI-Generated Insights', 'Intelligence derived from your actual analytics data')
  let isy = 0.8
  data.aiInsights.slice(0, 5).forEach((insight, i) => {
    s9.addShape(pptx.ShapeType.rect, { x: 0.2, y: isy, w: 13, h: 0.3, fill: { color: i % 2 ? BK : DG } })
    s9.addText(String(i + 1), { x: 0.2, y: isy, w: 0.35, h: 0.3, align: 'center', valign: 'middle', fontSize: 9, bold: true, color: WH })
    const shortened = insight.slice(0, 200)
    s9.addShape(pptx.ShapeType.rect, { x: 0.55, y: isy, w: 12.65, h: 0.3, fill: { color: i % 2 ? '1f2937' : OW } })
    s9.addText(shortened, { x: 0.6, y: isy + 0.05, w: 12.55, fontSize: 9, color: i % 2 ? WH : BK, wrap: false })
    isy += 0.75
  })
  ftr(s9)
  s9.addNotes(`AI Insights:\n${data.aiInsights.join('\n\n')}`)

  // ── Slide 10: Recommendations ─────────────────────────────────────────────
  const s10 = pptx.addSlide()
  hdr(s10, 'Strategic Recommendations', 'Prioritised action plan based on analytics data')
  let rsy = 0.8
  data.recommendations.slice(0, 5).forEach((rec, i) => {
    const bg = rec.priority === 'HIGH' ? '111827' : rec.priority === 'MEDIUM' ? '374151' : '6b7280'
    s10.addShape(pptx.ShapeType.roundRect, { x: 0.2, y: rsy, w: 1.1, h: 0.25, fill: { color: bg } })
    s10.addText(rec.priority, { x: 0.2, y: rsy + 0.04, w: 1.1, align: 'center', fontSize: 7.5, bold: true, color: WH })
    s10.addText(`${i + 1}. ${rec.title}`, { x: 1.4, y: rsy + 0.04, fontSize: 10, bold: true, color: BK })
    rsy += 0.4
    const exLines = rec.explanation.slice(0, 180)
    s10.addText(exLines, { x: 1.4, y: rsy, w: 11.8, fontSize: 8.5, color: DG, wrap: true })
    rsy += 0.45
    s10.addText(`Impact: ${rec.expectedImpact}  ·  Difficulty: ${rec.difficulty}  ·  Confidence: ${rec.confidence.toUpperCase()}`, { x: 1.4, y: rsy, fontSize: 7.5, color: MG, italic: true })
    rsy += 0.6
  })
  ftr(s10)
  s10.addNotes(`Recommendations:\n${data.recommendations.map((r, i) => `${i + 1}. ${r.title}: ${r.explanation}`).join('\n\n')}`)

  // ── Slide 11: Closing ──────────────────────────────────────────────────────
  const s11 = pptx.addSlide()
  s11.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: BK } })
  s11.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.1, h: '100%', fill: { color: DG } })
  s11.addText('Thank You', { x: 0.3, y: 2.0, fontSize: 36, bold: true, color: WH, fontFace: 'Arial' })
  s11.addText(`${data.meta.workspaceName}  ·  ${data.meta.periodLabel}`, { x: 0.3, y: 3.1, fontSize: 14, color: LG })
  s11.addText('Prepared by Veefore Analytics', { x: 0.3, y: 3.65, fontSize: 11, color: MG })
  s11.addText(fmtDate(data.meta.generatedAt), { x: 0.3, y: 4.0, fontSize: 10, color: MG })
  s11.addText('veefore.com', { x: 0.3, y: 6.9, fontSize: 9, color: MG })
  s11.addNotes('Closing slide. This presentation was auto-generated by Veefore Analytics from verified Meta platform data.')

  pptx.writeFile({ fileName: `${reportName}.pptx` })
}

// ── 3. Excel Export — Multi-sheet Professional Workbook ───────────────────

export async function exportExcel(opts: ExportOptions): Promise<void> {
  const XLSXmod = await import('xlsx-js-style').catch(() => import('xlsx'))
  const XLSX = (XLSXmod as any).default ?? XLSXmod
  const { data, reportName } = opts
  const wb = XLSX.utils.book_new()

  // ── Style tokens ──────────────────────────────────────────────────────
  const S = {
    // Headers: near-black bg, white bold text
    hdr: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: { fgColor: { rgb: '111827' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { bottom: { style: 'thin', color: { rgb: '374151' } } } },
    // Sub-headers: dark gray bg
    subHdr: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '374151' }, patternType: 'solid' }, alignment: { vertical: 'center' } },
    // Metric label: light gray bg, dark text, left-aligned
    label: { font: { bold: true, color: { rgb: '111827' }, sz: 9 }, fill: { fgColor: { rgb: 'F3F4F6' }, patternType: 'solid' }, alignment: { horizontal: 'left', vertical: 'center' } },
    // Value: white bg, bold
    value: { font: { bold: true, color: { rgb: '111827' }, sz: 11 }, alignment: { horizontal: 'right', vertical: 'center' } },
    // Previous period value: muted
    prev: { font: { color: { rgb: '6B7280' }, sz: 9 }, alignment: { horizontal: 'right', vertical: 'center' } },
    // Change positive
    pos: { font: { bold: true, color: { rgb: '16A34A' }, sz: 9 }, fill: { fgColor: { rgb: 'DCFCE7' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center' } },
    // Change negative
    neg: { font: { bold: true, color: { rgb: 'DC2626' }, sz: 9 }, fill: { fgColor: { rgb: 'FEE2E2' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center' } },
    // Change neutral
    neu: { font: { color: { rgb: '6B7280' }, sz: 9 }, alignment: { horizontal: 'center', vertical: 'center' } },
    // Row alt: very light bg
    alt: { fill: { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' } },
    // Title: large
    title: { font: { bold: true, color: { rgb: '111827' }, sz: 16 }, alignment: { horizontal: 'left', vertical: 'center' } },
    // Subtitle
    sub: { font: { color: { rgb: '6B7280' }, sz: 10 }, alignment: { horizontal: 'left' } },
    // Section title chip (dark bg, white)
    section: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '1F2937' }, patternType: 'solid' }, alignment: { vertical: 'center' } },
    // Table header
    tblHdr: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '374151' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: '111827' } } } },
    // Table cell
    tbl: { font: { sz: 9 }, alignment: { vertical: 'center', wrapText: false } },
    // Table cell alt
    tblAlt: { font: { sz: 9 }, fill: { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' }, alignment: { vertical: 'center' } },
    // Cover brand
    brand: { font: { bold: true, color: { rgb: 'D1D5DB' }, sz: 18 }, fill: { fgColor: { rgb: '111827' }, patternType: 'solid' } },
    // Score good
    scoreGood: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, fill: { fgColor: { rgb: '16A34A' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center' } },
    // AI text
    ai: { font: { color: { rgb: '374151' }, sz: 9 }, alignment: { horizontal: 'left', vertical: 'top', wrapText: true } },
  }

  // ── Cell builder helpers ───────────────────────────────────────────────
  const c = (v: any, s?: object, t?: string): object => ({
    v, t: t ?? (typeof v === 'number' ? 'n' : 's'), s: s ?? {},
  })
  const chgCell = (chg: number | null | undefined) => {
    if (chg == null) return c('n/a', S.neu)
    const label = `${chg > 0 ? '+' : ''}${chg}%`
    return c(label, chg > 0 ? S.pos : chg < 0 ? S.neg : S.neu)
  }
  const blank = () => c('', {})

  // ── Build worksheet from cell grid ────────────────────────────────────
  const buildWs = (grid: object[][], colWidths: number[], rowHeights?: number[]): object => {
    const ws: any = {}
    let maxCol = 0
    grid.forEach((row, r) => {
      if (row.length > maxCol) maxCol = row.length
      row.forEach((cell, col) => {
        const addr = XLSX.utils.encode_cell({ r, c: col })
        ws[addr] = cell
      })
    })
    const lastAddr = XLSX.utils.encode_cell({ r: grid.length - 1, c: maxCol - 1 })
    ws['!ref'] = `A1:${lastAddr}`
    ws['!cols'] = colWidths.map((w) => ({ wch: w }))
    if (rowHeights) ws['!rows'] = rowHeights.map((h) => ({ hpt: h }))
    return ws
  }

  // ── Sheet 1: Dashboard (styled cover + KPI table) ────────────────────
  {
    // Task 12.3: determine platforms for Excel column prefixing (Requirement 9.4)
    const xlPlatforms = activePlatforms(data)
    const xlMulti = isMultiPlatform(data)
    const xlUnavail = data.platformDataUnavailable ?? []

    const kRow = (label: string, cur: any, prev: any, chg: number | null, isAlt: boolean, metricKey?: string) => {
      // Task 12.1: skip entirely when no active platform supports this metric
      if (metricKey && !shouldIncludeMetricSection(metricKey, xlPlatforms)) return null
      const rowStyle = isAlt ? { fill: { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' } } : {}
      const labelS = { ...S.label, ...rowStyle }
      const valueS = { ...S.value, ...rowStyle }
      const prevS = { ...S.prev, ...rowStyle }
      const statusText = chg == null ? 'n/a'
        : chg > 20 ? 'Strong Growth' : chg > 5 ? 'Growth' : chg > 0 ? 'Slight Growth'
        : chg === 0 ? 'Stable' : chg > -10 ? 'Slight Decline' : chg > -25 ? 'Decline' : 'Sharp Decline'
      const statusStyle = chg == null ? S.neu
        : chg > 0 ? { ...S.pos, alignment: { horizontal: 'center', vertical: 'center' } }
        : chg < 0 ? { ...S.neg, alignment: { horizontal: 'center', vertical: 'center' } }
        : S.neu
      return [
        c(label, labelS),
        c(typeof cur === 'number' ? cur : String(cur), { ...valueS, alignment: { horizontal: 'right', vertical: 'center' } }, typeof cur === 'number' ? 'n' : 's'),
        c(typeof prev === 'number' ? prev : String(prev ?? 'n/a'), { ...prevS, alignment: { horizontal: 'right', vertical: 'center' } }, typeof prev === 'number' ? 'n' : 's'),
        chgCell(chg),
        c(statusText, statusStyle),
      ]
    }

    // Task 12.3: column headers — prefix with platform name when multi-platform
    const kpiColHeader = xlMulti
      ? `${xlPlatforms.map((p) => platformDisplayName(p)).join(' + ')} — KEY PERFORMANCE INDICATORS`
      : 'KEY PERFORMANCE INDICATORS'
    const curColLabel = xlMulti ? `Current (${xlPlatforms.map(platformDisplayName).join('+')})` : 'Current Period'

    const scoreColor = data.kpis.performanceScore >= 80 ? '16A34A' : data.kpis.performanceScore >= 60 ? '2563EB' : 'D97706'

    // Task 12.3: unavailability rows for platforms with no data
    const unavailRows: object[][] = xlUnavail.map((up) => [
      c(`${platformDisplayName(up)} — Data unavailable as of ${fmtDate(data.meta.generatedAt)}`,
        { font: { bold: true, color: { rgb: 'D97706' }, sz: 10 }, fill: { fgColor: { rgb: 'FEF3C7' }, patternType: 'solid' }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } }),
      blank(), blank(), blank(), blank(),
    ])

    const dashGrid: object[][] = [
      // Cover row 1: brand + title
      [c('VEEFORE ANALYTICS', S.brand), blank(), blank(), blank(), blank()],
      [c(reportName, { ...S.title, fill: { fgColor: { rgb: 'F9FAFB' }, patternType: 'solid' } }), blank(), blank(), blank(), blank()],
      [blank(), blank(), blank(), blank(), blank()],
      // Meta info block
      [c('REPORT METADATA', S.subHdr), blank(), blank(), blank(), blank()],
      [c('Account', S.label), c(data.accountInfo?.username ?? 'n/a', S.value, 's'), blank(), c('Platform', S.label), c(xlMulti ? xlPlatforms.map(platformDisplayName).join(' + ') : (data.accountInfo?.platform ?? 'Instagram'), S.value, 's')],
      [c('Report Period', S.label), c(data.meta.periodLabel, S.value, 's'), blank(), c('Comparison Period', S.label), c(data.meta.prevPeriodLabel, S.value, 's')],
      [c('Generated', S.label), c(fmtDate(data.meta.generatedAt), S.value, 's'), blank(), c('Exported By', S.label), c(data.meta.exportedBy, S.value, 's')],
      [c('Performance Score', S.label), c(data.kpis.performanceScore, { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 }, fill: { fgColor: { rgb: scoreColor }, patternType: 'solid' }, alignment: { horizontal: 'center' } }, 'n'), blank(), c('Score Label', S.label), c(data.kpis.scoreLabel, { ...S.value, font: { bold: true, color: { rgb: scoreColor }, sz: 11 } }, 's')],
      [blank(), blank(), blank(), blank(), blank()],
      // Unavailability notices (Task 12.3)
      ...unavailRows,
      ...(unavailRows.length > 0 ? [[blank(), blank(), blank(), blank(), blank()]] : []),
      // KPI table header
      [c(kpiColHeader, S.section), blank(), blank(), blank(), blank()],
      [c('Metric', S.hdr), c(curColLabel, S.hdr), c('Prev Period', S.hdr), c('Change %', S.hdr), c('Status', S.hdr)],
      // Reach & Visibility group
      [c('REACH & VISIBILITY', S.subHdr), blank(), blank(), blank(), blank()],
      ...[
        kRow('Total Reach (Unique Accounts)', data.kpis.reach, data.kpis.prevReach, data.kpis.reachChange, false, 'reach_total'),
        kRow('Views / Impressions', data.kpis.views, data.kpis.prevViews, data.kpis.viewsChange, true, 'impressions_total'),
        kRow('Profile Page Views', data.kpis.profileViews, data.kpis.prevProfileViews, data.kpis.profileViewsChange, false, 'profile_visits'),
        kRow('Website Link Clicks', data.kpis.websiteClicks, data.kpis.prevWebsiteClicks, data.kpis.websiteClicksChange, true, 'website_clicks'),
      ].filter(Boolean) as object[][],
      // Engagement group
      [c('ENGAGEMENT', S.subHdr), blank(), blank(), blank(), blank()],
      ...[
        kRow('Total Engagements', data.kpis.engagements, data.kpis.prevEngagements, data.kpis.engagementsChange, false, 'total_engagements'),
        kRow('Engagement Rate %', `${data.kpis.engRate}%`, `${data.kpis.prevEngRate ?? 0}%`, data.kpis.engRateChange, true, 'total_engagements'),
        kRow('Likes', data.kpis.likes, data.kpis.prevLikes, data.kpis.likesChange, false, 'likes'),
        kRow('Comments', data.kpis.comments, data.kpis.prevComments, data.kpis.commentsChange, true, 'comments'),
        kRow('Shares', data.kpis.shares, data.kpis.prevShares, data.kpis.sharesChange, false, 'shares'),
        kRow('Saves', data.kpis.saves, data.kpis.prevSaves, data.kpis.savesChange, true, 'saves'),
        kRow('Save Rate (Saves / Reach)', `${data.kpis.saveRate}%`, `${data.kpis.prevSaveRate}%`, data.kpis.saveRateChange, false, 'saves'),
        kRow('Share Rate (Shares / Reach)', `${data.kpis.shareRate}%`, `${data.kpis.prevShareRate}%`, data.kpis.shareRateChange, true, 'shares'),
      ].filter(Boolean) as object[][],
      // Audience group
      [c('AUDIENCE GROWTH', S.subHdr), blank(), blank(), blank(), blank()],
      ...[
        kRow('Total Followers', data.kpis.followersTotal, 'Snapshot', null, false, 'followers_total'),
        kRow('New Followers Gained', data.kpis.newFollowers, data.kpis.prevNewFollowers, data.kpis.newFollowersChange, true, 'followers_total'),
        kRow('Followers Lost (Unfollows)', data.kpis.lostFollowers, data.kpis.prevLostFollowers, data.kpis.lostFollowersChange, false, 'followers_total'),
        kRow('Net Follower Change', data.kpis.netFollowers, data.kpis.prevNetFollowers ?? 0, null, true, 'followers_total'),
      ].filter(Boolean) as object[][],
      // Publishing group
      [c('PUBLISHING HEALTH', S.subHdr), blank(), blank(), blank(), blank()],
      ...[
        kRow('Posts Published', data.kpis.publishedPosts, 'n/a', null, false, 'published_posts'),
        kRow('Posts Failed', data.kpis.failedPosts, 'n/a', null, true),
        kRow('Publishing Success Rate %', `${data.kpis.publishingSuccessRate}%`, 'n/a', null, false),
      ].filter(Boolean) as object[][],
      [blank(), blank(), blank(), blank(), blank()],
      // AI summary
      [c('AI EXECUTIVE SUMMARY', S.section), blank(), blank(), blank(), blank()],
      [c(data.aiSummary || 'No AI summary available for this period.', { font: { color: { rgb: '374151' }, sz: 10 }, alignment: { wrapText: true, vertical: 'top', horizontal: 'left' } }), blank(), blank(), blank(), blank()],
    ]
    const dashWs = buildWs(dashGrid, [44, 22, 22, 20, 22])
    const summaryLen = data.aiSummary?.length ?? 0
    const summaryHpt = Math.max(80, Math.ceil(summaryLen / 85) * 13)
    dashWs['!rows'] = [
      { hpt: 30 }, { hpt: 26 }, { hpt: 8 },
      { hpt: 20 },
      { hpt: 18 }, { hpt: 20 }, { hpt: 18 }, { hpt: 22 }, { hpt: 8 },
      { hpt: 20 }, { hpt: 18 },
      { hpt: 18 },
      { hpt: 16 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 },
      { hpt: 18 },
      { hpt: 16 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 },
      { hpt: 18 },
      { hpt: 16 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 },
      { hpt: 18 },
      { hpt: 16 }, { hpt: 16 }, { hpt: 16 },
      { hpt: 8 }, { hpt: 20 },
      { hpt: summaryHpt },
    ]
    if (!dashWs['!merges']) dashWs['!merges'] = []
    const mr = (r: number) => ({ s: { r, c: 0 }, e: { r, c: 4 } })
    dashWs['!merges'].push(
      mr(0), mr(1), mr(3),
      mr(9), mr(11), mr(16),
      mr(25), mr(30),
      mr(34), mr(35),
    )
    XLSX.utils.book_append_sheet(wb, dashWs, xlMulti ? `Dashboard (${xlPlatforms.map(platformDisplayName).join('+')})` : 'Dashboard')
  }

  // ── Sheet 2: AI Insights & Recommendations ────────────────────────────
  {
    const aiGrid: object[][] = [
      [c('AI-GENERATED INSIGHTS', S.section), blank()],
      [c('Insight #', S.tblHdr), c('Analysis', S.tblHdr)],
      ...data.aiInsights.map((ins, i) => [
        c(i + 1, { ...S.tbl, font: { bold: true, sz: 9 }, alignment: { horizontal: 'center', vertical: 'top' } }, 'n'),
        c(ins, { ...S.tbl, alignment: { wrapText: true, vertical: 'top' } }),
      ]),
      [blank(), blank()],
      [c('STRATEGIC RECOMMENDATIONS', S.section), blank()],
      [c('#', S.tblHdr), c('Title', S.tblHdr), c('Explanation', S.tblHdr), c('Priority', S.tblHdr), c('Expected Impact', S.tblHdr), c('Difficulty', S.tblHdr), c('Confidence', S.tblHdr)],
      ...data.recommendations.map((r, i) => {
        const isAlt = i % 2 === 1
        const pColor = r.priority === 'HIGH' ? { font: { bold: true, color: { rgb: 'DC2626' }, sz: 9 }, fill: { fgColor: { rgb: 'FEE2E2' }, patternType: 'solid' }, alignment: { horizontal: 'center' } }
          : r.priority === 'MEDIUM' ? { font: { bold: true, color: { rgb: 'D97706' }, sz: 9 }, fill: { fgColor: { rgb: 'FEF3C7' }, patternType: 'solid' }, alignment: { horizontal: 'center' } }
          : { font: { color: { rgb: '6B7280' }, sz: 9 }, fill: { fgColor: { rgb: 'F3F4F6' }, patternType: 'solid' }, alignment: { horizontal: 'center' } }
        const rowBase = isAlt ? S.tblAlt : S.tbl
        return [
          c(i + 1, { ...rowBase, alignment: { horizontal: 'center', vertical: 'top' } }, 'n'),
          c(r.title, { ...rowBase, font: { bold: true, sz: 9 }, alignment: { wrapText: true, vertical: 'top' } }),
          c(r.explanation, { ...rowBase, alignment: { wrapText: true, vertical: 'top' } }),
          c(r.priority, pColor),
          c(r.expectedImpact, rowBase),
          c(r.difficulty, { ...rowBase, alignment: { horizontal: 'center' } }),
          c(r.confidence.toUpperCase(), { ...rowBase, alignment: { horizontal: 'center' } }),
        ]
      }),
      [blank(), blank()],
      [c('GROWTH OPPORTUNITIES', S.section), blank()],
      [c('Opportunity Area', S.tblHdr), c('Description', S.tblHdr), c('Priority', S.tblHdr), c('Expected Impact', S.tblHdr), c('Difficulty', S.tblHdr)],
      ...data.opportunities.map((o, i) => {
        const isAlt = i % 2 === 1
        const rowBase = isAlt ? S.tblAlt : S.tbl
        return [
          c(o.area, { ...rowBase, font: { bold: true, sz: 9 } }),
          c(o.description, { ...rowBase, alignment: { wrapText: true } }),
          c(o.priority, o.priority === 'HIGH' ? { font: { bold: true, color: { rgb: 'DC2626' }, sz: 9 }, fill: { fgColor: { rgb: 'FEE2E2' }, patternType: 'solid' }, alignment: { horizontal: 'center' } } : S.neu),
          c(o.impact, rowBase),
          c(o.difficulty, { ...rowBase, alignment: { horizontal: 'center' } }),
        ]
      }),
      [blank(), blank()],
      [c('CONTENT STRATEGY ANALYSIS', S.section), blank()],
      [c(data.contentStrategy || '', { ...S.ai, alignment: { wrapText: true, vertical: 'top' } }), blank()],
    ]
    const aiWs = buildWs(aiGrid, [5, 38, 90, 12, 32, 14, 14])
    if (!aiWs['!merges']) aiWs['!merges'] = []
    // Merge section headers across all 7 columns
    const insightRows = 2 + data.aiInsights.length
    const recHeaderRow = insightRows + 2
    const recRows = recHeaderRow + 1 + data.recommendations.length
    const oppHeaderRow = recRows + 2
    const oppRows = oppHeaderRow + 1 + data.opportunities.length
    const stratHeaderRow = oppRows + 2
    aiWs['!merges'].push(
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: insightRows + 1, c: 0 }, e: { r: insightRows + 1, c: 6 } },
      { s: { r: recRows + 1, c: 0 }, e: { r: recRows + 1, c: 6 } },
      { s: { r: stratHeaderRow, c: 0 }, e: { r: stratHeaderRow, c: 6 } },
      { s: { r: stratHeaderRow + 1, c: 0 }, e: { r: stratHeaderRow + 1, c: 6 } },
    )
    // Dynamic row heights for long text
    const rowHeights: { hpt: number }[] = [
      { hpt: 22 }, { hpt: 16 }, // section + col header
      ...data.aiInsights.map((ins) => ({ hpt: Math.max(36, Math.ceil(ins.length / 85) * 13) })),
      { hpt: 10 }, { hpt: 22 }, { hpt: 16 }, // blank + recs header + col header
      ...data.recommendations.map((r) => ({ hpt: Math.max(42, Math.ceil((r.explanation?.length ?? 0) / 85) * 13) })),
      { hpt: 10 }, { hpt: 22 }, { hpt: 16 }, // blank + opps header + col header
      ...data.opportunities.map((o) => ({ hpt: Math.max(30, Math.ceil((o.description?.length ?? 0) / 85) * 13) })),
      { hpt: 10 }, { hpt: 22 }, // blank + strategy header
      { hpt: Math.max(60, Math.ceil((data.contentStrategy?.length ?? 0) / 100) * 13) },
    ]
    aiWs['!rows'] = rowHeights
    XLSX.utils.book_append_sheet(wb, aiWs, 'AI Insights')
  }

  // ── Sheet 3: Daily Trend ──────────────────────────────────────────────
  if (data.dailySeries.length > 0) {
    const hdrRow = ['DATE', 'REACH', 'VIEWS', 'LIKES', 'COMMENTS', 'SHARES', 'SAVES', 'ENGAGEMENTS', 'ENG RATE %', 'PROFILE VIEWS', 'WEBSITE CLICKS', 'NEW FOLLOWERS', 'LOST FOLLOWERS'].map((h) => c(h, S.tblHdr))
    const dataRows = data.dailySeries.map((d, i) => {
      const isAlt = i % 2 === 1
      const base = isAlt ? S.tblAlt : S.tbl
      const engR = d.reach > 0 ? `${Math.round((d.engagements / d.reach) * 10000) / 100}%` : '0%'
      return [
        c(d.date, { ...base, font: { bold: true, sz: 9 } }),
        c(d.reach, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.views, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.likes, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.comments, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.shares, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.saves, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.engagements, { ...base, font: { bold: true, sz: 9 }, alignment: { horizontal: 'right' } }, 'n'),
        c(engR, { ...base, alignment: { horizontal: 'center' } }),
        c(d.profileViews, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.websiteClicks, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(d.newFollowers, { ...base, font: { color: { rgb: d.newFollowers > 0 ? '16A34A' : '111827' }, sz: 9 }, alignment: { horizontal: 'right' } }, 'n'),
        c(d.lostFollowers, { ...base, font: { color: { rgb: d.lostFollowers > 0 ? 'DC2626' : '111827' }, sz: 9 }, alignment: { horizontal: 'right' } }, 'n'),
      ]
    })
    const trendWs = buildWs([hdrRow, ...dataRows], [13, 10, 10, 8, 10, 8, 8, 14, 10, 14, 16, 14, 15], undefined)
    XLSX.utils.book_append_sheet(wb, trendWs, 'Daily Trend')
  }

  // ── Sheet 4: Posts ────────────────────────────────────────────────────
  {
    const hdrRow = ['#', 'TITLE', 'TYPE', 'PUBLISHED DATE', 'REACH', 'VIEWS', 'LIKES', 'COMMENTS', 'SHARES', 'SAVES', 'ENGAGEMENTS', 'ENG RATE %', 'LINK'].map((h) => c(h, S.tblHdr))
    const postRows = data.posts.map((p, i) => {
      const isAlt = i % 2 === 1
      const base = isAlt ? S.tblAlt : S.tbl
      // Colour code by eng rate
      const engColor = p.metrics.engRate >= 5 ? '16A34A' : p.metrics.engRate >= 2 ? 'D97706' : '6B7280'
      return [
        c(p.rank, { ...base, alignment: { horizontal: 'center' } }, 'n'),
        c(p.title, { ...base, alignment: { wrapText: false } }),
        c(p.mediaType, { ...base, alignment: { horizontal: 'center' } }),
        c(fmtDate(p.publishedAt), base),
        c(p.metrics.reach, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(p.metrics.views, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(p.metrics.likes, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(p.metrics.comments, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(p.metrics.shares, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(p.metrics.saves, { ...base, alignment: { horizontal: 'right' } }, 'n'),
        c(p.metrics.engagements, { ...base, font: { bold: true, sz: 9 }, alignment: { horizontal: 'right' } }, 'n'),
        c(`${p.metrics.engRate}%`, { ...base, font: { bold: true, color: { rgb: engColor }, sz: 9 }, alignment: { horizontal: 'center' } }),
        c(p.permalink ?? '', base),
      ]
    })
    const postsWs = buildWs([hdrRow, ...postRows], [4, 42, 14, 14, 10, 10, 8, 10, 8, 8, 12, 10, 40])
    XLSX.utils.book_append_sheet(wb, postsWs, 'Posts')
  }

  // ── Sheet 5: Audience ─────────────────────────────────────────────────
  {
    const atKeys = Object.keys(data.demographics.activeTime).map(Number).sort((a, b) => a - b)
    const totCountry = data.demographics.country.reduce((s, x) => s + x.value, 0) || 1

    const audGrid: object[][] = [
      [c('AUDIENCE BY COUNTRY', S.section), blank(), blank()],
      [c('Country', S.tblHdr), c('Followers', S.tblHdr), c('Share %', S.tblHdr)],
      ...data.demographics.country.map((row, i) => [
        c(row.label, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(row.value, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        c(`${Math.round((row.value / totCountry) * 100)}%`, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'center' } }),
      ]),
      [blank(), blank(), blank()],
      [c('AUDIENCE BY CITY', S.section), blank(), blank()],
      [c('City', S.tblHdr), c('Followers', S.tblHdr), blank()],
      ...data.demographics.city.map((row, i) => [
        c(row.label, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(row.value, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        blank(),
      ]),
      [blank(), blank(), blank()],
      [c('AUDIENCE BY GENDER & AGE', S.section), blank(), blank()],
      [c('Segment', S.tblHdr), c('Followers', S.tblHdr), blank()],
      ...data.demographics.genderAge.map((row, i) => [
        c(row.label, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(row.value, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        blank(),
      ]),
      [blank(), blank(), blank()],
      [c('BEST TIME TO POST', S.section), blank(), blank()],
      [c('Hour (Local Time)', S.tblHdr), c('Avg Followers Online', S.tblHdr), blank()],
      ...atKeys.map((h, i) => [
        c(fmtHour(h), i % 2 === 0 ? S.tbl : S.tblAlt),
        c(data.demographics.activeTime[String(h)], { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        blank(),
      ]),
    ]
    const audWs = buildWs(audGrid, [28, 16, 10])
    if (!audWs['!merges']) audWs['!merges'] = []
    audWs['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } })
    XLSX.utils.book_append_sheet(wb, audWs, 'Audience')
  }

  // ── Sheet 6: Raw Data ─────────────────────────────────────────────────
  {
    // Task 12.3: prefix metric keys with platform name when multi-platform
    const rawPlatforms = activePlatforms(data)
    const rawMulti = isMultiPlatform(data)
    // Helper: returns the metric key with optional platform prefix
    const prefixedKey = (key: string, platform?: PlatformId): string => {
      if (!rawMulti || !platform) return key
      return `${platformColPrefix(platform)}${key}`
    }
    // For multi-platform, generate a platform column header for each metric key
    const metricColHeader = rawMulti
      ? `METRIC [${rawPlatforms.map((p) => platformDisplayName(p)).join('|')}]`
      : 'METRIC'

    const rawGrid: object[][] = [
      [c(metricColHeader, S.tblHdr), c('VALUE', S.tblHdr), c('PREV PERIOD', S.tblHdr), c('UNIT', S.tblHdr), c('SOURCE', S.tblHdr), c('NOTE', S.tblHdr)],
      [c('REACH & VISIBILITY', S.subHdr), blank(), blank(), blank(), blank(), blank()],
      ...[
        // Task 12.1: only include rows for metrics supported by active platforms
        ...( shouldIncludeMetricSection('followers_total', rawPlatforms) ? [
          [prefixedKey('followers_total', rawMulti ? rawPlatforms[0] : undefined), data.kpis.followersTotal, 'n/a', 'count', 'Meta Graph API', 'Latest snapshot'],
        ] : []),
        ...( shouldIncludeMetricSection('reach_total', rawPlatforms) ? [
          [prefixedKey('reach_period', rawMulti ? rawPlatforms[0] : undefined), data.kpis.reach, data.kpis.prevReach, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
        ] : []),
        ...( shouldIncludeMetricSection('impressions_total', rawPlatforms) ? [
          [prefixedKey('views_impressions', rawMulti ? rawPlatforms[0] : undefined), data.kpis.views, data.kpis.prevViews, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
        ] : []),
        ...( shouldIncludeMetricSection('profile_visits', rawPlatforms) ? [
          [prefixedKey('profile_views', rawMulti ? rawPlatforms[0] : undefined), data.kpis.profileViews, data.kpis.prevProfileViews, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
        ] : []),
        ...( shouldIncludeMetricSection('website_clicks', rawPlatforms) ? [
          [prefixedKey('website_clicks', rawMulti ? rawPlatforms[0] : undefined), data.kpis.websiteClicks, data.kpis.prevWebsiteClicks, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
        ] : []),
      ].map(([k, v, p, u, src, note], i) => [
        c(k, i % 2 === 0 ? S.label : { ...S.tbl }),
        c(v, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        c(p, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, typeof p === 'number' ? 'n' : 's'),
        c(u, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(src, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(note, i % 2 === 0 ? S.tbl : S.tblAlt),
      ]),
      [c('ENGAGEMENT', S.subHdr), blank(), blank(), blank(), blank(), blank()],
      ...[
        ['engagements_total', data.kpis.engagements, data.kpis.prevEngagements, 'count', 'Calculated', 'Likes+Comments+Shares+Saves'],
        ['engagement_rate', data.kpis.engRate, data.kpis.prevEngRate, 'percent', 'Calculated', 'Engagements/Reach*100'],
        ['likes', data.kpis.likes, data.kpis.prevLikes, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
        ['comments', data.kpis.comments, data.kpis.prevComments, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
        ['shares', data.kpis.shares, data.kpis.prevShares, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
        // Task 12.1: 'saves' is NONE on Facebook — only include when at least one platform supports it
        ...( shouldIncludeMetricSection('saves', rawPlatforms) ? [
          ['saves', data.kpis.saves, data.kpis.prevSaves, 'count', 'AnalyticsDailyMetric', 'Sum over period'],
          ['save_rate', data.kpis.saveRate, data.kpis.prevSaveRate, 'percent', 'Calculated', 'Saves/Reach*100'],
        ] : []),
        ['share_rate', data.kpis.shareRate, data.kpis.prevShareRate, 'percent', 'Calculated', 'Shares/Reach*100'],
      ].map(([k, v, p, u, src, note], i) => [
        c(k, i % 2 === 0 ? S.label : { ...S.tbl }),
        c(v, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        c(p, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, typeof p === 'number' ? 'n' : 's'),
        c(u, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(src, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(note, i % 2 === 0 ? S.tbl : S.tblAlt),
      ]),
      [c('AUDIENCE', S.subHdr), blank(), blank(), blank(), blank(), blank()],
      ...[
        ['new_followers', data.kpis.newFollowers, data.kpis.prevNewFollowers, 'count', 'follows_and_unfollows', 'Gained in period'],
        ['lost_followers', data.kpis.lostFollowers, data.kpis.prevLostFollowers, 'count', 'follows_and_unfollows', 'Lost in period'],
        ['net_followers', data.kpis.netFollowers, data.kpis.prevNetFollowers ?? 0, 'count', 'Calculated', 'New - Lost'],
      ].map(([k, v, p, u, src, note], i) => [
        c(k, i % 2 === 0 ? S.label : { ...S.tbl }),
        c(v, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        c(p, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, typeof p === 'number' ? 'n' : 's'),
        c(u, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(src, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(note, i % 2 === 0 ? S.tbl : S.tblAlt),
      ]),
      [c('PUBLISHING', S.subHdr), blank(), blank(), blank(), blank(), blank()],
      ...[
        ['published_posts', data.kpis.publishedPosts, 'n/a', 'count', 'ContentModel', 'Published in period'],
        ['failed_posts', data.kpis.failedPosts, 'n/a', 'count', 'ContentModel', 'Failed in period'],
        ['publishing_success_rate', data.kpis.publishingSuccessRate, 'n/a', 'percent', 'Calculated', 'Published/Total*100'],
        ['performance_score', data.kpis.performanceScore, 'n/a', 'score', 'Calculated', 'Composite 0-100'],
      ].map(([k, v, p, u, src, note], i) => [
        c(k, i % 2 === 0 ? S.label : { ...S.tbl }),
        c(v, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, 'n'),
        c(p, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(u, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(src, i % 2 === 0 ? S.tbl : S.tblAlt),
        c(note, i % 2 === 0 ? S.tbl : S.tblAlt),
      ]),
      [blank(), blank(), blank(), blank(), blank(), blank()],
      [c('REPORT METADATA', S.subHdr), blank(), blank(), blank(), blank(), blank()],
      ...[
        ['period_from', data.meta.from], ['period_to', data.meta.to],
        ['period_days', data.meta.spanDays], ['generated_at', data.meta.generatedAt],
        ['exported_by', data.meta.exportedBy], ['api_version', data.meta.apiVersion],
        ['account_username', data.accountInfo?.username ?? 'n/a'],
        ['account_type', data.accountInfo?.accountType ?? 'n/a'],
      ].map(([k, v], i) => [
        c(k, i % 2 === 0 ? S.label : { ...S.tbl }), c(v, i % 2 === 0 ? S.tbl : S.tblAlt), blank(), blank(), blank(), blank(),
      ]),
    ]
    const rawWs = buildWs(rawGrid, [30, 18, 18, 10, 24, 35])
    // Task 12.3: name the sheet tab with platform identity (Requirement 9.4)
    const rawSheetName = rawMulti
      ? `Raw Data (${rawPlatforms.map(platformDisplayName).join('+')})`
      : 'Raw Data'
    XLSX.utils.book_append_sheet(wb, rawWs, rawSheetName.slice(0, 31)) // Excel tab names max 31 chars

    // Task 12.3: add per-platform sheets when multi-platform (Requirement 9.4)
    if (rawMulti) {
      rawPlatforms.forEach((platform) => {
        const isUnavail = (data.platformDataUnavailable ?? []).includes(platform)
        const pData = data.platformData?.[platform] as any
        const prefix = platformColPrefix(platform)
        const pKpiRows: object[][] = []
        if (isUnavail) {
          pKpiRows.push([
            c(`${platformDisplayName(platform)} — Data unavailable as of ${fmtDate(data.meta.generatedAt)}`,
              { font: { bold: true, color: { rgb: 'D97706' }, sz: 11 }, fill: { fgColor: { rgb: 'FEF3C7' }, patternType: 'solid' }, alignment: { horizontal: 'left', wrapText: true } }),
            blank(), blank(), blank(), blank(),
          ])
        } else if (pData) {
          pKpiRows.push([c(`${PLATFORM_LABEL[platform] ?? platformDisplayName(platform)} — KPI Summary`, S.section), blank(), blank(), blank(), blank()])
          pKpiRows.push([c(`${prefix}metric`, S.tblHdr), c(`${prefix}value`, S.tblHdr), c(`${prefix}prev`, S.tblHdr), c('unit', S.tblHdr), c('note', S.tblHdr)])
          const entries: [string, any, any, string, string][] = [
            ...(shouldIncludeMetricSection('reach_total', [platform]) && pData.reach != null ? [['reach', pData.reach, pData.prevReach ?? 'n/a', 'count', 'Sum over period'] as [string,any,any,string,string]] : []),
            ...(shouldIncludeMetricSection('impressions_total', [platform]) && pData.views != null ? [['views', pData.views, pData.prevViews ?? 'n/a', 'count', 'Sum over period'] as [string,any,any,string,string]] : []),
            ...(shouldIncludeMetricSection('total_engagements', [platform]) && pData.engagements != null ? [['engagements', pData.engagements, pData.prevEngagements ?? 'n/a', 'count', 'Sum over period'] as [string,any,any,string,string]] : []),
            ...(shouldIncludeMetricSection('likes', [platform]) && pData.likes != null ? [['likes', pData.likes, pData.prevLikes ?? 'n/a', 'count', 'Sum over period'] as [string,any,any,string,string]] : []),
            ...(shouldIncludeMetricSection('saves', [platform]) && pData.saves != null ? [['saves', pData.saves, pData.prevSaves ?? 'n/a', 'count', 'Sum over period'] as [string,any,any,string,string]] : []),
            ...(shouldIncludeMetricSection('followers_total', [platform]) && pData.followersTotal != null ? [['followers_total', pData.followersTotal, 'n/a', 'count', 'Snapshot'] as [string,any,any,string,string]] : []),
          ]
          entries.forEach(([k, v, p, u, note], i) => {
            pKpiRows.push([
              c(`${prefix}${k}`, i % 2 === 0 ? S.label : S.tbl),
              c(v, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, typeof v === 'number' ? 'n' : 's'),
              c(p, { ...(i % 2 === 0 ? S.tbl : S.tblAlt), alignment: { horizontal: 'right' } }, typeof p === 'number' ? 'n' : 's'),
              c(u, i % 2 === 0 ? S.tbl : S.tblAlt),
              c(note, i % 2 === 0 ? S.tbl : S.tblAlt),
            ])
          })
        }
        if (pKpiRows.length > 0) {
          const pWs = buildWs(pKpiRows, [32, 18, 18, 12, 30])
          XLSX.utils.book_append_sheet(wb, pWs, platformDisplayName(platform).slice(0, 31))
        }
      })
    }
  }

  // Write using xlsx-js-style write (preserves styles in the binary)
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${reportName}.xlsx`; a.click()
  URL.revokeObjectURL(url)
}

// ── 4. CSV Export — Clean Machine-Readable ────────────────────────────────

export function exportCSV(opts: ExportOptions): void {
  const { data, reportName } = opts
  const rows: (string | number)[][] = []
  const s = () => rows.push([])
  const h = (t: string) => { s(); rows.push([`# ${t.toUpperCase()}`]) }

  // Task 12.3: determine platform prefix for multi-platform CSV
  const csvPlatforms = activePlatforms(data)
  const csvMulti = isMultiPlatform(data)
  // For single-platform keep keys as-is; for multi-platform prefix with platform name
  const prefix = (key: string, platform?: PlatformId): string => {
    if (!csvMulti || !platform) return key
    return `${platformColPrefix(platform)}${key}`
  }

  // Metadata
  rows.push(['veefore_report_version', '2.0'])
  rows.push(['workspace_name', data.meta.workspaceName])
  rows.push(['account_username', data.accountInfo?.username ?? ''])
  // Task 12.3: include all platforms in the platform field
  rows.push(['account_platform', csvMulti ? csvPlatforms.map(platformDisplayName).join('+') : (data.accountInfo?.platform ?? 'Instagram')])
  rows.push(['account_type', data.accountInfo?.accountType ?? ''])
  rows.push(['period_from', data.meta.from])
  rows.push(['period_to', data.meta.to])
  rows.push(['period_label', data.meta.periodLabel])
  rows.push(['comparison_period', data.meta.prevPeriodLabel])
  rows.push(['generated_at', data.meta.generatedAt])
  rows.push(['exported_by', data.meta.exportedBy])
  rows.push(['api_version', data.meta.apiVersion])
  rows.push(['performance_score', data.kpis.performanceScore])
  rows.push(['performance_label', data.kpis.scoreLabel])
  s()

  // Task 12.3: unavailability notices for missing platforms
  const csvUnavail = data.platformDataUnavailable ?? []
  if (csvUnavail.length > 0) {
    h('PLATFORM_DATA_AVAILABILITY')
    csvPlatforms.forEach((p) => {
      rows.push([`platform_${p}_status`, csvUnavail.includes(p) ? `Data unavailable as of ${data.meta.generatedAt}` : 'available'])
    })
    s()
  }

  h('PERFORMANCE_KPIS')
  // Task 12.3: prefix column headers with platform name when multi-platform
  const kpiHeaderKey = csvMulti ? `${csvPlatforms.map(platformDisplayName).join('|')}_metric_key` : 'metric_key'
  rows.push([kpiHeaderKey, 'current_value', 'previous_value', 'change_percent', 'unit'])

  // Task 12.1: gate each row — only include when at least one platform supports the metric
  const kpiRows: [string, number, number | string, string, string][] = [
    ...( shouldIncludeMetricSection('reach_total', csvPlatforms) ? [[prefix('reach', csvMulti ? csvPlatforms[0] : undefined), data.kpis.reach, data.kpis.prevReach, data.kpis.reachChange != null ? `${data.kpis.reachChange}` : '', 'count'] as [string, number, number | string, string, string]] : []),
    ...( shouldIncludeMetricSection('impressions_total', csvPlatforms) ? [[prefix('views_impressions', csvMulti ? csvPlatforms[0] : undefined), data.kpis.views, data.kpis.prevViews, data.kpis.viewsChange != null ? `${data.kpis.viewsChange}` : '', 'count'] as [string, number, number | string, string, string]] : []),
    ...( shouldIncludeMetricSection('total_engagements', csvPlatforms) ? [[prefix('engagements_total', csvMulti ? csvPlatforms[0] : undefined), data.kpis.engagements, data.kpis.prevEngagements, data.kpis.engagementsChange != null ? `${data.kpis.engagementsChange}` : '', 'count'] as [string, number, number | string, string, string]] : []),
    [prefix('engagement_rate', csvMulti ? csvPlatforms[0] : undefined), data.kpis.engRate, '', '', 'percent'],
    [prefix('likes', csvMulti ? csvPlatforms[0] : undefined), data.kpis.likes, '', '', 'count'],
    [prefix('comments', csvMulti ? csvPlatforms[0] : undefined), data.kpis.comments, '', '', 'count'],
    [prefix('shares', csvMulti ? csvPlatforms[0] : undefined), data.kpis.shares, '', '', 'count'],
    ...( shouldIncludeMetricSection('saves', csvPlatforms) ? [
      [prefix('saves', csvMulti ? csvPlatforms.find((p) => getSupportingPlatforms('saves', csvPlatforms).includes(p)) : undefined), data.kpis.saves, '', '', 'count'] as [string, number, number | string, string, string],
      [prefix('save_rate', csvMulti ? csvPlatforms.find((p) => getSupportingPlatforms('saves', csvPlatforms).includes(p)) : undefined), data.kpis.saveRate, '', '', 'percent'] as [string, number, number | string, string, string],
    ] : []),
    [prefix('share_rate', csvMulti ? csvPlatforms[0] : undefined), data.kpis.shareRate, '', '', 'percent'],
    ...( shouldIncludeMetricSection('profile_visits', csvPlatforms) ? [[prefix('profile_views', csvMulti ? csvPlatforms[0] : undefined), data.kpis.profileViews, '', '', 'count'] as [string, number, number | string, string, string]] : []),
    ...( shouldIncludeMetricSection('website_clicks', csvPlatforms) ? [[prefix('website_clicks', csvMulti ? csvPlatforms[0] : undefined), data.kpis.websiteClicks, '', '', 'count'] as [string, number, number | string, string, string]] : []),
    [prefix('followers_total', csvMulti ? csvPlatforms[0] : undefined), data.kpis.followersTotal, '', '', 'count'],
    [prefix('following_total', csvMulti ? csvPlatforms[0] : undefined), data.kpis.followingTotal, '', '', 'count'],
    [prefix('new_followers', csvMulti ? csvPlatforms[0] : undefined), data.kpis.newFollowers, '', data.kpis.newFollowersChange != null ? `${data.kpis.newFollowersChange}` : '', 'count'],
    [prefix('lost_followers', csvMulti ? csvPlatforms[0] : undefined), data.kpis.lostFollowers, '', '', 'count'],
    [prefix('net_followers', csvMulti ? csvPlatforms[0] : undefined), data.kpis.netFollowers, '', '', 'count'],
    [prefix('published_posts', csvMulti ? csvPlatforms[0] : undefined), data.kpis.publishedPosts, '', '', 'count'],
    [prefix('failed_posts', csvMulti ? csvPlatforms[0] : undefined), data.kpis.failedPosts, '', '', 'count'],
    [prefix('publishing_success_rate', csvMulti ? csvPlatforms[0] : undefined), data.kpis.publishingSuccessRate, '', '', 'percent'],
  ]
  for (const r of kpiRows) rows.push(r)
  s()

  // Task 12.2: per-platform KPI sections for multi-platform reports
  if (csvMulti) {
    h('PER_PLATFORM_KPIS')
    csvPlatforms.forEach((platform) => {
      h(`PLATFORM_${platformDisplayName(platform).toUpperCase()}`)
      if (csvUnavail.includes(platform)) {
        rows.push([`${platformColPrefix(platform)}status`, `Data unavailable as of ${data.meta.generatedAt}`])
      } else {
        const pData = data.platformData?.[platform] as any
        if (pData) {
          rows.push([`${prefix('metric_key', platform)}`, 'value', 'unit'])
          if (shouldIncludeMetricSection('reach_total', [platform]) && pData.reach != null) rows.push([`${platformColPrefix(platform)}reach`, pData.reach, 'count'])
          if (shouldIncludeMetricSection('impressions_total', [platform]) && pData.views != null) rows.push([`${platformColPrefix(platform)}views`, pData.views, 'count'])
          if (shouldIncludeMetricSection('total_engagements', [platform]) && pData.engagements != null) rows.push([`${platformColPrefix(platform)}engagements`, pData.engagements, 'count'])
          if (shouldIncludeMetricSection('likes', [platform]) && pData.likes != null) rows.push([`${platformColPrefix(platform)}likes`, pData.likes, 'count'])
          if (shouldIncludeMetricSection('saves', [platform]) && pData.saves != null) rows.push([`${platformColPrefix(platform)}saves`, pData.saves, 'count'])
          if (shouldIncludeMetricSection('followers_total', [platform]) && pData.followersTotal != null) rows.push([`${platformColPrefix(platform)}followers_total`, pData.followersTotal, 'count'])
        }
      }
      s()
    })
  }

  if (data.dailySeries.length > 0) {
    h('DAILY_PERFORMANCE')
    rows.push(['date', 'reach', 'views', 'likes', 'comments', 'shares', 'saves', 'engagements', 'profile_views', 'website_clicks', 'new_followers', 'lost_followers'])
    for (const d of data.dailySeries) rows.push([d.date, d.reach, d.views, d.likes, d.comments, d.shares, d.saves, d.engagements, d.profileViews, d.websiteClicks, d.newFollowers, d.lostFollowers])
    s()
  }

  h('POSTS_PERFORMANCE')
  rows.push(['rank', 'post_id', 'title', 'media_type', 'published_at_iso', 'reach', 'views', 'likes', 'comments', 'shares', 'saves', 'engagements', 'engagement_rate_percent', 'permalink'])
  for (const p of data.posts) rows.push([p.rank, p.id, p.title, p.mediaType, p.publishedAt ?? '', p.metrics.reach, p.metrics.views, p.metrics.likes, p.metrics.comments, p.metrics.shares, p.metrics.saves, p.metrics.engagements, p.metrics.engRate, p.permalink ?? ''])
  s()

  h('AUDIENCE_COUNTRY')
  rows.push(['country', 'followers_count'])
  for (const c of data.demographics.country) rows.push([c.label, c.value])
  s()

  h('AUDIENCE_CITY')
  rows.push(['city', 'followers_count'])
  for (const c of data.demographics.city) rows.push([c.label, c.value])
  s()

  h('AUDIENCE_GENDER_AGE')
  rows.push(['segment', 'followers_count'])
  for (const g of data.demographics.genderAge) rows.push([g.label, g.value])
  s()

  h('BEST_TIME_TO_POST')
  rows.push(['hour_24', 'hour_label', 'avg_followers_online'])
  Object.keys(data.demographics.activeTime).map(Number).sort((a, b) => a - b).forEach((h) => {
    rows.push([h, fmtHour(h), data.demographics.activeTime[String(h)]])
  })
  s()

  h('AI_RECOMMENDATIONS')
  rows.push(['rank', 'title', 'explanation', 'priority', 'expected_impact', 'difficulty', 'confidence'])
  for (const r of data.recommendations) rows.push([data.recommendations.indexOf(r) + 1, r.title, r.explanation, r.priority, r.expectedImpact, r.difficulty, r.confidence])

  const csv = rows.map((r) =>
    r.map((c) => (typeof c === 'string' ? `"${c.replace(/"/g, '""')}"` : c)).join(',')
  ).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = `${reportName}.csv`; a.click(); URL.revokeObjectURL(url)
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

export async function runExport(opts: ExportOptions): Promise<void> {
  switch (opts.format) {
    case 'csv': return exportCSV(opts)
    case 'excel': return exportExcel(opts)
    case 'pdf': return exportPDF(opts)
    case 'pptx': return exportPPTX(opts)
  }
}
