/**
 * Unit tests for the Facebook API error mapper.
 *
 * Tests cover:
 * - FacebookApiError class construction and prototype chain
 * - mapFacebookApiError code-to-type classification (190, 10/200/803, 80002/429, unknown)
 * - Axios error shape extraction
 * - Plain Graph API body shape extraction
 * - missingPermission extraction (required_permissions array + message regex)
 * - retryAfter extraction from Retry-After header
 * - Unknown / null / primitive inputs → UNKNOWN type
 */

import { describe, it, expect } from 'vitest'
import { FacebookApiError, mapFacebookApiError } from './error-mapper'

// ---------------------------------------------------------------------------
// Helpers to build realistic error shapes
// ---------------------------------------------------------------------------

/** Builds a minimal Axios-style error with a Graph API error body. */
function makeAxiosError(code: number, message = 'Graph API error', subcode?: number, status = 400) {
  const graphError: Record<string, unknown> = { message, code }
  if (subcode !== undefined) graphError['error_subcode'] = subcode
  return {
    isAxiosError: true,
    response: {
      status,
      headers: {},
      data: { error: graphError },
    },
    message: `Request failed with status code ${status}`,
  }
}

/** Builds a plain Graph API error body (no Axios wrapper). */
function makeGraphApiBody(code: number, message = 'Graph API error') {
  return { error: { code, message } }
}

/** Builds an HTTP 429 Axios error (rate limit via HTTP status, no graph code). */
function makeHttp429Error(retryAfterSeconds?: number) {
  return {
    isAxiosError: true,
    response: {
      status: 429,
      headers: retryAfterSeconds !== undefined ? { 'retry-after': String(retryAfterSeconds) } : {},
      data: {},
    },
    message: 'Request failed with status code 429',
  }
}

// ---------------------------------------------------------------------------
// FacebookApiError class tests
// ---------------------------------------------------------------------------

describe('FacebookApiError', () => {
  it('extends Error', () => {
    const err = new FacebookApiError({ type: 'UNKNOWN', message: 'test' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(FacebookApiError)
  })

  it('has correct name', () => {
    const err = new FacebookApiError({ type: 'TOKEN_EXPIRED', message: 'expired' })
    expect(err.name).toBe('FacebookApiError')
  })

  it('preserves all constructor params', () => {
    const cause = new Error('root cause')
    const err = new FacebookApiError({
      type: 'PERMISSION_DENIED',
      message: 'no permission',
      code: 200,
      missingPermission: 'pages_read_engagement',
      cause,
    })
    expect(err.type).toBe('PERMISSION_DENIED')
    expect(err.message).toBe('no permission')
    expect(err.code).toBe(200)
    expect(err.missingPermission).toBe('pages_read_engagement')
  })

  it('preserves retryAfter param', () => {
    const err = new FacebookApiError({ type: 'RATE_LIMITED', message: 'rate limited', retryAfter: 60 })
    expect(err.retryAfter).toBe(60)
  })

  it('maintains correct prototype chain', () => {
    const err = new FacebookApiError({ type: 'UNKNOWN', message: 'test' })
    expect(Object.getPrototypeOf(err)).toBe(FacebookApiError.prototype)
  })
})

// ---------------------------------------------------------------------------
// mapFacebookApiError — code 190 → TOKEN_EXPIRED
// ---------------------------------------------------------------------------

describe('mapFacebookApiError — code 190 (TOKEN_EXPIRED)', () => {
  it('classifies Axios error with code 190 as TOKEN_EXPIRED', () => {
    const result = mapFacebookApiError(makeAxiosError(190, 'Invalid OAuth access token.'))
    expect(result.type).toBe('TOKEN_EXPIRED')
    expect(result.code).toBe(190)
    expect(result).toBeInstanceOf(FacebookApiError)
  })

  it('classifies plain Graph API body with code 190 as TOKEN_EXPIRED', () => {
    const result = mapFacebookApiError(makeGraphApiBody(190))
    expect(result.type).toBe('TOKEN_EXPIRED')
  })

  it('preserves original error message', () => {
    const result = mapFacebookApiError(makeAxiosError(190, 'Error validating access token: Session is invalid'))
    expect(result.message).toBe('Error validating access token: Session is invalid')
  })
})

// ---------------------------------------------------------------------------
// mapFacebookApiError — codes 10/200/803 → PERMISSION_DENIED
// ---------------------------------------------------------------------------

describe('mapFacebookApiError — codes 10/200/803 (PERMISSION_DENIED)', () => {
  it.each([10, 200, 803])('classifies code %i as PERMISSION_DENIED', (code) => {
    const result = mapFacebookApiError(makeAxiosError(code))
    expect(result.type).toBe('PERMISSION_DENIED')
    expect(result.code).toBe(code)
  })

  it('extracts missingPermission from required_permissions array', () => {
    const err = {
      response: {
        status: 403,
        headers: {},
        data: {
          error: {
            code: 200,
            message: 'Permission denied',
            required_permissions: ['pages_read_engagement', 'read_insights'],
          },
        },
      },
    }
    const result = mapFacebookApiError(err)
    expect(result.type).toBe('PERMISSION_DENIED')
    expect(result.missingPermission).toBe('pages_read_engagement')
  })

  it('extracts missingPermission from error message via regex fallback', () => {
    const err = makeAxiosError(200, 'Permission error for pages_manage_posts on object')
    const result = mapFacebookApiError(err)
    expect(result.type).toBe('PERMISSION_DENIED')
    expect(result.missingPermission).toBe('pages_manage_posts')
  })

  it('leaves missingPermission undefined when no permission info available', () => {
    const result = mapFacebookApiError(makeAxiosError(10, 'Permission denied.'))
    expect(result.missingPermission).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// mapFacebookApiError — code 80002/HTTP 429 → RATE_LIMITED
// ---------------------------------------------------------------------------

describe('mapFacebookApiError — code 80002/HTTP 429 (RATE_LIMITED)', () => {
  it('classifies code 80002 as RATE_LIMITED', () => {
    const result = mapFacebookApiError(makeAxiosError(80002, 'User request limit reached'))
    expect(result.type).toBe('RATE_LIMITED')
    expect(result.code).toBe(80002)
  })

  it('classifies HTTP 429 without graph error code as RATE_LIMITED', () => {
    const result = mapFacebookApiError(makeHttp429Error())
    expect(result.type).toBe('RATE_LIMITED')
  })

  it('classifies HTTP 429 with Retry-After header as RATE_LIMITED with retryAfter', () => {
    const result = mapFacebookApiError(makeHttp429Error(120))
    expect(result.type).toBe('RATE_LIMITED')
    expect(result.retryAfter).toBe(120)
  })

  it('leaves retryAfter undefined when no Retry-After header present', () => {
    const result = mapFacebookApiError(makeAxiosError(80002))
    expect(result.retryAfter).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// mapFacebookApiError — UNKNOWN for unrecognized codes and inputs
// ---------------------------------------------------------------------------

describe('mapFacebookApiError — UNKNOWN', () => {
  it('classifies unrecognized error code as UNKNOWN', () => {
    const result = mapFacebookApiError(makeAxiosError(100, 'Unknown error'))
    expect(result.type).toBe('UNKNOWN')
    expect(result.code).toBe(100)
  })

  it('classifies plain Error object (no code) as UNKNOWN', () => {
    const result = mapFacebookApiError(new Error('network timeout'))
    expect(result.type).toBe('UNKNOWN')
    expect(result.code).toBeUndefined()
    expect(result.message).toBe('network timeout')
  })

  it('classifies null as UNKNOWN without throwing', () => {
    const result = mapFacebookApiError(null)
    expect(result.type).toBe('UNKNOWN')
  })

  it('classifies undefined as UNKNOWN without throwing', () => {
    const result = mapFacebookApiError(undefined)
    expect(result.type).toBe('UNKNOWN')
  })

  it('classifies a plain string as UNKNOWN without throwing', () => {
    const result = mapFacebookApiError('something went wrong')
    expect(result.type).toBe('UNKNOWN')
  })

  it('classifies empty object as UNKNOWN', () => {
    const result = mapFacebookApiError({})
    expect(result.type).toBe('UNKNOWN')
  })

  it('uses fallback message for non-Error inputs with no graph message', () => {
    const result = mapFacebookApiError(null)
    expect(result.message).toBeTruthy()
    expect(typeof result.message).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Return type is always a FacebookApiError instance
// ---------------------------------------------------------------------------

describe('mapFacebookApiError — always returns FacebookApiError', () => {
  it.each([
    makeAxiosError(190),
    makeAxiosError(200),
    makeAxiosError(80002),
    makeAxiosError(999),
    makeHttp429Error(),
    new Error('plain error'),
    null,
    undefined,
    {},
    42,
  ])('returns a FacebookApiError for any input', (input) => {
    const result = mapFacebookApiError(input)
    expect(result).toBeInstanceOf(FacebookApiError)
    expect(result).toBeInstanceOf(Error)
  })
})
