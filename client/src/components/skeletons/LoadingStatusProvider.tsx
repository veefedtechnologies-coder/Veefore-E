/**
 * Loading status / accessibility context for the pixel-perfect skeleton
 * loading system.
 *
 * Multiple Component_Skeletons and a Page_Skeleton can be mounted on a page at
 * once. To avoid screen-reader flooding, this provider owns a single per-page
 * `aria-live="polite"` status region and the page-level `aria-busy` state, so
 * loading is announced exactly once in aggregate (R11.1, R11.5).
 *
 * It maintains a ref-counted set of active skeleton ids: each registration
 * increments the count for its id, each unregistration decrements it. The page
 * is "loading" while at least one registration is active. The polite status
 * shows "Loading…" while loading and is cleared within 500ms after the last
 * registration is removed (R11.4).
 *
 * See design.md → "Loading status / accessibility context" (section 4).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Text announced by the single polite live region while loading. */
const LOADING_STATUS_TEXT = 'Loading…';

/**
 * How long after the last skeleton unregisters before the polite status text
 * is cleared. Kept under the 500ms ceiling required by R11.4.
 */
const STATUS_CLEAR_DELAY_MS = 300;

/** Value exposed by the loading status context. */
export interface LoadingStatusContextValue {
  /** Register that some region of the page is loading; returns an unregister fn. */
  beginLoading(id: string): () => void;
  /** True while >=1 region is loading. Drives page-level aria-busy. */
  isPageLoading: boolean;
}

const LoadingStatusContext = createContext<LoadingStatusContextValue | null>(
  null,
);

interface LoadingStatusProviderProps {
  children: ReactNode;
}

/**
 * Provides the single aggregate loading status for a page.
 *
 * Renders the page content wrapper (with `aria-busy` reflecting whether any
 * region is loading) and exactly one `aria-live="polite"` status region.
 */
export function LoadingStatusProvider({
  children,
}: LoadingStatusProviderProps): JSX.Element {
  /**
   * Ref-counted set of active skeleton ids. Each id maps to the number of live
   * registrations for that id (the same id may register more than once). Held
   * in a ref so register/unregister never go stale across renders.
   */
  const countsRef = useRef<Map<string, number>>(new Map());

  /** Total number of active registrations across all ids. */
  const [activeCount, setActiveCount] = useState(0);

  /** Text currently shown in the polite live region (empty when cleared). */
  const [statusText, setStatusText] = useState('');

  /** Pending timeout id for clearing the status text after loading ends. */
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginLoading = useCallback((id: string): (() => void) => {
    const counts = countsRef.current;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    setActiveCount((c) => c + 1);

    let unregistered = false;
    return () => {
      // Guard against double-unregister so the count stays accurate.
      if (unregistered) return;
      unregistered = true;

      const current = counts.get(id) ?? 0;
      if (current <= 1) {
        counts.delete(id);
      } else {
        counts.set(id, current - 1);
      }
      setActiveCount((c) => Math.max(0, c - 1));
    };
  }, []);

  const isPageLoading = activeCount > 0;

  // Drive the single polite live region: announce immediately while loading,
  // clear within 500ms after the last registration is removed (R11.4).
  useEffect(() => {
    if (isPageLoading) {
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      setStatusText(LOADING_STATUS_TEXT);
      return;
    }

    clearTimerRef.current = setTimeout(() => {
      setStatusText('');
      clearTimerRef.current = null;
    }, STATUS_CLEAR_DELAY_MS);

    return () => {
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, [isPageLoading]);

  const value = useMemo<LoadingStatusContextValue>(
    () => ({ beginLoading, isPageLoading }),
    [beginLoading, isPageLoading],
  );

  return (
    <LoadingStatusContext.Provider value={value}>
      <div aria-busy={isPageLoading} style={{ display: 'contents' }}>
        {children}
      </div>
      {/* Exactly one aggregate polite live region per provider (R11.1, R11.5). */}
      <div
        aria-live="polite"
        role="status"
        className="sr-only"
        data-testid="loading-status-region"
      >
        {statusText}
      </div>
    </LoadingStatusContext.Provider>
  );
}

/**
 * Access the loading status context.
 *
 * @throws if used outside a {@link LoadingStatusProvider}.
 */
export function useLoadingStatus(): LoadingStatusContextValue {
  const context = useContext(LoadingStatusContext);
  if (context === null) {
    throw new Error(
      'useLoadingStatus must be used within a LoadingStatusProvider',
    );
  }
  return context;
}

/**
 * Registers loading on mount and unregisters on unmount while `active` is true.
 *
 * Page skeletons / Suspense fallbacks and component-level skeletons call this so
 * the shared provider can expose a single aggregate loading status (R11.5).
 */
export function useRegisterSkeleton(active: boolean): void {
  const { beginLoading } = useLoadingStatus();
  // Stable id per hook instance so re-renders don't churn registrations.
  const idRef = useRef<string>();
  if (idRef.current === undefined) {
    idRef.current = `skeleton-${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    if (!active) return;
    const unregister = beginLoading(idRef.current as string);
    return unregister;
  }, [active, beginLoading]);
}
