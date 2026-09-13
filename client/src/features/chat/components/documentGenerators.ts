/**
 * documentGenerators — turns a VeeGPT `document` info-card spec into a polished,
 * downloadable file (PDF, Word, Excel, PowerPoint) AND provides the shared HTML
 * used by the in-app document viewer, so what you preview is what you download.
 *
 * Everything runs in the browser (the libraries are already bundled); each is
 * dynamically imported so its weight only loads the first time it's used. The
 * PDF is rendered from the SAME premium HTML as the viewer (via html2canvas), so
 * layout, charts, callouts and typography match exactly and always look good.
 *
 * Every document is branded with the VeeFore logo (logo only) in the footer.
 */

export type DocType = 'pdf' | 'docx' | 'xlsx' | 'pptx'

export interface DocChartPoint { label: string; value: number }
export interface DocChart { title?: string; points: DocChartPoint[] }
export interface DocSection {
  heading?: string
  body?: string
  bullets?: string[]
  callout?: string
  chart?: DocChart
}
export interface DocSheet {
  name?: string
  columns: string[]
  rows: Array<Array<string | number>>
}
export interface DocSlide { title?: string; bullets?: string[]; body?: string }
export interface DocHighlight { label: string; value: string; sublabel?: string }
export interface DocumentSpec {
  sections?: DocSection[]
  sheets?: DocSheet[]
  slides?: DocSlide[]
}
export interface DocumentCard {
  docType: DocType
  title?: string
  subtitle?: string
  summary?: string
  highlights?: DocHighlight[]
  spec?: DocumentSpec
}

const ACCENT = '#2563EB'
const ACCENT_HEX = '2563EB'
const LOGO_SRC = '/veefore-logo.png'

// ── Logo loading (cached) ─────────────────────────────────────────────────────
let logoDataUrlPromise: Promise<string | null> | null = null
export function loadLogoDataUrl(): Promise<string | null> {
  if (logoDataUrlPromise) return logoDataUrlPromise
  logoDataUrlPromise = (async () => {
    try {
      const res = await fetch(LOGO_SRC)
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise<string | null>((resolve) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => resolve(null)
        fr.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  })()
  return logoDataUrlPromise
}
async function loadLogoBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LOGO_SRC)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function fileNameFor(title: string | undefined, ext: string): string {
  const base = (title || 'document')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
  return `${base || 'document'}.${ext}`
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Minimal inline emphasis (**bold**, *italic*, `code`) so bodies read richly. */
function inlineHtml(s: string): string {
  let t = esc(s)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  t = t.replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,Menlo,monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:0.92em;">$1</code>')
  return t
}

function chartHtml(chart: DocChart): string {
  const max = Math.max(1, ...chart.points.map((p) => (Number.isFinite(p.value) ? p.value : 0)))
  const bars = chart.points
    .map((p) => {
      const h = Math.max(4, Math.round(((p.value || 0) / max) * 150))
      return (
        `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;flex:1;min-width:0;">` +
        `<div style="font-size:11px;font-weight:700;color:#111827;margin-bottom:4px;">${esc(String(p.value))}</div>` +
        `<div style="width:70%;max-width:56px;height:${h}px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,#3b82f6,#2563eb);"></div>` +
        `<div style="font-size:11px;color:#6b7280;margin-top:6px;text-align:center;word-break:break-word;line-height:1.3;">${esc(p.label)}</div>` +
        `</div>`
      )
    })
    .join('')
  return (
    `<div style="margin:16px 0;padding:16px 16px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fbfcfe;">` +
    (chart.title ? `<div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px;">${esc(chart.title)}</div>` : '') +
    `<div style="display:flex;align-items:flex-end;gap:12px;min-height:170px;">${bars}</div>` +
    `</div>`
  )
}

function tableHtml(columns: string[], rows: Array<Array<string | number>>): string {
  const th = columns
    .map(
      (c) =>
        `<th style="border:1px solid ${ACCENT};background:${ACCENT};color:#fff;padding:8px 12px;text-align:left;font-weight:700;font-size:13px;">${esc(String(c))}</th>`
    )
    .join('')
  const trs = rows
    .map(
      (r, ri) =>
        `<tr style="background:${ri % 2 ? '#f3f6fc' : '#ffffff'};">` +
        columns
          .map(
            (_, ci) =>
              `<td style="border:1px solid #e5e7eb;padding:7px 12px;font-size:13px;color:#374151;vertical-align:top;">${esc(String(r[ci] ?? ''))}</td>`
          )
          .join('') +
        `</tr>`
    )
    .join('')
  return `<table style="border-collapse:collapse;width:100%;margin:14px 0;">${`<thead><tr>${th}</tr></thead>`}<tbody>${trs}</tbody></table>`
}

/**
 * The premium document body HTML — shared by the in-app viewer and the PDF
 * export (rendered via html2canvas). No outer page padding; the viewer/exporter
 * supply page margins. The footer/logo is added by each surface separately.
 */
export function buildDocumentBodyHtml(card: DocumentCard): string {
  const parts: string[] = []
  parts.push(
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">`
  )

  // Cover / title block
  parts.push(
    `<div style="margin-bottom:8px;">` +
      `<div style="width:52px;height:5px;border-radius:3px;background:${ACCENT};margin-bottom:16px;"></div>` +
      `<h1 style="font-size:30px;line-height:1.2;font-weight:800;color:#0f172a;margin:0 0 6px;">${esc(card.title || 'Document')}</h1>` +
      (card.subtitle
        ? `<p style="font-size:15px;color:#6b7280;margin:0;line-height:1.5;">${esc(card.subtitle)}</p>`
        : '') +
      `</div>`
  )

  // Highlights (stat cards)
  if (card.highlights?.length) {
    const cards = card.highlights
      .map(
        (h) =>
          `<div style="flex:1;min-width:120px;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:linear-gradient(180deg,#f8fbff,#ffffff);">` +
          `<div style="font-size:24px;font-weight:800;color:${ACCENT};line-height:1.1;">${esc(h.value)}</div>` +
          `<div style="font-size:12px;font-weight:600;color:#374151;margin-top:4px;">${esc(h.label)}</div>` +
          (h.sublabel ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${esc(h.sublabel)}</div>` : '') +
          `</div>`
      )
      .join('')
    parts.push(`<div style="display:flex;flex-wrap:wrap;gap:12px;margin:18px 0 6px;">${cards}</div>`)
  }

  const spec = card.spec || {}

  // Sections (written content)
  for (const sec of spec.sections || []) {
    parts.push('<div style="margin-top:18px;">')
    if (sec.heading) {
      parts.push(
        `<h2 style="font-size:17px;font-weight:700;color:#0f172a;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #eef2f7;">${esc(sec.heading)}</h2>`
      )
    }
    if (sec.body) {
      for (const para of sec.body.split(/\n{2,}/)) {
        if (!para.trim()) continue
        parts.push(
          `<p style="font-size:14px;line-height:1.75;color:#374151;margin:0 0 12px;">${inlineHtml(para.replace(/\n/g, ' '))}</p>`
        )
      }
    }
    if (sec.bullets?.length) {
      parts.push('<ul style="margin:6px 0 12px;padding-left:4px;list-style:none;">')
      for (const b of sec.bullets) {
        parts.push(
          `<li style="display:flex;gap:9px;margin:6px 0;font-size:14px;line-height:1.65;color:#374151;">` +
            `<span style="color:${ACCENT};font-weight:800;flex-shrink:0;">•</span><span>${inlineHtml(b)}</span></li>`
        )
      }
      parts.push('</ul>')
    }
    if (sec.callout) {
      parts.push(
        `<div style="border-left:4px solid ${ACCENT};background:#eff6ff;border-radius:0 8px 8px 0;padding:12px 16px;margin:12px 0;font-size:14px;line-height:1.6;color:#1e3a8a;">${inlineHtml(sec.callout)}</div>`
      )
    }
    if (sec.chart?.points?.length) parts.push(chartHtml(sec.chart))
    parts.push('</div>')
  }

  // Sheets (tables) — for xlsx previews or tables inside a doc
  for (const sheet of spec.sheets || []) {
    parts.push('<div style="margin-top:18px;">')
    if (sheet.name) {
      parts.push(
        `<h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px;">${esc(sheet.name)}</h2>`
      )
    }
    parts.push(tableHtml(sheet.columns || [], sheet.rows || []))
    parts.push('</div>')
  }

  // Slides (deck) — rendered as numbered slide cards
  if (spec.slides?.length) {
    spec.slides.forEach((sl, i) => {
      parts.push(
        `<div style="margin-top:16px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">` +
          `<div style="background:linear-gradient(135deg,#eff6ff,#ffffff);padding:12px 16px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;gap:10px;">` +
          `<span style="font-size:11px;font-weight:800;color:#fff;background:${ACCENT};border-radius:6px;padding:2px 8px;">${i + 1}</span>` +
          `<span style="font-size:15px;font-weight:700;color:#0f172a;">${esc(sl.title || `Slide ${i + 1}`)}</span>` +
          `</div><div style="padding:14px 16px;">`
      )
      if (sl.body) parts.push(`<p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 10px;">${inlineHtml(sl.body)}</p>`)
      if (sl.bullets?.length) {
        parts.push('<ul style="margin:0;padding-left:4px;list-style:none;">')
        for (const b of sl.bullets)
          parts.push(
            `<li style="display:flex;gap:9px;margin:6px 0;font-size:14px;line-height:1.6;color:#374151;">` +
              `<span style="color:${ACCENT};font-weight:800;flex-shrink:0;">•</span><span>${inlineHtml(b)}</span></li>`
          )
        parts.push('</ul>')
      }
      parts.push('</div></div>')
    })
  }

  parts.push('</div>')
  return parts.join('')
}

// ── PDF (rendered from the shared HTML, with a logo footer per page) ──────────
const A4_W = 595.28
const A4_H = 841.89
const MARGIN_X = 48
const MARGIN_TOP = 48
const FOOTER_H = 44
const CONTENT_W = A4_W - MARGIN_X * 2
const USABLE_H = A4_H - MARGIN_TOP - FOOTER_H

async function downloadPdf(card: DocumentCard): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const html2canvas = (await import('html2canvas')).default
  const logo = await loadLogoDataUrl()

  const COL_W = 720
  const holder = document.createElement('div')
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${COL_W}px;background:#ffffff;padding:8px;z-index:-1;`
  holder.innerHTML = buildDocumentBodyHtml(card)
  document.body.appendChild(holder)
  try {
    const scale = 2
    const canvas = await html2canvas(holder, { scale, backgroundColor: '#ffffff', windowWidth: COL_W })
    const pxToPt = CONTENT_W / canvas.width
    const pxPerPage = Math.floor(USABLE_H / pxToPt)

    // Safe page-break points: never split a block across pages.
    const holderTop = holder.getBoundingClientRect().top
    const cutSet = new Set<number>([0])
    holder.querySelectorAll('h1,h2,h3,p,li,tr,table,div').forEach((el) => {
      const top = Math.round((el.getBoundingClientRect().top - holderTop) * scale)
      if (top > 0 && top < canvas.height) cutSet.add(top)
    })
    cutSet.add(canvas.height)
    const cuts = Array.from(cutSet).sort((a, b) => a - b)

    const slices: Array<[number, number]> = []
    let start = 0
    while (start < canvas.height - 1) {
      const maxEnd = start + pxPerPage
      const fit = cuts.filter((y) => y > start && y <= maxEnd)
      const end = fit.length ? fit[fit.length - 1] : Math.min(maxEnd, canvas.height)
      slices.push([start, end])
      start = end
    }

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    slices.forEach(([s, e], idx) => {
      if (idx > 0) pdf.addPage()
      const sliceH = e - s
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width
      tmp.height = sliceH
      const ctx = tmp.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, tmp.width, sliceH)
      ctx.drawImage(canvas, 0, s, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
      pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', MARGIN_X, MARGIN_TOP, CONTENT_W, sliceH * pxToPt)
      // Footer: divider + logo (logo only) bottom-left + page number bottom-right.
      pdf.setDrawColor(229, 231, 235)
      pdf.setLineWidth(0.7)
      pdf.line(MARGIN_X, A4_H - FOOTER_H + 8, A4_W - MARGIN_X, A4_H - FOOTER_H + 8)
      if (logo) {
        try {
          pdf.addImage(logo, 'PNG', MARGIN_X, A4_H - FOOTER_H + 14, 18, 18)
        } catch {
          /* ignore logo draw failure */
        }
      }
      pdf.setFontSize(8)
      pdf.setTextColor(156, 163, 175)
      pdf.text(`${idx + 1} / ${slices.length}`, A4_W - MARGIN_X, A4_H - FOOTER_H + 26, { align: 'right' })
    })
    pdf.save(fileNameFor(card.title, 'pdf'))
  } finally {
    document.body.removeChild(holder)
  }
}

// ── Word (.docx) ──────────────────────────────────────────────────────────────
async function downloadDocx(card: DocumentCard): Promise<void> {
  const docx = await import('docx')
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Footer, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
  } = docx
  const logoBytes = await loadLogoBytes()

  const children: any[] = []
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: card.title || 'Document', bold: true, size: 52, color: '0F172A' })],
    })
  )
  if (card.subtitle) {
    children.push(
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: card.subtitle, size: 24, color: '6B7280' })] })
    )
  }
  if (card.highlights?.length) {
    for (const h of card.highlights) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${h.value}  `, bold: true, size: 28, color: ACCENT_HEX }),
            new TextRun({ text: h.label + (h.sublabel ? ` — ${h.sublabel}` : ''), size: 20, color: '374151' }),
          ],
        })
      )
    }
    children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
  }

  const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' }
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }
  const addTable = (columns: string[], rows: Array<Array<string | number>>) => {
    const headerRow = new TableRow({
      tableHeader: true,
      children: columns.map(
        (c) =>
          new TableCell({
            borders, shading: { fill: ACCENT_HEX },
            children: [new Paragraph({ children: [new TextRun({ text: String(c), bold: true, color: 'FFFFFF' })] })],
          })
      ),
    })
    const bodyRows = rows.map(
      (r) =>
        new TableRow({
          children: columns.map(
            (_, ci) =>
              new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: String(r[ci] ?? '') })] })] })
          ),
        })
    )
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }))
    children.push(new Paragraph({ text: '', spacing: { after: 140 } }))
  }

  for (const sec of card.spec?.sections || []) {
    if (sec.heading)
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: sec.heading, bold: true, color: ACCENT_HEX })] })
      )
    if (sec.body)
      for (const para of sec.body.split(/\n{2,}/)) {
        if (!para.trim()) continue
        children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: para.replace(/\n/g, ' ') })] }))
      }
    for (const b of sec.bullets || [])
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b })] }))
    if (sec.callout)
      children.push(
        new Paragraph({ spacing: { before: 60, after: 140 }, shading: { fill: 'EFF6FF' }, children: [new TextRun({ text: sec.callout, italics: true, color: '1E3A8A' })] })
      )
    if (sec.chart?.points?.length)
      addTable(['Item', sec.chart.title || 'Value'], sec.chart.points.map((p) => [p.label, p.value]))
  }
  for (const sheet of card.spec?.sheets || []) {
    if (sheet.name)
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: sheet.name, bold: true })] }))
    addTable(sheet.columns || [], sheet.rows || [])
  }
  for (const sl of card.spec?.slides || []) {
    if (sl.title)
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: sl.title, bold: true, color: ACCENT_HEX })] }))
    if (sl.body) children.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: sl.body })] }))
    for (const b of sl.bullets || []) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b })] }))
  }

  void AlignmentType
  // Footer: logo only (centered).
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: logoBytes
          ? [new ImageRun({ type: 'png', data: logoBytes, transformation: { width: 16, height: 16 } })]
          : [new TextRun({ text: '' })],
      }),
    ],
  })

  const doc = new Document({ sections: [{ footers: { default: footer }, children }] })
  const blob = await Packer.toBlob(doc)
  saveBlob(blob, fileNameFor(card.title, 'docx'))
}

// ── Excel (.xlsx) ─────────────────────────────────────────────────────────────
async function downloadXlsx(card: DocumentCard): Promise<void> {
  const mod = await import('xlsx-js-style')
  const XLSX: any = (mod as any).default ?? mod
  const wb = XLSX.utils.book_new()

  let sheets = card.spec?.sheets || []
  if (!sheets.length && card.spec?.sections?.length) {
    const rows: Array<Array<string | number>> = []
    for (const s of card.spec.sections) {
      if (s.heading) rows.push([s.heading])
      if (s.body) rows.push([s.body])
      for (const b of s.bullets || []) rows.push([`• ${b}`])
    }
    sheets = [{ name: 'Content', columns: ['Content'], rows }]
  }

  sheets.forEach((sheet, idx) => {
    const ws = XLSX.utils.aoa_to_sheet([sheet.columns, ...sheet.rows])
    for (let c = 0; c < sheet.columns.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c })
      if (!ws[addr]) continue
      ws[addr].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: ACCENT_HEX } },
        alignment: { horizontal: 'center', vertical: 'center' },
      }
    }
    ws['!cols'] = sheet.columns.map((col, c) => {
      let max = String(col).length
      for (const r of sheet.rows) max = Math.max(max, String(r[c] ?? '').length)
      return { wch: Math.min(Math.max(max + 2, 10), 60) }
    })
    const name = (sheet.name || `Sheet${idx + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${idx + 1}`
    XLSX.utils.book_append_sheet(wb, ws, name)
  })
  if (!wb.SheetNames.length)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[card.title || 'Document']]), 'Sheet1')
  XLSX.writeFile(wb, fileNameFor(card.title, 'xlsx'))
}

// ── PowerPoint (.pptx) ────────────────────────────────────────────────────────
async function downloadPptx(card: DocumentCard): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const logo = await loadLogoDataUrl()
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  const W = 13.33
  const footerLogo = (s: any) => {
    if (logo) s.addImage({ data: logo, x: 0.5, y: 7.0, w: 0.32, h: 0.32 })
  }

  const title = pptx.addSlide()
  title.background = { color: 'F8FAFC' }
  title.addShape(pptx.ShapeType.rect, { x: 0.6, y: 2.0, w: 1.2, h: 0.09, fill: { color: ACCENT_HEX } })
  title.addText(card.title || 'Presentation', { x: 0.6, y: 2.2, w: W - 1.2, h: 1.3, fontSize: 40, bold: true, color: '0F172A' })
  if (card.subtitle) title.addText(card.subtitle, { x: 0.6, y: 3.5, w: W - 1.2, h: 0.8, fontSize: 18, color: '6B7280' })
  footerLogo(title)

  const slides = card.spec?.slides?.length
    ? card.spec.slides
    : (card.spec?.sections || []).map((s) => ({ title: s.heading, body: s.body, bullets: s.bullets }))

  for (const sl of slides) {
    const s = pptx.addSlide()
    s.background = { color: 'FFFFFF' }
    if (sl.title) {
      s.addText(sl.title, { x: 0.6, y: 0.4, w: W - 1.2, h: 0.9, fontSize: 26, bold: true, color: '0F172A' })
      s.addShape(pptx.ShapeType.line, { x: 0.6, y: 1.35, w: W - 1.2, h: 0, line: { color: ACCENT_HEX, width: 2 } })
    }
    let y = 1.7
    if (sl.body) {
      s.addText(sl.body, { x: 0.6, y, w: W - 1.2, h: 0.9, fontSize: 16, color: '374151' })
      y += 1.0
    }
    if (sl.bullets?.length) {
      s.addText(
        sl.bullets.map((b) => ({ text: b, options: { bullet: true, color: '374151', fontSize: 18, paraSpaceAfter: 8 } })),
        { x: 0.7, y, w: W - 1.4, h: 5.0 - y, valign: 'top' }
      )
    }
    footerLogo(s)
  }

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  saveBlob(blob, fileNameFor(card.title, 'pptx'))
}

/** Build and download the document described by `card`. */
export async function downloadDocument(card: DocumentCard): Promise<void> {
  switch (card.docType) {
    case 'docx':
      return downloadDocx(card)
    case 'xlsx':
      return downloadXlsx(card)
    case 'pptx':
      return downloadPptx(card)
    case 'pdf':
    default:
      return downloadPdf(card)
  }
}
