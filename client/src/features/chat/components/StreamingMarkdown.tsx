/**
 * StreamingMarkdown — per-block incremental markdown rendering for an answer.
 *
 * THE PROBLEM
 * A streaming answer grows a few characters per animation frame. Handing the
 * whole string to one <ReactMarkdown> re-parses the entire answer and reconciles
 * its entire element tree ~60 times a second. For a chart that is catastrophic:
 * Recharts rebuilds its SVG and ResponsiveContainer re-measures on every frame,
 * so the visual flashes and the whole chat lags.
 *
 * THE FIX
 * Markdown is block-structured. Split the text into top-level blocks (paragraph,
 * heading, list, table, fenced block) and render each one through its OWN
 * React.memo'd component. Blocks are append-only while streaming, so:
 *
 *   - a settled block never re-parses or re-renders again, ever
 *   - only the LAST block (the one being written) does work per frame
 *   - a chart mounts once and is then left completely alone
 *
 * The same structure is used for settled messages, so nothing re-mounts when
 * streaming finishes — no end-of-stream flash.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Temporarily balance markers so a PARTIAL block is still valid markdown. Without
 * this an unclosed ``` or ** makes the rest render as one giant code block or bold
 * run, which then collapses when the closing marker arrives.
 */
export function stabilizeStreamingMarkdown(text: string): string {
  if (!text) return text;
  let result = text;

  const fenceCount = (result.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    result += '\n```';
  } else {
    const inlineTicks = (result.match(/`/g) || []).length;
    if (inlineTicks % 2 === 1) result += '`';
  }

  const boldCount = (result.match(/\*\*/g) || []).length;
  if (boldCount % 2 === 1) result += '**';

  return result;
}

const isListLine = (l: string) => /^\s{0,3}([-*+]|\d+[.)])\s/.test(l);

/**
 * Split markdown into top-level blocks.
 *
 * Rules that matter:
 *  - A fenced block is always its own block, and blank lines INSIDE a fence never
 *    split it (chart/viz JSON is emitted as one fence).
 *  - A loose list (blank lines between items) is kept as ONE block, otherwise it
 *    would render as several separate lists and a numbered list would restart
 *    at 1 on every item.
 */
export function splitBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let cur: string[] = [];
  let inFence = false;

  const curIsList = () => {
    const first = cur.find(l => l.trim() !== '');
    return !!first && isListLine(first);
  };
  const flush = () => {
    if (cur.some(l => l.trim() !== '')) blocks.push(cur.join('\n'));
    cur = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      if (!inFence) {
        flush();
        inFence = true;
        cur.push(line);
      } else {
        cur.push(line);
        inFence = false;
        flush();
      }
      continue;
    }

    if (!inFence && line.trim() === '') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      const next = j < lines.length ? lines[j] : '';
      // Blank line inside a list is still the same list.
      if (curIsList() && next && isListLine(next)) {
        cur.push('');
        continue;
      }
      flush();
      continue;
    }

    cur.push(line);
  }
  flush();
  return blocks;
}

/**
 * One memoized markdown block. Re-renders ONLY when its own text changes, which
 * for every block except the last means never.
 */
const MarkdownBlock = React.memo(
  ({ text, components }: { text: string; components: any }) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  )
);
MarkdownBlock.displayName = 'MarkdownBlock';

export const StreamingMarkdown: React.FC<{
  text: string;
  /** True only while this message is actively streaming. */
  live: boolean;
  components: any;
}> = ({ text, live, components }) => {
  const blocks = React.useMemo(() => splitBlocks(text), [text]);
  const lastIndex = blocks.length - 1;

  return (
    <>
      {blocks.map((block, i) => (
        <MarkdownBlock
          // Index keys are correct here: blocks are append-only, so index i always
          // refers to the same block. That identity is what keeps a rendered chart
          // mounted instead of tearing it down on the next chunk.
          key={i}
          text={live && i === lastIndex ? stabilizeStreamingMarkdown(block) : block}
          components={components}
        />
      ))}
    </>
  );
};

export default StreamingMarkdown;
