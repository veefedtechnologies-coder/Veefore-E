// Perf harness: stream a realistic answer through the REAL renderer pipeline and
// measure what it actually costs. Driven by scripts/perf-stream.mjs (puppeteer +
// system Chrome). Not part of the app bundle.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StreamingMarkdown } from '../src/features/chat/components/StreamingMarkdown';
import { markdownComponents } from '../src/features/chat/components/markdownComponents';

const ANSWER = `Reels win on reach, carousels win on saves — weight your calendar to Reels and keep carousels for depth.

\`\`\`chart
{"type":"bar","title":"Typical performance at ~5k followers","subtitle":"Illustrative benchmarks","xKey":"name","series":[{"key":"reach","label":"Reach"},{"key":"saves","label":"Saves"}],"data":[{"name":"Reels","reach":9000,"saves":120},{"name":"Carousel","reach":3200,"saves":340},{"name":"Static","reach":1500,"saves":45}]}
\`\`\`

## Why format choice matters

Your audience looks for actionable home workouts, quick nutrition guides and relatable myths. Different formats serve entirely different stages of the viewer journey, so the right answer is a mix rather than a single winner.

| Format | Primary goal | Best used for | Priority |
| :--- | :--- | :--- | :--- |
| **Reels** | Discovery | 7-15s demos, habit tips | **High (60%)** |
| **Carousels** | Saves | Form breakdowns, diet charts | Medium (30%) |
| **Static** | Community | Milestones, quote cards | Low (10%) |

### Reels: your growth engine

Reels are pushed heavily to non-followers via Explore. Dedicate at least two of your three weekly slots to punchy Reels. Keep them under twelve seconds with clear text overlays.

### Carousels: your authority builder

When someone saves a post it is almost always a carousel with a five-day meal plan or a dumbbell-only routine. Make slide one a strong hook and slide five a clear call to action.

\`\`\`viz
{"type":"steps","title":"Recommended weekly split","items":[{"title":"Post 1 (Reel)","meta":"Discovery","detail":"Quick 10-second routine or exercise correction."},{"title":"Post 2 (Carousel)","meta":"Education","detail":"Step-by-step breakdown people will save."},{"title":"Post 3 (Reel)","meta":"Retention","detail":"Myth-buster with a strong opening line."}]}
\`\`\`

> Keep on-screen text concise and lean on audio trends that resonate with urban professionals.

## What to do next

- Batch-record three Reels in one sitting to protect your week.
- Audit your last four weeks and map engagement by format.
- Rewrite your bio so the niche is obvious in three seconds.
- Track saves as your primary carousel metric, not likes.

That gives you a repeatable cadence you can hold for a full quarter without burning out.`;

const COMMIT_INTERVAL_MS = 28;

function Harness() {
  const [shown, setShown] = React.useState(0);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const commits: number[] = [];
    const step = () => {
      const now = performance.now();
      if (now - last < COMMIT_INTERVAL_MS) {
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = now - last;
      last = now;
      commits.push({ dt, len: (window as any).__LEN || 0, charts: document.querySelectorAll('.recharts-wrapper').length, figures: document.querySelectorAll('figure').length });
      setShown(prev => {
        // Same cadence as the app: ~80cps baseline + 120% of backlog per second.
        const backlog = ANSWER.length - prev;
        if (backlog <= 0) return prev;
        const chars = Math.max(1, Math.ceil((80 + backlog * 1.2) * (dt / 1000)));
        const next = Math.min(ANSWER.length, prev + chars);
        if (next >= ANSWER.length) {
          (window as any).__COMMITS = commits;
          setTimeout(() => setDone(true), 200);
        }
        (window as any).__LEN = next;
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  React.useEffect(() => {
    if (done) (window as any).__DONE = true;
  }, [done]);

  return (
    <div className="markdown-content" style={{ maxWidth: 820, margin: '0 auto' }}>
      <StreamingMarkdown
        text={ANSWER.slice(0, shown)}
        live={!done}
        components={markdownComponents}
      />
    </div>
  );
}

// Long-task + frame observation.
(window as any).__LONGTASKS = [];
try {
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) (window as any).__LONGTASKS.push(e.duration);
  }).observe({ entryTypes: ['longtask'] });
} catch {
  /* not supported */
}

createRoot(document.getElementById('root')!).render(<Harness />);
