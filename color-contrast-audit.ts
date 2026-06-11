/**
 * Color Contrast Audit Script
 * 
 * This script calculates WCAG AA contrast ratios for text elements
 * in the landing page sections.
 * 
 * WCAG AA Requirements:
 * - Normal text (< 18pt or < 14pt bold): 4.5:1 minimum
 * - Large text (≥ 18pt or ≥ 14pt bold): 3:1 minimum
 */

interface ColorPair {
  foreground: string;
  background: string;
  location: string;
  textSize: 'normal' | 'large';
  element: string;
}

// Convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Parse rgba string to RGB
function rgbaToRgb(rgba: string): { r: number; g: number; b: number; a: number } | null {
  const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;
  return {
    r: parseInt(match[1]),
    g: parseInt(match[2]),
    b: parseInt(match[3]),
    a: match[4] ? parseFloat(match[4]) : 1
  };
}

// Calculate relative luminance
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Calculate contrast ratio
function getContrastRatio(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }): number {
  const l1 = getLuminance(fg.r, fg.g, fg.b);
  const l2 = getLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Apply alpha blending to foreground on background
function applyAlpha(fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const alpha = fg.a;
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha))
  };
}

// Color pairs to audit
const colorPairs: ColorPair[] = [
  // FloatingStatusBadge
  {
    foreground: 'rgba(147, 197, 253, 1)', // text-blue-300
    background: 'rgba(0, 0, 0, 0.6)', // bg-black/60
    location: 'FloatingStatusBadge - Blue Badge Text',
    textSize: 'normal', // text-xs = 12px
    element: 'Badge text'
  },
  {
    foreground: 'rgba(134, 239, 172, 1)', // text-green-300
    background: 'rgba(0, 0, 0, 0.6)', // bg-black/60
    location: 'FloatingStatusBadge - Green Badge Text',
    textSize: 'normal',
    element: 'Badge text'
  },
  {
    foreground: 'rgba(216, 180, 254, 1)', // text-purple-300
    background: 'rgba(0, 0, 0, 0.6)', // bg-black/60
    location: 'FloatingStatusBadge - Purple Badge Text',
    textSize: 'normal',
    element: 'Badge text'
  },
  
  // GrowthEngineSection - Feature Cards
  {
    foreground: 'rgba(255, 255, 255, 1)', // text-white
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'GrowthEngineSection - Feature Card Title',
    textSize: 'large', // text-lg = 18px
    element: 'Feature card h3'
  },
  {
    foreground: 'rgba(156, 163, 175, 1)', // text-gray-400 (FIXED from text-gray-500)
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'GrowthEngineSection - Feature Card Description',
    textSize: 'normal', // text-sm = 14px
    element: 'Feature card p'
  },
  {
    foreground: 'rgba(147, 197, 253, 1)', // text-blue-400/cyan-400
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'GrowthEngineSection - Feature Card Icon (Blue)',
    textSize: 'normal',
    element: 'Icon color'
  },
  
  // GrowthEngineSection - Center Orb
  {
    foreground: 'rgba(165, 180, 252, 1)', // text-indigo-300
    background: 'rgba(0, 0, 0, 0.8)', // bg-black/80
    location: 'GrowthEngineSection - Center Orb Label',
    textSize: 'normal', // text-[6px] sm:text-[7px] lg:text-[8px]
    element: 'Central Intelligence label'
  },
  {
    foreground: 'rgba(255, 255, 255, 1)', // text-white
    background: 'rgba(0, 0, 0, 0.8)', // bg-black/80
    location: 'GrowthEngineSection - Center Orb Title',
    textSize: 'normal', // text-[10px] sm:text-xs lg:text-sm
    element: 'Adaptive Growth Loop text'
  },
  
  // GrowthEngineSection - Status Bar
  {
    foreground: 'rgba(74, 222, 128, 1)', // text-green-400
    background: 'rgba(0, 0, 0, 0.4)', // bg-black/40
    location: 'GrowthEngineSection - Status Bar Online Text',
    textSize: 'normal', // text-[10px] sm:text-xs
    element: 'System Online label'
  },
  {
    foreground: 'rgba(255, 255, 255, 1)', // text-white
    background: 'rgba(0, 0, 0, 0.4)', // bg-black/40
    location: 'GrowthEngineSection - Status Bar Title',
    textSize: 'normal', // text-sm sm:text-base md:text-lg
    element: 'Continuous Optimization Active'
  },
  {
    foreground: 'rgba(156, 163, 175, 1)', // text-gray-400
    background: 'rgba(255, 255, 255, 0.05)', // bg-white/5
    location: 'GrowthEngineSection - Status Bar Steps',
    textSize: 'normal', // text-[8px] sm:text-[10px] md:text-xs
    element: 'POST/DATA/ANALYZE/REFINE/IMPROVE'
  },
  
  // AnimatedDashboard - Dashboard Stats
  {
    foreground: 'rgba(255, 255, 255, 0.6)', // text-white/60 (FIXED from text-white/40)
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'AnimatedDashboard - Stat Label',
    textSize: 'normal', // text-[10px]
    element: 'Total Engagements label'
  },
  {
    foreground: 'rgba(255, 255, 255, 1)', // text-white
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'AnimatedDashboard - Stat Value',
    textSize: 'large', // text-xl = 20px
    element: '24,847 value'
  },
  {
    foreground: 'rgba(96, 165, 250, 1)', // text-blue-400
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'AnimatedDashboard - Stat Change',
    textSize: 'normal', // text-xs
    element: '+18% change indicator'
  },
  {
    foreground: 'rgba(255, 255, 255, 0.6)', // text-white/60
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'AnimatedDashboard - Activity Text',
    textSize: 'normal', // text-xs
    element: 'Recent AI Activity items'
  },
  {
    foreground: 'rgba(255, 255, 255, 0.5)', // text-white/50 (FIXED from text-white/30)
    background: 'rgba(255, 255, 255, 0.02)', // bg-white/[0.02] on black
    location: 'AnimatedDashboard - Activity Time',
    textSize: 'normal', // text-[10px]
    element: '2m ago timestamp'
  }
];

// Audit results
console.log('='.repeat(80));
console.log('COLOR CONTRAST AUDIT - WCAG AA Compliance');
console.log('='.repeat(80));
console.log();

const failures: typeof colorPairs = [];
const warnings: typeof colorPairs = [];

colorPairs.forEach((pair, index) => {
  console.log(`${index + 1}. ${pair.location}`);
  console.log(`   Element: ${pair.element}`);
  console.log(`   Text Size: ${pair.textSize}`);
  
  let fgRgb = rgbaToRgb(pair.foreground);
  const bgRgba = rgbaToRgb(pair.background);
  
  if (!fgRgb || !bgRgba) {
    console.log('   ❌ ERROR: Could not parse colors');
    console.log();
    return;
  }
  
  // Apply alpha blending for semi-transparent backgrounds on black
  const black = { r: 0, g: 0, b: 0 };
  const effectiveBg = applyAlpha(bgRgba, black);
  
  // If foreground has alpha, apply it to background
  if (fgRgb.a && fgRgb.a < 1) {
    fgRgb = applyAlpha(fgRgb as any, effectiveBg);
  }
  
  const ratio = getContrastRatio(fgRgb, effectiveBg);
  const required = pair.textSize === 'normal' ? 4.5 : 3.0;
  const passes = ratio >= required;
  
  console.log(`   Foreground: ${pair.foreground}`);
  console.log(`   Background: ${pair.background} (effective: rgb(${effectiveBg.r}, ${effectiveBg.g}, ${effectiveBg.b}))`);
  console.log(`   Contrast Ratio: ${ratio.toFixed(2)}:1`);
  console.log(`   Required: ${required}:1 (${pair.textSize} text)`);
  console.log(`   ${passes ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!passes) {
    failures.push(pair);
  } else if (ratio < required + 0.5) {
    warnings.push(pair);
  }
  
  console.log();
});

// Summary
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log();
console.log(`Total elements audited: ${colorPairs.length}`);
console.log(`✅ Passing: ${colorPairs.length - failures.length}`);
console.log(`❌ Failing: ${failures.length}`);
console.log(`⚠️  Close to threshold: ${warnings.length}`);
console.log();

if (failures.length > 0) {
  console.log('FAILURES:');
  failures.forEach((pair, i) => {
    console.log(`${i + 1}. ${pair.location} - ${pair.element}`);
  });
  console.log();
}

if (warnings.length > 0) {
  console.log('WARNINGS (passing but close to threshold):');
  warnings.forEach((pair, i) => {
    console.log(`${i + 1}. ${pair.location} - ${pair.element}`);
  });
  console.log();
}

export { colorPairs, getContrastRatio, hexToRgb, rgbaToRgb, applyAlpha, getLuminance };
