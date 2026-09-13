// Profile the answer-rendering pipeline in REAL Chrome.
//
// Bundles client/perf/entry.tsx, opens it in the installed Chrome via puppeteer,
// lets the harness stream a realistic answer at the app's cadence, and reports
// long tasks + frame pacing. Run: node scripts/perf-stream.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('client/package.json'));
const puppeteer = require('puppeteer-core');

const OUT = path.resolve('client/perf/build');
fs.mkdirSync(OUT, { recursive: true });

execFileSync(
  'npx',
  [
    'esbuild',
    'perf/entry.tsx',
    '--bundle',
    '--outfile=perf/build/bundle.js',
    '--jsx=automatic',
    '--define:process.env.NODE_ENV="production"',
    '--minify',
    '--log-level=error',
  ],
  { cwd: 'client', stdio: 'inherit' }
);

fs.writeFileSync(
  path.join(OUT, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font: 15px/1.65 -apple-system, system-ui, sans-serif; margin: 0; padding: 24px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 4px 10px; }
  pre { background: #f3f4f6; padding: 12px; overflow-x: auto; }
</style></head>
<body><div id="root"></div><script src="./bundle.js"></script></body></html>`
);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });
await page.goto('file://' + path.join(OUT, 'index.html'));

await page.waitForFunction('window.__DONE === true', { timeout: 60000 });

const result = await page.evaluate(() => {
  const commits = window.__COMMITS || [];
  const long = window.__LONGTASKS || [];
  const sum = a => a.reduce((x, y) => x + y, 0);
  const gaps = commits.map(c => c.dt);
  const sorted = [...gaps].sort((a, b) => a - b);
  const pct = p => sorted[Math.floor(sorted.length * p)] || 0;
  const worst = [...commits].sort((a, b) => b.dt - a.dt).slice(0, 6)
    .map(c => `${c.dt.toFixed(0)}ms @ len=${c.len} charts=${c.charts} figures=${c.figures}`);
  return {
    worstCommits: worst,
    commits: commits.length,
    medianGapMs: +pct(0.5).toFixed(1),
    p95GapMs: +pct(0.95).toFixed(1),
    worstGapMs: +Math.max(...gaps, 0).toFixed(1),
    droppedFrames: gaps.filter(g => g > 50).length,
    longTasks: long.length,
    longTaskTotalMs: +sum(long).toFixed(1),
    worstLongTaskMs: +Math.max(...long, 0).toFixed(1),
    chartsRendered: document.querySelectorAll('.recharts-wrapper').length,
    figures: document.querySelectorAll('figure').length,
  };
});

console.log('\n=== streaming render profile (real Chrome) ===');
for (const [k, v] of Object.entries(result)) {
  if (Array.isArray(v)) { console.log(`  ${k}:`); v.forEach(x => console.log(`    ${x}`)); }
  else console.log(`  ${k.padEnd(20)} ${v}`);
}
console.log(
  `\n  target: medianGap ~33ms, droppedFrames 0, worstLongTask < 50ms\n`
);

await browser.close();
