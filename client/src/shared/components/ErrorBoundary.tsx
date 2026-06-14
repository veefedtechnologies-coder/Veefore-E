/**
 * ErrorBoundary - Shared Client-Side Error Boundary Component
 *
 * A React class component that catches rendering errors in child components,
 * displays a helpful fallback UI, and logs errors to the console and any
 * configured logging service.
 *
 * Requirements: 15.5
 *
 * @example
 * // Wrap any route or section with ErrorBoundary
 * <ErrorBoundary>
 *   <MyPage />
 * </ErrorBoundary>
 *
 * @example
 * // Provide a custom fallback UI
 * <ErrorBoundary fallback={<p>Something went wrong in this section.</p>}>
 *   <MyWidget />
 * </ErrorBoundary>
 */

import React from 'react'

// ============================================================================
// Type Definitions
// ============================================================================

/** Subset of React.ErrorInfo that we surface publicly */
export interface ErrorDetails {
  /** Component stack trace at the time the error was caught */
  componentStack: string
}

/** Optional logging service interface for external error reporting */
export interface LoggingService {
  /**
   * Report a caught error to the logging service.
   * @param error - The error that was thrown
   * @param details - Additional error context including component stack
   */
  captureError(error: Error, details: ErrorDetails): void
}

/** Props accepted by ErrorBoundary */
export interface ErrorBoundaryProps {
  /** The children to render; errors thrown here will be caught */
  children: React.ReactNode
  /**
   * Optional custom fallback UI to render instead of the default error screen.
   * When provided, this takes full precedence over the built-in fallback.
   */
  fallback?: React.ReactNode
  /**
   * Optional callback invoked when an error is caught.
   * Useful for integrating with external monitoring (e.g. Sentry, Datadog).
   */
  onError?: (error: Error, details: ErrorDetails) => void
  /**
   * Optional logging service instance that will receive captured errors.
   * If omitted, errors are only logged to the console.
   */
  loggingService?: LoggingService
  /**
   * Human-readable label for the boundary, used in default error messages.
   * @default 'This section'
   */
  boundaryName?: string
}

/** Internal component state */
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorDetails: ErrorDetails | null
}

// ============================================================================
// ErrorBoundary Component
// ============================================================================

/**
 * React class component that catches rendering errors anywhere in its child
 * component tree, logs the error, and renders a fallback UI in place of the
 * crashed subtree.
 *
 * Implements Requirement 15.5 – consistent client-side error boundary
 * components in React.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorDetails: null,
    }
  }

  /**
   * Static lifecycle method called when an error is thrown during rendering.
   * Returns a state update that switches the boundary into error mode.
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  /**
   * Lifecycle method called after an error is caught.
   * Handles logging to console, the optional onError callback, the optional
   * loggingService, and the Sentry global (if present on window).
   */
  componentDidCatch(error: Error, reactErrorInfo: React.ErrorInfo): void {
    const details: ErrorDetails = {
      componentStack: reactErrorInfo.componentStack ?? '',
    }

    // Persist error details in state for the dev-mode detail panel
    this.setState({ errorDetails: details })

    // 1. Always log to console for developer visibility
    console.error(
      '[ErrorBoundary] Caught unhandled error in "%s":',
      this.props.boundaryName ?? 'component tree',
      error,
      details.componentStack,
    )

    // 2. Invoke optional onError callback (e.g. to notify a parent or test)
    this.props.onError?.(error, details)

    // 3. Report to injected logging service if provided
    if (this.props.loggingService) {
      try {
        this.props.loggingService.captureError(error, details)
      } catch (loggingError) {
        console.warn('[ErrorBoundary] loggingService.captureError() threw:', loggingError)
      }
    }

    // 4. Report to Sentry if available on window (fallback for global integration)
    if (typeof window !== 'undefined' && (window as Window & { Sentry?: { captureException: (e: Error, opts?: object) => void } }).Sentry) {
      ;(window as Window & { Sentry?: { captureException: (e: Error, opts?: object) => void } }).Sentry!.captureException(error, {
        extra: { componentStack: details.componentStack },
      })
    }
  }

  /**
   * Resets the error state so the child component tree is re-rendered.
   * Bound to the "Try Again" button.
   */
  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorDetails: null })
  }

  /** Forces a full page reload – a last resort recovery action. */
  private handleReload = (): void => {
    window.location.reload()
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Render custom fallback if provided
    if (this.props.fallback !== undefined) {
      return this.props.fallback
    }

    const { error, errorDetails } = this.state
    const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'

    // Default built-in fallback UI
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="min-h-[200px] flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6"
      >
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
          {/* Error icon */}
          <div className="mb-5 flex justify-center">
            <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg
                aria-hidden="true"
                className="h-7 w-7 text-red-500 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Something went wrong
          </h2>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {this.props.boundaryName
              ? `${this.props.boundaryName} encountered an unexpected error.`
              : 'We ran into an unexpected error.'}{' '}
            You can try again or reload the page.
          </p>

          {/* Development-only error detail panel */}
          {isDev && error && (
            <details className="text-left mb-6 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-400 select-none">
                Error Details (dev only)
              </summary>
              <pre className="mt-2 text-xs text-red-600 dark:text-red-300 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                {error.toString()}
                {errorDetails?.componentStack}
              </pre>
            </details>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-5 py-2 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Reload Page
            </button>
          </div>

          <p className="mt-5 text-xs text-gray-400 dark:text-gray-500">
            If this problem persists, please contact support.
          </p>
        </div>
      </div>
    )
  }
}

// ============================================================================
// withErrorBoundary HOC
// ============================================================================

/**
 * Higher-order component that wraps a component with an ErrorBoundary.
 *
 * @param WrappedComponent - The component to wrap
 * @param options - Optional ErrorBoundary configuration
 * @returns A new component with error boundary protection
 *
 * @example
 * const SafeWidget = withErrorBoundary(Widget, { boundaryName: 'Widget' })
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<ErrorBoundaryProps, 'children'>,
): React.FC<P> {
  const displayName = WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'

  function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...options}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`
  return WithErrorBoundary
}

// ============================================================================
// RouteErrorBoundary – lightweight wrapper for route-level protection
// ============================================================================

/**
 * A pre-configured ErrorBoundary intended for wrapping entire route components.
 * Renders a full-page-height fallback with a prominent error message and
 * navigation buttons.
 *
 * @example
 * <RouteErrorBoundary routeName="Dashboard">
 *   <DashboardPage />
 * </RouteErrorBoundary>
 */
export interface RouteErrorBoundaryProps {
  /** The child route component */
  children: React.ReactNode
  /**
   * Human-readable name of the route, shown in the error heading.
   * @default 'This page'
   */
  routeName?: string
  /** Optional logging service passed through to ErrorBoundary */
  loggingService?: LoggingService
  /** Optional callback invoked when an error is caught */
  onError?: (error: Error, details: ErrorDetails) => void
}

/**
 * Route-level error boundary that renders a full-page fallback when the
 * wrapped route component crashes.
 */
export function RouteErrorBoundary({
  children,
  routeName = 'This page',
  loggingService,
  onError,
}: RouteErrorBoundaryProps): React.ReactElement {
  return (
    <ErrorBoundary
      boundaryName={routeName}
      loggingService={loggingService}
      onError={onError}
      fallback={
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-screen flex items-center justify-center bg-[#030303] p-6"
        >
          <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg
                aria-hidden="true"
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            <h2 className="text-xl font-semibold text-white mb-2">
              {routeName} failed to load
            </h2>

            <p className="text-white/60 mb-6 text-sm">
              An unexpected error occurred while loading this page. Please try
              refreshing or navigate back home.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-black"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => (window.location.href = '/')}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-black"
              >
                Go Home
              </button>
            </div>

            <p className="mt-5 text-xs text-white/30">
              If this problem persists, please contact support.
            </p>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

// ============================================================================
// SectionErrorBoundary – inline section-level protection
// ============================================================================

/**
 * A compact ErrorBoundary for wrapping individual sections or widgets within
 * a page. Renders a small inline error notice rather than a full-screen overlay.
 *
 * @example
 * <SectionErrorBoundary sectionName="Analytics Widget">
 *   <AnalyticsChart />
 * </SectionErrorBoundary>
 */
export function SectionErrorBoundary({
  children,
  sectionName = 'This section',
  loggingService,
  onError,
}: {
  children: React.ReactNode
  /** Human-readable label for the section, used in the error message */
  sectionName?: string
  /** Optional logging service passed through to ErrorBoundary */
  loggingService?: LoggingService
  /** Optional callback invoked when an error is caught */
  onError?: (error: Error, details: ErrorDetails) => void
}): React.ReactElement {
  return (
    <ErrorBoundary
      boundaryName={sectionName}
      loggingService={loggingService}
      onError={onError}
      fallback={
        <div
          role="alert"
          className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20"
        >
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <svg
              aria-hidden="true"
              className="h-5 w-5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="font-medium text-sm">{sectionName} failed to load</span>
          </div>
          <p className="mt-1 text-sm text-red-500 dark:text-red-400">
            Please refresh the page or try again later.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

export default ErrorBoundary
