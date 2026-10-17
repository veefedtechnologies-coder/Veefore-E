/**
 * DocumentViewer — an in-app viewer for a generated document (opened from a
 * `document` InfoCard). It overlays the chat column and renders the SAME premium
 * HTML the PDF export uses, so the user can read the whole document without
 * downloading. A Download button saves the real file (PDF/Word/Excel/PPT), and
 * the VeeFore logo (logo only) sits in the page footer.
 */

import React, { useMemo, useState } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import {
  buildDocumentBodyHtml,
  downloadDocument,
  type DocumentCard as DocumentCardSpec,
  type DocType,
} from './documentGenerators'
import type { InfoCardData } from './InfoCard'

const LOGO_SRC = '/veefore-logo.png'

const TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint',
}

function toSpec(card: InfoCardData): DocumentCardSpec {
  return {
    docType: (card.docType as DocType) || 'pdf',
    title: card.title,
    subtitle: (card as any).subtitle,
    summary: card.summary,
    highlights: (card as any).highlights,
    spec: card.spec,
  }
}

export const DocumentViewer: React.FC<{ card: InfoCardData; onClose: () => void }> = ({ card, onClose }) => {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const spec = useMemo(() => toSpec(card), [card])
  const html = useMemo(() => buildDocumentBodyHtml(spec), [spec])
  const label = TYPE_LABEL[spec.docType] || 'Document'

  const onDownload = async () => {
    setErr(false)
    setBusy(true)
    try {
      await downloadDocument(spec)
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2">
          <img src={LOGO_SRC} alt="VeeFore" className="h-5 w-5 shrink-0" />
          <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{card.title || 'Document'}</h2>
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDownload}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {busy ? 'Preparing…' : `Download ${spec.docType.toUpperCase()}`}
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body — a centered document "page" */}
      <div className="flex-1 overflow-y-auto bg-gray-100 px-4 py-6 dark:bg-slate-900">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 shadow-sm sm:p-10">
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {err && <p className="mt-4 text-sm text-red-500">Couldn’t generate the file. Please try again.</p>}
          {/* Footer — logo only */}
          <div className="mt-10 flex items-center justify-center border-t border-gray-200 pt-4">
            <img src={LOGO_SRC} alt="VeeFore" className="h-4 w-4 opacity-70" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default DocumentViewer
