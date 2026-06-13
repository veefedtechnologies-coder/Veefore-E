# Dashboard Scroll Disappearing/Flickering Fix

## Date: June 13, 2026

## Problem
The live dashboard preview section was disappearing when users scrolled up and reappearing when scrolling down, creating a flickering/fluctuation effect. This made the user experience jarring and unprofessional.

## Root Cause
The dashboard wrapper had a scroll-triggered reveal animation with these settings:
```tsx
<motion.div
  initial={{ opacity: 0, y: 160, scale: 0.95, rotateX: 5 }}
  whileInView={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
  viewport={{ once: false, amount: 0, margin: "0px 0px 300px 0px" }}
  // ... complex spring transitions
>
```

Key issues:
1. **`viewport={{ once: false }}`** - This made the animation re-trigger EVERY time the section entered/left the viewport
2. **`initial={{ opacity: 0 }}`** - This made the dashboard invisible when out of view
3. **Complex spring animations** - Added unnecessary delay and visual jarring

### Why This Happened
- When scrolling **down**: Dashboard enters viewport → animation triggers → fades in with spring motion
- When scrolling **up**: Dashboard leaves viewport → resets to `initial` state → becomes invisible
- When scrolling **back down**: Animation triggers again → dashboard reappears

This created a constant cycle of disappearing/reappearing that felt like flickering or fluctuation.

## Solution Applied
Removed the scroll reveal animation entirely and replaced `motion.div` with a regular `div`:

```tsx
{/* FIXED: Removed scroll reveal animation that caused dashboard to disappear/reappear */}
<div
  style={{ perspective: 1200, transformStyle: 'preserve-3d' }}
  className="relative w-full"
>
```

### What Was Changed
1. **Removed `motion.div`** → Changed to plain `div`
2. **Removed all animation props**:
   - `initial` - no longer starts hidden
   - `whileInView` - no longer animates on scroll
   - `viewport` - no longer tracks viewport intersection
   - `onViewportEnter` - removed haptic feedback
   - `transition` - removed complex spring animations
3. **Kept essential styles**:
   - `perspective: 1200` - maintains 3D context for child elements
   - `transformStyle: 'preserve-3d'` - preserves 3D transforms

## Result
✅ **Dashboard always visible** - no disappearing when scrolling  
✅ **No flickering** - stable, solid presence on page  
✅ **No fluctuation** - consistent display at all times  
✅ **Improved performance** - removed unnecessary animation calculations  
✅ **Better UX** - users can scroll freely without visual interruptions  

## Side Effects (Positive)
- **Faster page load** - one less animated component to initialize
- **Reduced motion** - better for users with motion sensitivity
- **More predictable** - dashboard is always where users expect it

## Files Modified
- `/client/src/pages/Landing.tsx` - Live Dashboard Preview Section (around line 1107)

## Testing Recommendations
1. Scroll up and down multiple times - verify dashboard stays visible
2. Test on mobile and desktop
3. Test in different browsers (Chrome, Safari, Firefox)
4. Verify no console errors
5. Check that TiltCard animation (desktop only) still works properly
6. Confirm floating badges still animate correctly

## Technical Notes
The dashboard itself (`AnimatedDashboard` component) still has internal animations for:
- Cursor movement simulation
- Page transitions within the dashboard
- Sidebar interactions

These internal animations are SEPARATE from the section wrapper and are unaffected by this change.

## Related Files
- `StaticDashboardPreview` - Mobile version (no animations by design)
- `AnimatedDashboard` - Desktop version (internal animations preserved)
- `TiltCard` - Wrapper component that adds 3D tilt effect on desktop

## Prevention
To avoid similar issues in the future:
- Use `viewport={{ once: true }}` for scroll reveals that should only trigger once
- Avoid `once: false` unless specifically needed for repeating animations
- Consider accessibility and motion sensitivity when adding scroll animations
- Test scroll behavior extensively, especially scroll-up scenarios
