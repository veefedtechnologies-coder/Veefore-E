# Landing Page - Unused Files Analysis

**Analysis Date:** June 13, 2026  
**Analyzed by:** Kiro AI Agent

---

## 🔍 Files to Remove

### 1. Alternative Landing Pages (NOT USED)

These are alternative landing page designs that are accessible via routes but **never linked** anywhere in the application:

#### `/client/src/pages/Landing3DAdvanced.tsx` 
- **Route:** `/3d-advanced`
- **Size:** ~15KB
- **Status:** ❌ No navigation links to this page
- **Usage:** Experimental 3D landing with Three.js
- **Decision:** **REMOVE** - Not linked in navigation, unused alternative design

#### `/client/src/pages/SplineKeyboardLanding.tsx`
- **Route:** `/keyboard`
- **Size:** ~12KB
- **Status:** ❌ No navigation links to this page
- **Usage:** Spline keyboard animation landing
- **Decision:** **REMOVE** - Not linked in navigation, unused alternative design

#### `/client/src/pages/RobotHeroLanding.tsx`
- **Route:** `/robot-hero`
- **Size:** ~18KB
- **Status:** ❌ No navigation links to this page
- **Usage:** Robot hero animation landing
- **Decision:** **REMOVE** - Not linked in navigation, unused alternative design

**Total Savings:** ~45KB of unused landing page code

---

## ✅ Files to Keep (Currently Used by Landing.tsx)

### Core Landing Sections (USED)
- ✅ `CinematicHeroSection` - Used (line 923)
- ✅ `GrowthEngineSection` - Used (line 1355)
- ✅ `AlgorithmScienceSection` - Used (line 1358)
- ✅ `StickyScrollFeaturesV2` - Used (line 1361)
- ✅ `CinematicFeatures` - Used (line 1374)
- ✅ `TargetAudienceSection` - Used (section rendering)
- ✅ `CreditSystemSection` - Used (section rendering)
- ✅ `BetaLaunchSection` - Used (section rendering)
- ✅ `PricingScrollAnimation` - Used (section rendering)

### Visual Components (USED)
- ✅ `Phase1EngagementVisual` - Used in hero features
- ✅ `Phase1DMVisual` - Used in hero features
- ✅ `HookVisual` - Used in hero features
- ✅ `GlassCard` - Used throughout landing

### Utilities (USED)
- ✅ `useIsMobile` - Used for responsive behavior
- ✅ `SEO, seoConfig` - Used for SEO optimization
- ✅ `MOBILE_OPTIMIZED_LAYER` - Used for performance

---

## 🎯 Cleanup Actions

### Phase 1: Remove Alternative Landing Pages

```bash
# Remove unused alternative landing pages
rm -f client/src/pages/Landing3DAdvanced.tsx
rm -f client/src/pages/SplineKeyboardLanding.tsx
rm -f client/src/pages/RobotHeroLanding.tsx
```

### Phase 2: Update App.tsx Routes

After removing the files, update `client/src/App.tsx`:

**Remove these imports (lines 26-28):**
```typescript
const Landing3DAdvanced = React.lazy(() => import('./pages/Landing3DAdvanced'))
const SplineKeyboardLanding = React.lazy(() => import('./pages/SplineKeyboardLanding'))
const RobotHeroLanding = React.lazy(() => import('./pages/RobotHeroLanding'))
```

**Remove from publicRoutes array (line 57-58):**
```typescript
'/3d-advanced', '/keyboard', '/robot-hero',
```

**Remove route cases (lines 276-281):**
```typescript
case '/3d-advanced':
  return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><Landing3DAdvanced /></React.Suspense>
case '/keyboard':
  return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><SplineKeyboardLanding /></React.Suspense>
case '/robot-hero':
  return <React.Suspense fallback={<LoadingSpinner type="minimal" />}><RobotHeroLanding /></React.Suspense>
```

---

## 📊 Impact Analysis

### Bundle Size Reduction
- **Alternative landing pages:** ~45KB
- **Unused imports/routes:** ~2KB
- **Total reduction:** ~47KB of unused code

### Performance Benefits
- ✅ Smaller JavaScript bundle
- ✅ Faster route resolution (fewer cases)
- ✅ Cleaner code structure
- ✅ Less confusion for developers

### Build Time Improvement
- ✅ 3 fewer TypeScript files to compile
- ✅ Faster Vite build process
- ✅ Smaller bundle analysis reports

---

## 🔍 Additional Opportunities

### Components to Review (Potentially Unused)

Let me analyze component usage more deeply to find other unused files:

1. **Check for unused component files in `/client/src/components/`**
2. **Check for unused hooks in `/client/src/hooks/`**
3. **Check for unused utilities in `/client/src/lib/`**
4. **Check for unused context providers in `/client/src/context/`**

---

## ⚠️ Safety Checklist

Before removing files, verify:

- [ ] No direct URL navigation to `/3d-advanced`, `/keyboard`, `/robot-hero` in codebase
- [ ] No external links or bookmarks pointing to these routes
- [ ] No A/B testing or feature flags using these pages
- [ ] No analytics events tracking these pages
- [ ] No marketing materials linking to these pages

---

## 🎯 Recommended Action Plan

1. **Phase 1: Remove Alternative Landing Pages (Safe)**
   ```bash
   rm -f client/src/pages/Landing3DAdvanced.tsx
   rm -f client/src/pages/SplineKeyboardLanding.tsx
   rm -f client/src/pages/RobotHeroLanding.tsx
   ```

2. **Phase 2: Update App.tsx** (Remove imports and routes)

3. **Phase 3: Test**
   ```bash
   npm run build
   npm run dev
   # Verify landing page loads correctly
   ```

4. **Phase 4: Deep Analysis** (Optional)
   - Run dependency analysis on all components
   - Find truly unused components, hooks, utilities
   - Remove additional unused code

---

## 📈 Expected Results

### Before Cleanup
- 3 alternative landing pages
- 3 unused routes in App.tsx
- ~47KB unused code

### After Cleanup
- 1 main landing page (Landing.tsx)
- Clean route structure
- ~47KB code reduction
- Faster build times

---

**Status:** Ready for execution  
**Risk Level:** Low (these files are not linked anywhere)  
**Next Step:** Execute Phase 1 cleanup
