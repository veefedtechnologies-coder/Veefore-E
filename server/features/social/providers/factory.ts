/**
 * Social Provider Factory
 *
 * Provides `getProvider(platform)` — the single point of access for all
 * social platform provider instances. Callers never import a concrete provider
 * directly; they go through this factory so the rest of the codebase remains
 * platform-agnostic.
 *
 * Design decisions:
 * - Providers are lazy-loaded (dynamic `import()`) so their modules are only
 *   evaluated when first requested, keeping cold-start cost low.
 * - Once instantiated, each provider is cached in `_providers` (singleton map)
 *   so shared state such as rate-limit counters and HTTP client instances is
 *   created only once per process lifetime.
 * - For unknown platforms, `UnsupportedPlatformError` is thrown — callers
 *   should consult `CapabilityGuard.getConnectablePlatforms()` before calling
 *   `getProvider` if they want to enumerate valid platforms.
 *
 * Requirements: 13.1, 13.2, 13.3
 */

import type { PlatformId } from '../../../../src/shared/platform-registry/types'
import type { SocialPlatformProvider } from './types'

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown by `getProvider` when the requested platform string does not match
 * any registered provider.
 *
 * Callers that need to distinguish "unsupported platform" from other errors
 * can check `err instanceof UnsupportedPlatformError` or inspect `err.platform`.
 */
export class UnsupportedPlatformError extends Error {
  /** The platform string that was not found in the provider registry. */
  public readonly platform: string

  constructor(platform: string) {
    super(`Unsupported platform: ${platform}`)
    this.name = 'UnsupportedPlatformError'
    this.platform = platform
    // Maintain proper prototype chain in environments that transpile classes
    Object.setPrototypeOf(this, UnsupportedPlatformError.prototype)
  }
}

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

/**
 * Module-level singleton map.  Keyed by `PlatformId`; values are fully
 * initialised provider instances.  The map is intentionally not exported so
 * that callers cannot bypass the factory.
 */
const _providers = new Map<PlatformId, SocialPlatformProvider>()

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns the singleton `SocialPlatformProvider` for the given `platform`.
 *
 * Providers are lazily constructed on first call and cached for subsequent
 * calls.  Concrete provider modules are imported dynamically so that
 * `FacebookProvider` and `InstagramProvider` are only loaded when their
 * respective platform is requested.
 *
 * @param platform - A platform identifier string (e.g. `"instagram"`, `"facebook"`).
 * @returns The singleton `SocialPlatformProvider` for that platform.
 * @throws {UnsupportedPlatformError} If `platform` is not `"instagram"` or
 *   `"facebook"`.
 *
 * @example
 * ```ts
 * import { getProvider } from './factory'
 *
 * const provider = await getProvider('facebook')
 * const { authUrl } = provider.initiateOAuth(workspaceId, redirectUri)
 * ```
 */
export async function getProvider(platform: string): Promise<SocialPlatformProvider> {
  const p = platform as PlatformId

  // Return cached instance if available
  const cached = _providers.get(p)
  if (cached) return cached

  // Lazy-load and instantiate the concrete provider
  if (p === 'instagram') {
    const { InstagramProvider } = await import(
      '../../instagram/providers/InstagramProvider'
    )
    const prov = new InstagramProvider()
    _providers.set(p, prov)
    return prov
  }

  if (p === 'facebook') {
    const { FacebookProvider } = await import(
      '../../facebook/providers/FacebookProvider'
    )
    const prov = new FacebookProvider()
    _providers.set(p, prov)
    return prov
  }

  throw new UnsupportedPlatformError(platform)
}

// ---------------------------------------------------------------------------
// Synchronous variant (for callers that have already warmed the cache)
// ---------------------------------------------------------------------------

/**
 * Returns the cached provider for `platform` synchronously.
 *
 * This is intended for code paths that are guaranteed to run *after* the
 * provider has already been initialised by a prior `getProvider()` call (e.g.
 * inside request handlers that sit behind a middleware that warms the cache).
 *
 * If the provider has not been cached yet, this function throws
 * `UnsupportedPlatformError` — in that case callers should use the async
 * `getProvider()` instead.
 *
 * @throws {UnsupportedPlatformError} If the provider is not in the cache.
 */
export function getProviderSync(platform: string): SocialPlatformProvider {
  const p = platform as PlatformId
  const cached = _providers.get(p)
  if (cached) return cached
  throw new UnsupportedPlatformError(platform)
}

// ---------------------------------------------------------------------------
// Cache management helpers (used primarily in tests)
// ---------------------------------------------------------------------------

/**
 * Clears all cached provider instances.  Useful in tests that need a fresh
 * provider instance between test cases.
 *
 * @internal
 */
export function _clearProviderCache(): void {
  _providers.clear()
}

/**
 * Registers a provider instance directly into the cache.  Useful in tests
 * that want to inject a mock provider without triggering a dynamic import.
 *
 * @internal
 */
export function _registerProvider(platform: PlatformId, provider: SocialPlatformProvider): void {
  _providers.set(platform, provider)
}
