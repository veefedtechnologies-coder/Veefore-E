---
inclusion: fileMatch
fileMatchPattern: 'mobile-native/**/*.tsx'
---

# Liquid Glass rules (mobile-native)

The app uses `@callstack/liquid-glass` (`LiquidGlassView`) for Apple-style
"liquid glass" surfaces (tab bar, composer, floating buttons, menus, drawer
pill). The native material has a hard constraint that, if violated, makes the
glass render **fully transparent** (no material) until a manual reload.

## The one rule that matters

**Never place a `LiquidGlassView` under an ancestor that manipulates `opacity`,
`scale`/`transform`, or forces offscreen compositing.** This is upstream bug
[callstack/liquid-glass#27](https://github.com/callstack/liquid-glass/issues/27).
When an ancestor's opacity/scale is animated (or set statically while the glass
is mounted), the glass initializes with no backdrop and stays flat. It does not
recover on its own — only a remount/refresh fixes it.

Concretely, this caused the "glass is transparent after switching mode or
reloading" bug: `ModeHost` used to hide the inactive mode root with
`opacity: 0`, so that mode's glass came back flat when it became active.

## Do

- **Hide/show surfaces with `display: 'none'` / layout**, not `opacity`.
  (`ModeHost` hides the inactive mode with `display: 'none'` — do not change
  this back to an opacity toggle.)
- **Let the `LiquidGlassView` BE the surface**: put content directly inside it
  (see `FloatingGlassButton`, `CustomTabBar`, the composer card). It rounds
  itself natively via `borderRadius`.
- Drive press feedback / reveals with **transform on a sibling**, or accept a
  brief remount, rather than animating opacity on a glass ancestor.
- For borders, overlay a `pointerEvents="none"` absolute-fill `View` (glass
  ignores its own `borderWidth`).

## Don't

- ❌ `opacity: 0` / animated `opacity` on any ancestor of a `LiquidGlassView`.
- ❌ Animated `scale`/`transform` on a glass ancestor (mutes the material).
- ❌ `overflow: 'hidden'` on an animated wrapper around glass (forces a masked,
  offscreen-composited layer that flattens the material).
- ❌ Wrapping glass in a `Modal` (a separate window has nothing to refract, so
  glass renders transparent there).

## Enforcement

`scripts/veegpt-release-guards.js` has a `glass-no-animated-opacity` guard that
fails CI if `ModeHost` reverts to hiding modes with `opacity`. It runs via
`npm run guard:veegpt` and inside `npm test`. If you add new full-screen glass
surfaces that can be shown/hidden, hide them with `display`, not opacity.
