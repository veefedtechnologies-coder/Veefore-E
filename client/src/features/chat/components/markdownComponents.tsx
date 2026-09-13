/**
 * markdownComponents — the renderer set for every VeeGPT answer.
 *
 * Extracted from ChatInterface so it can be imported on its own: the chat tree
 * pulls in the whole page (react-query, routing, the composer), which made it
 * impossible to render or PROFILE the answer pipeline in isolation.
 */

import React from 'react';
import { AnswerChart, parseChartSpec } from './AnswerChart';
import { AnswerVisual, parseVizSpec } from './AnswerVisual';

export const markdownComponents: any = {
  h1: ({ children }: any) => (
    <h1 className="mt-5 mb-2 text-[21px] font-bold leading-snug tracking-tight text-black first:mt-0 dark:text-gray-50">
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="mt-5 mb-2 border-b border-gray-200 pb-1 text-[18px] font-bold leading-snug tracking-tight text-black first:mt-0 dark:border-white/10 dark:text-gray-50">
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="mt-4 mb-1.5 text-[16px] font-semibold leading-snug text-black first:mt-0 dark:text-gray-100">
      {children}
    </h3>
  ),
  h4: ({ children }: any) => (
    <h4 className="mt-3 mb-1 text-[15px] font-semibold leading-snug text-gray-800 first:mt-0 dark:text-gray-200">
      {children}
    </h4>
  ),
  p: ({ children }: any) => (
    <p className="mb-2.5 text-[15px] leading-[1.65] text-black last:mb-0 dark:text-gray-200">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-black dark:text-gray-50">{children}</strong>
  ),
  em: ({ children }: any) => <em className="italic">{children}</em>,
  a: ({ children, href }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 dark:text-blue-400"
    >
      {children}
    </a>
  ),
  ul: ({ children }: any) => (
    <ul className="mb-2.5 list-disc space-y-1 pl-5 marker:text-gray-400 dark:marker:text-gray-500">
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="mb-2.5 list-decimal space-y-1 pl-5 marker:font-medium marker:text-gray-400 dark:marker:text-gray-500">
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="pl-0.5 text-[15px] leading-[1.6] text-black dark:text-gray-200 [&>p]:mb-1 [&>ul]:mb-1 [&>ul]:mt-1 [&>ol]:mb-1 [&>ol]:mt-1">
      {children}
    </li>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="mb-3 rounded-r-lg border-l-4 border-blue-400 bg-blue-50 px-4 py-2 text-[15px] leading-[1.65] text-gray-700 dark:border-blue-500/60 dark:bg-blue-950/30 dark:text-gray-200 [&>p]:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-gray-200 dark:border-white/10" />,
  table: ({ children }: any) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead>{children}</thead>,
  th: ({ children }: any) => (
    <th className="border border-gray-200 bg-gray-50 px-3 py-1.5 text-left font-semibold text-black dark:border-white/10 dark:bg-slate-800 dark:text-gray-100">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="border border-gray-200 px-3 py-1.5 align-top text-black dark:border-white/10 dark:text-gray-200">
      {children}
    </td>
  ),
  code: ({ children, className }: any) =>
    // Fenced blocks arrive with a language class and are wrapped by <pre>.
    className ? (
      <code className={`${className} font-mono text-[13px]`}>{children}</code>
    ) : (
      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-black dark:bg-gray-800 dark:text-gray-100">
        {children}
      </code>
    ),
  // A ```chart fenced block carries JSON that we render as a REAL chart
  // (bar/line/area/pie) instead of showing raw code. Anything else renders as a
  // normal code block.
  pre: ({ children }: any) => {
    // ```chart → animated Recharts graph; ```viz → premium visual block.
    const chartNode = findFencedNode(children, 'chart');
    if (chartNode) {
      const raw = extractCodeText(chartNode?.props?.children);
      const spec = parseChartSpec(raw);
      if (spec) return <AnswerChart spec={spec} />;
      // Mid-stream the JSON is incomplete — hold reserved space rather than flash
      // raw text or collapse to nothing. Once it LOOKS complete but still won't
      // parse, show it: a silently swallowed block would make part of the answer
      // vanish with no trace.
      return looksComplete(raw) ? (
        <FallbackBlock raw={raw} />
      ) : (
        <VisualPlaceholder kind="chart" />
      );
    }
    const vizNode = findFencedNode(children, 'viz');
    if (vizNode) {
      const raw = extractCodeText(vizNode?.props?.children);
      const spec = parseVizSpec(raw);
      if (spec) return <AnswerVisual spec={spec} />;
      return looksComplete(raw) ? (
        <FallbackBlock raw={raw} />
      ) : (
        <VisualPlaceholder kind="viz" />
      );
    }
    return (
      <pre className="mb-3 overflow-x-auto rounded-lg bg-gray-100 p-3 text-[13px] leading-6 text-black dark:bg-gray-800 dark:text-gray-100">
        {children}
      </pre>
    );
  },
};

/** Does this fenced-block body look like finished JSON (vs. mid-stream)? */
export function looksComplete(raw: string): boolean {
  const t = (raw || '').trim();
  return t.length > 1 && /[}\]]$/.test(t);
}

/** Last-resort render for a chart/viz block we couldn't turn into a visual, so a
 *  malformed spec degrades to visible text instead of silently disappearing. */
const FallbackBlock: React.FC<{ raw: string }> = ({ raw }) => (
  <pre className="mb-3 overflow-x-auto rounded-lg bg-gray-100 p-3 text-[12px] leading-6 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
    {raw.trim()}
  </pre>
);

/**
 * Space held for a chart/viz whose JSON is still streaming in.
 *
 * The visuals are intentionally unanimated (an entrance animation replays on
 * every stream chunk and judders). Without a placeholder the finished card would
 * pop into existence and shove the text below it down. Reserving a card of
 * roughly the right height means the visual simply fills space that was already
 * there — a settled arrival with no motion at all.
 */
const VisualPlaceholder: React.FC<{ kind: 'chart' | 'viz' }> = ({ kind }) => (
  <div
    aria-hidden
    className="mb-4 mt-2 w-full rounded-2xl border border-gray-200/80 bg-gradient-to-b from-gray-50/60 to-white dark:border-white/10 dark:from-slate-800/40 dark:to-slate-900/40"
    style={{ height: kind === 'chart' ? 316 : 150 }}
  />
);

/** Find a fenced-code node with `language-<lang>` anywhere inside a <pre>. */
export function findFencedNode(node: any, lang: string): any | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findFencedNode(n, lang);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === 'object' && node.props) {
    const cls = String(node.props.className || '');
    if (new RegExp(`(^|\\s)language-${lang}(\\s|$)`).test(cls)) return node;
    return findFencedNode(node.props.children, lang);
  }
  return null;
}

/** Flatten a fenced code block's children back into its raw text. */
export function extractCodeText(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (typeof node === 'object' && node.props) return extractCodeText(node.props.children);
  return '';
}

/** Wrap every case-insensitive occurrence of `term` inside React children with a
 *  <mark> so "Search chats" can highlight just the matched word(s). Non-string
 *  children (already-rendered elements) are passed through untouched, so nested
 *  formatting (bold/links) still highlights via its own renderer. */
export function highlightChildren(children: React.ReactNode, term: string): React.ReactNode {
  if (!term) return children;
  const lowerTerm = term.toLowerCase();
  const walk = (node: React.ReactNode, keyPrefix: string): React.ReactNode => {
    if (typeof node === 'string') {
      const text = node;
      const lower = text.toLowerCase();
      if (!lower.includes(lowerTerm)) return text;
      const parts: React.ReactNode[] = [];
      let i = 0;
      let k = 0;
      while (i < text.length) {
        const idx = lower.indexOf(lowerTerm, i);
        if (idx === -1) {
          parts.push(text.slice(i));
          break;
        }
        if (idx > i) parts.push(text.slice(i, idx));
        parts.push(
          <mark key={`${keyPrefix}-${k++}`} className="veegpt-mark">
            {text.slice(idx, idx + term.length)}
          </mark>
        );
        i = idx + term.length;
      }
      return parts;
    }
    if (Array.isArray(node)) {
      return node.map((n, ix) => (
        <React.Fragment key={`${keyPrefix}-${ix}`}>{walk(n, `${keyPrefix}-${ix}`)}</React.Fragment>
      ));
    }
    return node;
  };
  return walk(children, 'hl');
}

/** Build markdown renderers that highlight `term`; falls back to the shared
 *  renderers when there's no term. */
export function buildHighlightComponents(term: string) {
  if (!term) return markdownComponents;
  const H = (children: any) => highlightChildren(children, term);
  // Reuse the shared renderers' styling and only wrap the text children so the
  // answer typography stays identical while the term gets highlighted.
  return {
    ...markdownComponents,
    h1: ({ children }: any) => markdownComponents.h1({ children: H(children) }),
    h2: ({ children }: any) => markdownComponents.h2({ children: H(children) }),
    h3: ({ children }: any) => markdownComponents.h3({ children: H(children) }),
    h4: ({ children }: any) => markdownComponents.h4({ children: H(children) }),
    p: ({ children }: any) => markdownComponents.p({ children: H(children) }),
    strong: ({ children }: any) => markdownComponents.strong({ children: H(children) }),
    em: ({ children }: any) => markdownComponents.em({ children: H(children) }),
    li: ({ children }: any) => markdownComponents.li({ children: H(children) }),
    blockquote: ({ children }: any) => markdownComponents.blockquote({ children: H(children) }),
    td: ({ children }: any) => markdownComponents.td({ children: H(children) }),
    th: ({ children }: any) => markdownComponents.th({ children: H(children) }),
    code: ({ children, className }: any) =>
      markdownComponents.code({ children: className ? children : H(children), className }),
  };
}
