/**
 * VeeGPTTransition
 *
 * VeeGPT is presented as a *separate piece of software*: opening it hides the
 * main app sidebar and hands the whole viewport to VeeGPT; the VeeFore logo
 * inside VeeGPT brings the main app back.
 *
 * Instead of a full-screen "loading" cover, the transition animates the REAL
 * VeeGPT surface: it slides + scales in from the edge when you open it, and
 * slides back out when you return. There is no separate branded screen — the
 * motion happens on the actual UI.
 *
 * How it works:
 *  - `enterVeeGPT()` simply navigates to /veegpt. The route is wrapped in
 *    `VeeGPTRouteShell`, which plays the entrance animation on mount.
 *  - `exitVeeGPT()` asks the mounted `VeeGPTRouteShell` (which registered an
 *    exit runner) to play its slide-out animation FIRST, then navigates back to
 *    the main app — so you actually see VeeGPT leave.
 *
 * Uses framer-motion (already a project dependency).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { useLocation } from 'wouter';

interface VeeGPTTransitionContextValue {
  /** True when a real provider is mounted (vs. the inert default). */
  enabled: boolean;
  /** Navigate INTO VeeGPT (its route shell animates in on mount). */
  enterVeeGPT: (e?: unknown, to?: string) => void;
  /** Play VeeGPT's slide-out, then navigate back to the main app. */
  exitVeeGPT: (e?: unknown, to?: string) => void;
  /** Internal: the VeeGPT route shell registers its exit animation here. */
  registerExit: (fn: () => Promise<void>) => () => void;
}

const noop = () => {};

const VeeGPTTransitionContext = createContext<VeeGPTTransitionContextValue>({
  enabled: false,
  enterVeeGPT: noop,
  exitVeeGPT: noop,
  registerExit: () => noop,
});

export const useVeeGPTTransition = () => useContext(VeeGPTTransitionContext);

export const VeeGPTTransitionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [, setLocation] = useLocation();
  const exitRunnerRef = useRef<(() => Promise<void>) | null>(null);
  const busyRef = useRef(false);

  const registerExit = useCallback((fn: () => Promise<void>) => {
    exitRunnerRef.current = fn;
    return () => {
      if (exitRunnerRef.current === fn) exitRunnerRef.current = null;
    };
  }, []);

  const enterVeeGPT = useCallback(
    (_e?: unknown, to = '/veegpt') => {
      setLocation(to);
    },
    [setLocation]
  );

  const exitVeeGPT = useCallback(
    async (_e?: unknown, to = '/') => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        if (exitRunnerRef.current) {
          await exitRunnerRef.current();
        }
      } finally {
        setLocation(to);
        busyRef.current = false;
      }
    },
    [setLocation]
  );

  const value = useMemo<VeeGPTTransitionContextValue>(
    () => ({ enabled: true, enterVeeGPT, exitVeeGPT, registerExit }),
    [enterVeeGPT, exitVeeGPT, registerExit]
  );

  return (
    <VeeGPTTransitionContext.Provider value={value}>
      {children}
    </VeeGPTTransitionContext.Provider>
  );
};

/**
 * Wraps the /veegpt route content. Plays a slide + scale + fade entrance on
 * mount and registers a matching exit animation so returning to the app shows
 * VeeGPT leaving.
 */
export const VeeGPTRouteShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const controls = useAnimationControls();
  const fxControls = useAnimationControls();
  const sheenControls = useAnimationControls();
  const [showFx, setShowFx] = useState(true);
  const { registerExit } = useVeeGPTTransition();

  useEffect(() => {
    let cancelled = false;

    // Entrance: a slow, eased slide-in from the right with a soft scale + fade.
    controls.set({ opacity: 0, x: '6%', scale: 0.97 });
    void controls.start({
      opacity: 1,
      x: '0%',
      scale: 1,
      transition: { duration: 0.78, ease: [0.16, 1, 0.3, 1] },
    });

    // Decorative one-shot visuals that ride along with the slide-in:
    //  1) a soft brand-colored glow that blooms then fades
    //  2) a light "sheen" band that sweeps across the surface once
    setShowFx(true);
    fxControls.set({ opacity: 0 });
    sheenControls.set({ x: '-40%', opacity: 0 });
    void (async () => {
      await Promise.all([
        fxControls.start({
          opacity: [0, 1, 0],
          transition: { duration: 1.1, ease: 'easeInOut', times: [0, 0.4, 1] },
        }),
        sheenControls.start({
          x: ['-40%', '140%'],
          opacity: [0, 0.9, 0],
          transition: { duration: 1.0, ease: [0.16, 1, 0.3, 1], times: [0, 0.5, 1] },
        }),
      ]);
      if (!cancelled) setShowFx(false);
    })();

    // Exit runner (invoked by exitVeeGPT before it navigates away).
    const unregister = registerExit(async () => {
      if (cancelled) return;
      await controls.start({
        opacity: 0,
        x: '6%',
        scale: 0.97,
        transition: { duration: 0.5, ease: [0.7, 0, 0.84, 0] },
      });
    });

    return () => {
      cancelled = true;
      unregister();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div animate={controls} className="relative h-full w-full overflow-hidden will-change-transform">
      {children}

      {/* One-shot transition visuals — decorative, non-blocking, theme-aware. */}
      {showFx && (
        <>
          {/* Brand glow bloom */}
          <motion.div
            aria-hidden
            animate={fxControls}
            className="pointer-events-none absolute inset-0 z-30"
            style={{
              background:
                'radial-gradient(70% 60% at 50% 45%, rgba(59,130,246,0.16), transparent 65%)',
            }}
          />
          {/* Sweeping light sheen */}
          <motion.div
            aria-hidden
            animate={sheenControls}
            className="pointer-events-none absolute inset-y-0 z-30 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10"
          />
        </>
      )}
    </motion.div>
  );
};

export default VeeGPTTransitionProvider;
