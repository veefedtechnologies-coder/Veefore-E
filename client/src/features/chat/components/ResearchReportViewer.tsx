/**
 * ResearchReportViewer — the full-screen deep-research report.
 *
 * Opened from a `deep_research` InfoCard, it overlays the whole chat column
 * (the app sidebar stays visible) and renders the COMPLETE long-form report
 * (Markdown), plus every source. Users can download the report as PDF or Word
 * (.doc), branded with the VeeFore logo. A close button returns to the chat.
 */

import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, ExternalLink, TrendingUp, Search, Globe, Download, FileText, FileType2 } from 'lucide-react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import {
  Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx'
import type { InfoCardData } from './InfoCard'

// ── Build a single Markdown string for display + export ─────────────────────
function buildReportMarkdown(card: InfoCardData): string {
  if (card.reportMarkdown && card.reportMarkdown.trim()) return card.reportMarkdown.trim()
  let s = ''
  if (card.executiveSummary) s += `## Executive Summary\n\n${card.executiveSummary}\n\n`
  if (card.keyFindings?.length) s += `## Key Findings\n\n${card.keyFindings.map(k => `- ${k}`).join('\n')}\n\n`
  if (card.trends?.length)
    s += `## Trends\n\n${card.trends.map(t => `- **${t.topic}** (${t.status})${t.note ? ` — ${t.note}` : ''}`).join('\n')}\n\n`
  if (card.opportunities?.length) s += `## Opportunities\n\n${card.opportunities.map(o => `- ${o}`).join('\n')}\n\n`
  if (card.risks?.length) s += `## Risks\n\n${card.risks.map(r => `- ${r}`).join('\n')}\n\n`
  return s.trim()
}

// ── Markdown → clean HTML (shared by the PDF render and the Word export) ────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function inlineHtml(s: string): string {
  let t = esc(s)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1') // inline links → plain text (avoid noisy underlines)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  t = t.replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,Menlo,monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>')
  return t
}
const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
const isTableSep = (s: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(s || '')
function renderTable(header: string[], rows: string[][]): string {
  const th = header
    .map(h => `<th style="border:1px solid #d1d5db;background:#f8fafc;padding:6px 10px;text-align:left;font-weight:700;font-size:13px;color:#111827;">${inlineHtml(h)}</th>`)
    .join('')
  const trs = rows
    .map(r => `<tr>${r.map(c => `<td style="border:1px solid #e5e7eb;padding:6px 10px;font-size:13px;color:#374151;vertical-align:top;">${inlineHtml(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table style="border-collapse:collapse;width:100%;margin:14px 0;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  const hSize: Record<number, string> = { 1: '23px', 2: '18px', 3: '15.5px', 4: '13.5px', 5: '12.5px', 6: '12px' }
  const hTop: Record<number, string> = { 1: '20px', 2: '24px', 3: '18px', 4: '14px', 5: '12px', 6: '12px' }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()
    if (!line.trim()) { closeList(); continue }
    // Markdown table: a "| ... |" row immediately followed by a "|---|---|" separator.
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeList()
      const header = splitRow(line)
      i++ // skip separator
      const rows: string[][] = []
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && !isTableSep(lines[i + 1])) {
        i++
        rows.push(splitRow(lines[i]))
      }
      out.push(renderTable(header, rows))
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeList()
      const lvl = h[1].length
      out.push(
        `<h${lvl} style="font-size:${hSize[lvl]};font-weight:700;color:#111827;margin:${hTop[lvl]} 0 8px;line-height:1.3;${lvl === 2 ? 'border-bottom:1px solid #e5e7eb;padding-bottom:5px;' : ''}">${inlineHtml(h[2])}</h${lvl}>`,
      )
      continue
    }
    if (/^(\*\*\*|---|___)\s*$/.test(line)) { closeList(); out.push('<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>'); continue }
    const bq = line.match(/^>\s?(.*)$/)
    if (bq) { closeList(); out.push(`<blockquote style="border-left:4px solid #60a5fa;background:#eff6ff;margin:14px 0;padding:10px 16px;border-radius:0 6px 6px 0;color:#334155;font-size:14px;line-height:1.6;">${inlineHtml(bq[1])}</blockquote>`); continue }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul style="margin:8px 0 14px;padding-left:22px;">'); list = 'ul' }
      out.push(`<li style="margin:5px 0;line-height:1.6;color:#374151;font-size:14px;">${inlineHtml(ul[1])}</li>`)
      continue
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol style="margin:8px 0 14px;padding-left:22px;">'); list = 'ol' }
      out.push(`<li style="margin:5px 0;line-height:1.6;color:#374151;font-size:14px;">${inlineHtml(ol[1])}</li>`)
      continue
    }
    closeList()
    out.push(`<p style="margin:0 0 12px;line-height:1.7;color:#374151;font-size:14px;">${inlineHtml(line)}</p>`)
  }
  closeList()
  return out.join('\n')
}

/**
 * The "Veefore" wordmark: the cropped transparent V glyph followed by "eefore".
 * The glyph's bounding box is WIDE at the top and narrows to the V's point, so
 * even a pixel-tight crop leaves visual whitespace beside it. Like a real
 * logotype we KERN the text into that negative space so the "ee" tucks under the
 * V's right arm and the whole thing reads as one word.
 */
/** The pre-composed wordmark image, sized for the document header. */
function buildWordmarkHtml(wordmark: { dataUrl: string; width: number; height: number }): string {
  const H = 24
  const W = Math.round(H * (wordmark.width / wordmark.height))
  return `<img src="${wordmark.dataUrl}" width="${W}" height="${H}" style="display:block;width:${W}px;height:${H}px;"/>`
}

/** The branded letterhead strip (logo-as-"V" wordmark + "Research report · date"
 *  + divider). Shared by the PDF page and the Word first-page header image so
 *  both look identical and read as one word "VeeFore". */
function buildBrandStripHtml(logo: { dataUrl: string; width: number; height: number } | null, date: string): string {
  // The wordmark is pre-composed on canvas (V baseline-aligned with "eefore"),
  // so here it's just one image — no CSS baseline guesswork.
  const brand = logo ? buildWordmarkHtml(logo) : `<span style="font-size:25px;font-weight:800;color:#111827;">Veefore</span>`
  return (
    `<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #e5e7eb;padding-bottom:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">` +
    brand +
    `<span style="text-align:right;color:#9ca3af;font-size:10.5px;line-height:1.5;">Research report<br/>${date}</span>` +
    `</div>`
  )
}

function buildReportInnerHtml(
  card: InfoCardData,
  logo: { dataUrl: string; width: number; height: number } | null,
  mode: 'pdf' | 'word' = 'pdf',
): string {
  const body = markdownToHtml(buildReportMarkdown(card))
  const r = card.research
  const date = new Date().toLocaleDateString()
  const meta =
    r && (r.searches || r.sourceCount)
      ? `${r.searches ? `${r.searches} searches` : ''}${r.searches && r.sourceCount ? ' · ' : ''}${r.sourceCount ? `${r.sourceCount} sources read` : ''}`
      : ''
  const sources = card.citations?.length
    ? `<h2 style="font-size:18px;font-weight:700;color:#111827;margin:24px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:5px;">Sources (${card.citations.length})</h2>` +
      `<ol style="margin:8px 0;padding-left:22px;">${card.citations
        .map(c => `<li style="margin:4px 0;font-size:12.5px;line-height:1.5;"><a href="${esc(c.url)}" style="color:#2563eb;text-decoration:none;">${esc(c.title || c.domain || c.url)}</a>${c.domain ? ` <span style="color:#9ca3af;">· ${esc(c.domain)}</span>` : ''}</li>`)
        .join('')}</ol>`
    : ''

  // Word's HTML engine (Microsoft Word / Google Docs) has no flexbox support, so
  // the branded header is built with a table for Word; PDF (html2canvas) can use
  // flex. Both keep zero outer padding — page margins come from the exporter.
  const header = `<div style="margin-bottom:24px;">${buildBrandStripHtml(logo, date)}</div>`

  return (
    `<div style="font-family:${mode === 'word' ? 'Calibri,Arial,sans-serif' : "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"};color:#111827;background:#ffffff;">` +
    header +
    `<h1 style="font-size:25px;font-weight:800;color:#0f172a;margin:0 0 6px;line-height:1.25;">${esc(card.title || 'Research report')}</h1>` +
    (meta ? `<div style="color:#9ca3af;font-size:11.5px;margin-bottom:20px;">${meta}</div>` : '<div style="margin-bottom:8px;"></div>') +
    body +
    sources +
    `</div>`
  )
}

/** Transparent brand logo (the "V" glyph). 500x500 PNG with a real alpha channel. */
const LOGO_SRC = '/veefore_resized-logo.png'

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_SRC)
    const blob = await res.blob()
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onloadend = () => resolve(r.result as string)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function safeName(title: string): string {
  return (title || 'research-report').replace(/[^\w\d]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'research-report'
}

async function loadLogoBytes(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(LOGO_SRC)
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Draw the complete "Veefore" wordmark on a canvas using REAL font metrics, so
 * the V glyph's point sits exactly on the text baseline and its top matches the
 * cap height — i.e. the logo behaves like the capital letter "V" of the word.
 *
 * Doing this on canvas (instead of an <img> beside live text) is what finally
 * makes it pixel-exact: CSS/Word baseline alignment between an image and a text
 * run is approximate, canvas is not. Both the PDF and the Word file use this ONE
 * image, so the lockup is identical everywhere.
 */
let wordmarkPromise: Promise<{ dataUrl: string; width: number; height: number } | null> | null = null
function getWordmark(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (wordmarkPromise) return wordmarkPromise
  wordmarkPromise = (async () => {
    try {
      const glyph = await getTrimmedLogo()
      if (!glyph) return null
      const img = new Image()
      img.src = glyph.dataUrl
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('glyph decode failed'))
      })

      const FS = 96 // render large, then scale down on use → crisp at any size
      const FONT = `800 ${FS}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
      const TEXT = 'eefore'

      // Measure with a throwaway context.
      const probe = document.createElement('canvas').getContext('2d')!
      probe.font = FONT
      const capHeight = probe.measureText('E').actualBoundingBoxAscent // true cap height
      const tm = probe.measureText(TEXT)
      const textW = tm.width
      const textAscent = tm.actualBoundingBoxAscent
      const textDescent = Math.max(0, tm.actualBoundingBoxDescent)

      // The logo artwork includes an outer bracket around the V strokes, so the
      // VISIBLE V is smaller than the image box. Scale the glyph above cap height
      // so the V reads as a proper capital "V" next to "eefore".
      const V_SCALE = 1.3 // glyph height as a multiple of the font's cap height
      const KERN_RATIO = 0.08 // gentle tuck — enough to feel like one word, no stroke overlap
      const vH = capHeight * V_SCALE
      const vW = vH * (glyph.width / glyph.height)
      const kern = vW * KERN_RATIO

      const W = Math.ceil(vW - kern + textW)
      // Canvas must be tall enough for the (now taller) V as well as the text.
      const ascentTop = Math.max(vH, textAscent)
      const H = Math.ceil(ascentTop + textDescent)

      const SS = 3 // supersample
      const c = document.createElement('canvas')
      c.width = Math.ceil(W * SS)
      c.height = Math.ceil(H * SS)
      const ctx = c.getContext('2d')!
      ctx.scale(SS, SS)
      ctx.font = FONT // must be set AFTER sizing (resize resets state)
      ctx.textBaseline = 'alphabetic'
      ctx.imageSmoothingQuality = 'high'

      const baselineY = ascentTop
      // V: bottom point ON the baseline, top at cap height.
      ctx.drawImage(img, 0, baselineY - vH, vW, vH)
      // "eefore": same baseline, kerned into the V.
      ctx.fillStyle = '#111827'
      ctx.fillText(TEXT, vW - kern, baselineY)

      return { dataUrl: c.toDataURL('image/png'), width: W, height: H }
    } catch {
      return null
    }
  })()
  return wordmarkPromise
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || ''
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

// The raw logo PNG has whitespace padding around the "V" (and may have a white
// background), which prevents it sitting flush against "eeFore". We load it
// once, knock out near-white pixels to transparent, and CROP to the V's exact
// bounding box → a tight, transparent logo that tucks against the text so
// "VeeFore" reads as one word.

/** Aspect ratio (w/h) of the CROPPED glyph — used to size the wordmark image. */
let trimmedLogoAspect = 1
let trimmedLogoPromise: Promise<{ dataUrl: string; width: number; height: number } | null> | null = null
function getTrimmedLogo(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (trimmedLogoPromise) return trimmedLogoPromise
  trimmedLogoPromise = (async () => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = LOGO_SRC
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('logo load failed'))
      })
      const W = img.naturalWidth
      const H = img.naturalHeight
      const src = document.createElement('canvas')
      src.width = W
      src.height = H
      const sctx = src.getContext('2d')!
      sctx.drawImage(img, 0, 0)

      // Crop to the glyph's exact alpha bounding box (the asset is transparent,
      // so this removes ALL surrounding padding) → the V can sit flush against
      // the "eefore" text and read as one word.
      const data = sctx.getImageData(0, 0, W, H).data
      let minX = W, minY = H, maxX = -1, maxY = -1
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (data[(y * W + x) * 4 + 3] > 12) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX < minX || maxY < minY) {
        trimmedLogoAspect = W / H
        return { dataUrl: src.toDataURL('image/png'), width: W, height: H }
      }
      const cw = maxX - minX + 1
      const ch = maxY - minY + 1
      const out = document.createElement('canvas')
      out.width = cw
      out.height = ch
      out.getContext('2d')!.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch)
      trimmedLogoAspect = cw / ch
      return { dataUrl: out.toDataURL('image/png'), width: cw, height: ch }
    } catch {
      return null
    }
  })()
  return trimmedLogoPromise
}

// ── Markdown → docx (editable, styled to match the PDF) ─────────────────────
type MdBlock =
  | { t: 'h'; level: 1 | 2 | 3; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'hr' }
  | { t: 'table'; header: string[]; rows: string[][] }

function parseMdBlocks(md: string): MdBlock[] {
  const lines = md.replace(/\r/g, '').split('\n')
  const blocks: MdBlock[] = []
  let ul: string[] | null = null
  let ol: string[] | null = null
  const flush = () => {
    if (ul) { blocks.push({ t: 'ul', items: ul }); ul = null }
    if (ol) { blocks.push({ t: 'ol', items: ol }); ol = null }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd()
    if (!line.trim()) { flush(); continue }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush()
      const header = splitRow(line)
      i++
      const rows: string[][] = []
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && !isTableSep(lines[i + 1])) {
        i++
        rows.push(splitRow(lines[i]))
      }
      blocks.push({ t: 'table', header, rows })
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { flush(); blocks.push({ t: 'h', level: Math.min(h[1].length, 3) as 1 | 2 | 3, text: h[2] }); continue }
    if (/^(\*\*\*|---|___)\s*$/.test(line)) { flush(); blocks.push({ t: 'hr' }); continue }
    const bq = line.match(/^>\s?(.*)$/)
    if (bq) { flush(); blocks.push({ t: 'quote', text: bq[1] }); continue }
    const uli = line.match(/^\s*[-*+]\s+(.*)$/)
    if (uli) { if (ol) flush(); if (!ul) ul = []; ul.push(uli[1]); continue }
    const oli = line.match(/^\s*\d+\.\s+(.*)$/)
    if (oli) { if (ul) flush(); if (!ol) ol = []; ol.push(oli[1]); continue }
    flush()
    blocks.push({ t: 'p', text: line.trim() })
  }
  flush()
  return blocks
}

/** Inline markdown → docx TextRuns (bold/italic/code; inline links → plain). */
function mdRuns(text: string, base: { size?: number; color?: string; bold?: boolean } = {}): TextRun[] {
  const t = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  const runs: TextRun[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  const push = (s: string, extra: any = {}) => {
    if (s) runs.push(new TextRun({ text: s, size: base.size, color: base.color, bold: base.bold, ...extra }))
  }
  while ((m = re.exec(t)) !== null) {
    push(t.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) push(tok.slice(2, -2), { bold: true })
    else if (tok.startsWith('`')) push(tok.slice(1, -1), { font: 'Consolas' })
    else push(tok.slice(1, -1), { italics: true })
    last = m.index + tok.length
  }
  push(t.slice(last))
  return runs.length ? runs : [new TextRun({ text: '', size: base.size, color: base.color })]
}

// ── PDF export (branded, renders the styled report → crisp, well-formatted) ──
// We render the report to clean, self-contained styled HTML off-screen, capture
// it with html2canvas, and paginate it into a jsPDF. This guarantees proper
// headings/spacing/bold/lists (no manual text-layout quirks or letter-spacing).
// A4 page geometry (points) + uniform margins, shared by PDF and Word so the
// two outputs are pixel-identical.
const A4_W = 595.28
const A4_H = 841.89
const MARGIN_X = 50
const MARGIN_TOP = 48
const MARGIN_BOTTOM = 56
const CONTENT_W = A4_W - MARGIN_X * 2 // 495.28pt
const USABLE_H = A4_H - MARGIN_TOP - MARGIN_BOTTOM // 737.89pt

/**
 * Render the report to page images (the ONE source of truth for both PDF and
 * Word). We render the styled report HTML off-screen, capture it with
 * html2canvas, and slice it into A4-sized page images on safe block boundaries.
 */
async function renderReportPages(card: InfoCardData): Promise<{ images: string[]; heightsPt: number[] }> {
  const logo = await getWordmark()
  const COL_W = 700 // css px text column
  const holder = document.createElement('div')
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${COL_W}px;background:#ffffff;z-index:-1;`
  holder.innerHTML = buildReportInnerHtml(card, logo, 'pdf')
  document.body.appendChild(holder)
  try {
    const logoImg = holder.querySelector('img') as HTMLImageElement | null
    if (logoImg && !logoImg.complete) {
      await new Promise<void>(res => {
        logoImg.onload = () => res()
        logoImg.onerror = () => res()
      })
    }
    const scale = 2
    const canvas = await html2canvas(holder, { scale, backgroundColor: '#ffffff', windowWidth: COL_W })
    const pxToPt = CONTENT_W / canvas.width
    const pxPerPage = Math.floor(USABLE_H / pxToPt)

    // Safe cut points = the top edge of every block, so a paragraph / heading /
    // list-item / table row is never split across a page boundary.
    const holderTop = holder.getBoundingClientRect().top
    const cutSet = new Set<number>([0])
    holder.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,hr,tr,img,table').forEach(el => {
      const top = Math.round((el.getBoundingClientRect().top - holderTop) * scale)
      if (top > 0 && top < canvas.height) cutSet.add(top)
    })
    cutSet.add(canvas.height)
    const cuts = Array.from(cutSet).sort((a, b) => a - b)

    const slices: Array<[number, number]> = []
    let start = 0
    while (start < canvas.height - 1) {
      const maxEnd = start + pxPerPage
      const fit = cuts.filter(y => y > start && y <= maxEnd)
      const end = fit.length ? fit[fit.length - 1] : Math.min(maxEnd, canvas.height)
      slices.push([start, end])
      start = end
    }

    const images: string[] = []
    const heightsPt: number[] = []
    for (const [s, e] of slices) {
      const sliceH = e - s
      const tmp = document.createElement('canvas')
      tmp.width = canvas.width
      tmp.height = sliceH
      const ctx = tmp.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, tmp.width, sliceH)
      ctx.drawImage(canvas, 0, s, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
      images.push(tmp.toDataURL('image/jpeg', 0.95))
      heightsPt.push(sliceH * pxToPt)
    }
    return { images, heightsPt }
  } finally {
    document.body.removeChild(holder)
  }
}

// ── PDF export — page images placed with uniform margins + page numbers ─────
async function downloadPdf(card: InfoCardData) {
  const { images, heightsPt } = await renderReportPages(card)
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const total = images.length
  images.forEach((img, idx) => {
    if (idx > 0) pdf.addPage()
    pdf.addImage(img, 'JPEG', MARGIN_X, MARGIN_TOP, CONTENT_W, heightsPt[idx])
    pdf.setFontSize(8)
    pdf.setTextColor(150, 150, 150)
    pdf.text(`Page ${idx + 1} of ${total}`, A4_W / 2, A4_H - 26, { align: 'center' })
  })
  pdf.save(`${safeName(card.title || 'research-report')}.pdf`)
}

// ── Word (.docx) export — a REAL, editable Word document styled like the PDF ─
async function downloadWord(card: InfoCardData) {
  // The "Veefore" wordmark (kerned logo-V + "eefore") rendered exactly like the
  // PDF. Word can't kern an image against a text run, so the small wordmark is
  // one image — the report BODY below stays fully editable text.
  const wordmark = await getWordmark()
  const trimmed = wordmark ? null : await getTrimmedLogo()
  const logoBytes = wordmark
    ? dataUrlToBytes(wordmark.dataUrl)
    : trimmed
      ? dataUrlToBytes(trimmed.dataUrl)
      : await loadLogoBytes()
  const logoH = wordmark ? 22 : 26
  const logoW = wordmark
    ? Math.max(10, Math.round((wordmark.width / wordmark.height) * logoH))
    : trimmed
      ? Math.max(10, Math.round((trimmed.width / trimmed.height) * logoH))
      : 36
  const md = buildReportMarkdown(card)
  const blocks = parseMdBlocks(md)
  const date = new Date().toLocaleDateString()
  const children: Array<Paragraph | Table> = []

  // Branded letterhead as the FIRST body content (page 1 only — it doesn't
  // repeat, so no empty header space on later pages). The logo image is the "V"
  // of VeeFore, immediately followed by the "eeFore" run so it reads as one
  // word. This branding block is LOCKED via document protection below (a
  // sentinel marks where the editable region starts).
  children.push(
    new Paragraph({
      spacing: { after: 20 },
      children: [
        ...(logoBytes ? [new ImageRun({ type: 'png', data: logoBytes, transformation: { width: logoW, height: logoH } })] : []),
        // When the full wordmark image is used it already contains "eefore".
        ...(wordmark
          ? []
          : [new TextRun({ text: logoBytes ? 'eefore' : 'Veefore', bold: true, size: 32, color: '111827' })]),
      ],
    }),
  )
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Research report · ${date}`, size: 16, color: '9CA3AF' })],
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: 'E5E7EB', space: 6 } },
    }),
  )
  // Sentinel — post-processing replaces this with a <w:permStart> so everything
  // AFTER it (title + body) is editable while the branding above stays locked.
  children.push(new Paragraph({ children: [new TextRun({ text: 'PERMSTART_MARKER', size: 2, color: 'FFFFFF' })] }))

  // Title.
  children.push(
    new Paragraph({
      children: mdRuns(card.title || 'Research report', { size: 40, bold: true, color: '0F172A' }),
      spacing: { before: 160, after: 60 },
    }),
  )
  const r = card.research
  const meta =
    r && (r.searches || r.sourceCount)
      ? `${r.searches ? `${r.searches} searches` : ''}${r.searches && r.sourceCount ? ' · ' : ''}${r.sourceCount ? `${r.sourceCount} sources read` : ''}`
      : ''
  if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, size: 18, color: '9CA3AF' })], spacing: { after: 160 } }))

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB' }
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder }

  for (const b of blocks) {
    if (b.t === 'h') {
      const size = b.level === 1 ? 34 : b.level === 2 ? 28 : 24
      children.push(
        new Paragraph({
          children: mdRuns(b.text, { size, bold: true, color: b.level === 3 ? '1F2937' : '111827' }),
          spacing: { before: b.level === 3 ? 200 : 260, after: 90 },
          ...(b.level === 2
            ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB', space: 4 } } }
            : {}),
        }),
      )
    } else if (b.t === 'p') {
      children.push(new Paragraph({ children: mdRuns(b.text, { size: 22, color: '374151' }), spacing: { after: 140, line: 300 } }))
    } else if (b.t === 'ul') {
      b.items.forEach(it =>
        children.push(new Paragraph({ children: mdRuns(it, { size: 22, color: '374151' }), bullet: { level: 0 }, spacing: { after: 60, line: 290 } })),
      )
    } else if (b.t === 'ol') {
      b.items.forEach((it, i) =>
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `${i + 1}. `, size: 22, color: '374151', bold: true }), ...mdRuns(it, { size: 22, color: '374151' })],
            spacing: { after: 60, line: 290 },
            indent: { left: 360 },
          }),
        ),
      )
    } else if (b.t === 'quote') {
      children.push(
        new Paragraph({
          children: mdRuns(b.text, { size: 22, color: '334155' }),
          spacing: { before: 120, after: 160, line: 290 },
          indent: { left: 200, right: 200 },
          shading: { fill: 'EFF6FF' },
          border: { left: { style: BorderStyle.SINGLE, size: 24, color: '60A5FA', space: 12 } },
        }),
      )
    } else if (b.t === 'hr') {
      children.push(new Paragraph({ text: '', border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB', space: 2 } }, spacing: { before: 120, after: 120 } }))
    } else if (b.t === 'table') {
      const headerRow = new TableRow({
        tableHeader: true,
        children: b.header.map(
          h =>
            new TableCell({
              borders,
              shading: { fill: 'F8FAFC' },
              margins: { top: 60, bottom: 60, left: 90, right: 90 },
              children: [new Paragraph({ children: mdRuns(h, { size: 20, bold: true, color: '111827' }) })],
            }),
        ),
      })
      const bodyRows = b.rows.map(
        row =>
          new TableRow({
            children: row.map(
              c =>
                new TableCell({
                  borders,
                  margins: { top: 60, bottom: 60, left: 90, right: 90 },
                  children: [new Paragraph({ children: mdRuns(c, { size: 20, color: '374151' }) })],
                }),
            ),
          }),
      )
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }))
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
    }
  }

  // Sources.
  if (card.citations?.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Sources (${card.citations.length})`, size: 28, bold: true, color: '111827' })],
        spacing: { before: 260, after: 90 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB', space: 4 } },
      }),
    )
    card.citations.forEach((c, i) => {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: `${i + 1}. `, size: 20, color: '374151' }),
            new ExternalHyperlink({
              link: c.url,
              children: [new TextRun({ text: c.title || c.domain || c.url, size: 20, color: '2563EB', underline: {} })],
            }),
            ...(c.domain ? [new TextRun({ text: `  · ${c.domain}`, size: 18, color: '9CA3AF' })] : []),
          ],
        }),
      )
    })
  }

  const doc = new Document({
    sections: [
      {
        // Normal margins, no page header → no empty header space on later pages.
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        children,
      },
    ],
  })
  let blob = await Packer.toBlob(doc)
  // Lock the branding: enable Word document protection (read-only) and mark the
  // region AFTER the branding (the sentinel → permStart, to end of body →
  // permEnd) as editable for everyone. Result: the report body is fully
  // editable, but the VeeFore branding block cannot be edited or deleted.
  try {
    blob = await lockBrandingInDocx(blob)
  } catch {
    /* if post-processing fails, fall back to the unprotected doc */
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(card.title || 'research-report')}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Post-process the generated .docx to lock ONLY the branding block:
 *  - settings.xml → add <w:documentProtection edit="readOnly" enforcement="1">
 *  - document.xml → replace the sentinel paragraph with <w:permStart edGrp="everyone">
 *    and insert <w:permEnd> before the section properties, so everything from
 *    the sentinel to the end of the body is editable and the branding above is
 *    locked.
 */
async function lockBrandingInDocx(blob: Blob): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(blob)

  const settingsPath = 'word/settings.xml'
  let settings = await zip.file(settingsPath)?.async('string')
  if (settings && !/w:documentProtection/.test(settings)) {
    const prot = '<w:documentProtection w:edit="readOnly" w:enforcement="1"/>'
    if (/<w:settings\b[^>]*>/.test(settings)) settings = settings.replace(/(<w:settings\b[^>]*>)/, `$1${prot}`)
    zip.file(settingsPath, settings)
  }

  const docPath = 'word/document.xml'
  let docXml = await zip.file(docPath)?.async('string')
  if (docXml) {
    // Replace the whole sentinel paragraph with a permStart range marker.
    docXml = docXml.replace(
      /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?PERMSTART_MARKER[\s\S]*?<\/w:p>/,
      '<w:permStart w:id="1" w:edGrp="everyone"/>',
    )
    // Close the editable range right before the final section properties.
    if (/<w:sectPr\b/.test(docXml)) docXml = docXml.replace(/(<w:sectPr\b)/, '<w:permEnd w:id="1"/>$1')
    else docXml = docXml.replace(/(<\/w:body>)/, '<w:permEnd w:id="1"/>$1')
    zip.file(docPath, docXml)
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

const trendColor: Record<string, string> = {
  emerging: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  rising: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
  trending: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  saturated: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  declining: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

// Explicit, report-grade Markdown styling (proper heading sizes/weights, spaced
// paragraphs, styled lists/tables/quotes) so the report reads like a real
// ChatGPT/Claude report instead of flat same-size text.
const mdComponents = {
  h1: (p: any) => <h1 className="mt-8 mb-3 text-2xl font-bold text-gray-900 dark:text-gray-50 first:mt-0" {...p} />,
  h2: (p: any) => (
    <h2 className="mt-7 mb-3 border-b border-gray-200 pb-1.5 text-xl font-bold text-gray-900 dark:border-white/10 dark:text-gray-50 first:mt-0" {...p} />
  ),
  h3: (p: any) => <h3 className="mt-5 mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100" {...p} />,
  h4: (p: any) => <h4 className="mt-4 mb-1.5 text-base font-semibold text-gray-800 dark:text-gray-200" {...p} />,
  p: (p: any) => <p className="mb-4 text-[15px] leading-7 text-gray-700 dark:text-gray-300" {...p} />,
  ul: (p: any) => <ul className="mb-4 ml-1 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-gray-700 dark:text-gray-300 marker:text-gray-400" {...p} />,
  ol: (p: any) => <ol className="mb-4 ml-1 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-gray-700 dark:text-gray-300 marker:text-gray-400" {...p} />,
  li: (p: any) => <li className="pl-1" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-gray-900 dark:text-gray-100" {...p} />,
  em: (p: any) => <em className="italic" {...p} />,
  a: (p: any) => <a className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 dark:text-blue-400" target="_blank" rel="noopener noreferrer" {...p} />,
  blockquote: (p: any) => (
    <blockquote className="my-4 rounded-r-lg border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-[15px] leading-7 text-gray-700 dark:border-blue-500/60 dark:bg-blue-950/30 dark:text-gray-200" {...p} />
  ),
  hr: () => <hr className="my-6 border-gray-200 dark:border-white/10" />,
  code: (p: any) =>
    p.inline ? (
      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-gray-800 dark:bg-slate-800 dark:text-gray-200" {...p} />
    ) : (
      <code className="block overflow-x-auto rounded-lg bg-gray-100 p-3 font-mono text-[13px] text-gray-800 dark:bg-slate-800 dark:text-gray-200" {...p} />
    ),
  table: (p: any) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]" {...p} />
    </div>
  ),
  th: (p: any) => <th className="border border-gray-200 bg-gray-50 px-3 py-1.5 text-left font-semibold text-gray-800 dark:border-white/10 dark:bg-slate-800 dark:text-gray-200" {...p} />,
  td: (p: any) => <td className="border border-gray-200 px-3 py-1.5 text-gray-700 dark:border-white/10 dark:text-gray-300" {...p} />,
}

export const ResearchReportViewer: React.FC<{ card: InfoCardData; onClose: () => void }> = ({ card, onClose }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<'pdf' | 'word' | null>(null)
  const research = card.research
  const md = buildReportMarkdown(card)

  const run = async (kind: 'pdf' | 'word') => {
    setMenuOpen(false)
    setBusy(kind)
    try {
      if (kind === 'pdf') await downloadPdf(card)
      else await downloadWord(card)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Viewer header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/veefore-logo.png" alt="VeeFore" className="h-5 w-5 shrink-0" />
          <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {card.title || 'Research report'}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Download menu */}
          <div className="relative">
            {menuOpen && <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(false)} />}
            <button
              onClick={() => setMenuOpen(o => !o)}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{busy ? 'Preparing…' : 'Download'}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
                <button
                  onClick={() => run('pdf')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-700"
                >
                  <FileText className="h-4 w-4 text-red-500" /> PDF (.pdf)
                </button>
                <button
                  onClick={() => run('word')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-700"
                >
                  <FileType2 className="h-4 w-4 text-blue-500" /> Word (.docx)
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      {/* Scrollable report body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-6">
          {/* Research activity meta */}
          {research && (research.sourceCount || research.searches) ? (
            <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {research.searches ? (
                <span className="inline-flex items-center gap-1">
                  <Search className="h-3.5 w-3.5" /> {research.searches} {research.searches === 1 ? 'search' : 'searches'}
                </span>
              ) : null}
              {research.sourceCount ? (
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" /> {research.sourceCount} sources read
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Full report */}
          <div className="report-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{md}</ReactMarkdown>
          </div>

          {/* Trends (structured, if present and not already in the markdown) */}
          {!card.reportMarkdown && card.trends?.length ? (
            <section className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Trends</h3>
              <div className="space-y-2">
                {card.trends.map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${trendColor[t.status] || trendColor.trending}`}>{t.status}</span>
                    <span className="text-[15px] text-gray-800 dark:text-gray-200"><span className="font-medium">{t.topic}</span>{t.note ? ` — ${t.note}` : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Sources */}
          {card.citations?.length ? (
            <section className="mt-8 border-t border-gray-200 pt-5 dark:border-white/10">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                Sources ({card.citations.length})
              </h3>
              <div className="space-y-1.5">
                {card.citations.map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span className="w-5 shrink-0 text-right text-gray-400">{i + 1}.</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{c.title || c.domain || c.url}</span>
                    {c.domain && <span className="shrink-0 text-gray-400 dark:text-gray-500">· {c.domain}</span>}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default ResearchReportViewer
