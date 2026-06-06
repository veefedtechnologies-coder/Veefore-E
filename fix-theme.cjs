const fs = require('fs');

let content = fs.readFileSync('client/src/pages/SocialListeningPage.tsx', 'utf8');

// Root
content = content.replace('bg-[#030712]', 'bg-slate-50 dark:bg-[#030712]');
content = content.replace('text-slate-50 font-sans', 'text-slate-900 dark:text-slate-50 font-sans');

// Cards
content = content.replace(/bg-slate-900\/40/g, 'bg-white dark:bg-slate-900/40');
content = content.replace(/border-slate-800\/50/g, 'border-slate-200 dark:border-slate-800/50');
content = content.replace(/hover:bg-slate-900\/60/g, 'hover:bg-slate-50 dark:hover:bg-slate-900/60');
content = content.replace(/bg-slate-900\/50/g, 'bg-slate-50 dark:bg-slate-900/50');
content = content.replace(/border-slate-800/g, 'border-slate-200 dark:border-slate-800');

// Text Colors
content = content.replace(/text-slate-400/g, 'text-slate-500 dark:text-slate-400');
content = content.replace(/text-white/g, 'text-slate-900 dark:text-white');
content = content.replace(/text-slate-200/g, 'text-slate-700 dark:text-slate-200');
content = content.replace(/text-slate-300/g, 'text-slate-600 dark:text-slate-300');

// Chat UI
content = content.replace(/bg-slate-800/g, 'bg-slate-100 dark:bg-slate-800');
content = content.replace(/border-slate-700/g, 'border-slate-200 dark:border-slate-700');
content = content.replace(/bg-slate-950\/50/g, 'bg-white/80 dark:bg-slate-950/50');
content = content.replace(/text-slate-100/g, 'text-slate-900 dark:text-slate-100');

// Specific elements
content = content.replace(/bg-slate-800\/50/g, 'bg-slate-50 dark:bg-slate-800/50');
content = content.replace(/bg-slate-800\/30/g, 'bg-slate-50/50 dark:bg-slate-800/30');

// Charts
content = content.replace(/stroke="#334155"/g, 'stroke="currentColor" className="text-slate-200 dark:text-slate-700"');
content = content.replace(/fill: '#64748b'/g, "fill: 'currentColor', className: 'text-slate-500 dark:text-slate-400'");

fs.writeFileSync('client/src/pages/SocialListeningPage.tsx', content);
console.log('Fixed theme classes!');
