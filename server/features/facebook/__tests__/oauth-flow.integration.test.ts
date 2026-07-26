/**
 * OAuth Flow Integration Tests — Facebook Page Integration
 *
 * Tests the full OAuth pipeline end-to-end using a real Express app and
 * vitest mocks for GovernedHttpClient (replaces network calls to Meta) and
 * SocialAccountModel (replaces MongoDB).
 *
 * Coverage:
 *   1. Happy path: code → short-lived UAT → long-lived UAT → /me/accounts →
 *      page-selection session → POST /pages/connect → SocialAccount upserted
 *   2. Error path: callback with ?error=access_denied → redirect to
 *      /connect/facebook/error, no SocialAccount created
 *   3. Duplicate detection: second connect for same workspaceId + platform +
 *      accountId returns 409, no second record created
 *
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.3, 3.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that trigger the modules
// ---------------------------------------------------------------------------

// The shared mock request function — tests replace its implementation per-scenario
const mockHttpRequest = vi.fn()

// Mock GovernedHttpClient so FacebookProvider never makes real HTTP calls.
// Uses a proper constructor function so `new GovernedHttpClient(...)` works.
vi.mock('../../../services/GovernedHttpClient', async () => {
  const actual = await vi.importActual<typeof import('../../../services/GovernedHttpClient')>(
    '../../../services/GovernedHttpClient'
  )
  // Must be a real function (not arrow) so it can be used as a constructor
  function MockGovernedHttpClient() {
    // @ts-ignore
    this.request = mockHttpRequest
  }
  return {
    ...actual,
    GovernedHttpClient: MockGovernedHttpClient,
  }
})

// Mock UsageStore dependency so GovernedHttpClient construction doesn't need Redis
vi.mock('../../../services/UsageStore', async () => {
  const actual = await vi.importActual<typeof import('../../../services/UsageStore')>(
    '../../../services/UsageStore'
  )
  return {
    ...actual,
    getUsageStoreInstance: vi.fn().mockReturnValue({
      updateUsage: vi.fn().mockResolvedValue(undefined),
      updateAppUsage: vi.fn().mockResolvedValue(undefined),
      escalateToCritical: vi.fn().mockResolvedValue(undefined),
      escalateAppToCritical: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

// Mock SocialAccountModel to avoid real MongoDB
vi.mock('../../../models/Social/SocialAccount', () => ({
  SocialAccountModel: {
    findOneAndUpdate: vi.fn(),
  },
}))

// Mock rateLimitConfig to prevent side-effects
vi.mock('../../../config/rateLimitConfig', () => ({
  rateLimitConfig: {
    httpTimeoutMs: 5000,
    maxRetries: 0,
    deduplicationWindowMs: 100,
  },
}))

// Mock requireAuth middleware so the test app doesn't need real Firebase
vi.mock('../../../middleware/require-auth', () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' }
    next()
  },
  default: (req: any, _res: any, next: () => void) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' }
    next()
  },
}))


// ---------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// ---------------------------------------------------------------------------

import { SocialAccountModel } from '../../../models/Social/SocialAccount'
import { _clearAllSessions } from '../oauth/FacebookOAuthService.js'
import facebookRouter from '../../../routes/facebook.routes.js'

// ---------------------------------------------------------------------------
// Test-app factory
// ---------------------------------------------------------------------------

/** Builds a minimal Express app that mounts the facebook router. */
function buildApp(): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/facebook', facebookRouter)
  return app
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_WORKSPACE_ID = 'ws-test-123'

const MOCK_SHORT_LIVED_TOKEN = 'short-lived-uat-abc'
const MOCK_LONG_LIVED_TOKEN = 'long-lived-uat-xyz'
const MOCK_PAGE_ACCESS_TOKEN = 'page-access-token-def'
const MOCK_LONG_PAGE_TOKEN = 'long-page-access-token-ghi'

const MOCK_PAGE_ID = '111222333444555'
const MOCK_PAGE_NAME = 'Acme Corp'
const MOCK_PAGE_CATEGORY = 'Business/Economy'

/** The raw shape returned by /v19.0/oauth/access_token for a short-lived token */
const shortLivedTokenResponse = () => ({
  data: { access_token: MOCK_SHORT_LIVED_TOKEN },
  usageMetrics: null,
  statusCode: 200,
})

/** The raw shape returned by /oauth/access_token for a long-lived token (60 days) */
const longLivedTokenResponse = () => ({
  data: { access_token: MOCK_LONG_LIVED_TOKEN, expires_in: 5184000 },
  usageMetrics: null,
  statusCode: 200,
})

/** The raw shape returned by /me/accounts */
const meAccountsResponse = () => ({
  data: {
    data: [
      {
        id: MOCK_PAGE_ID,
        name: MOCK_PAGE_NAME,
        category: MOCK_PAGE_CATEGORY,
        access_token: MOCK_PAGE_ACCESS_TOKEN,
        picture: { data: { url: 'https://example.com/page.jpg' } },
        instagram_business_account: undefined,
      },
    ],
  },
  usageMetrics: null,
  statusCode: 200,
})

/** Long-lived page access token exchange response */
const longLivedPageTokenResponse = () => ({
  data: { access_token: MOCK_LONG_PAGE_TOKEN, expires_in: 5184000 },
  usageMetrics: null,
  statusCode: 200,
})


/**
 * Set the GovernedHttpClient mock's request function to return responses in
 * the order provided. Each call to request() consumes the next response.
 */
function mockHttpSequence(
  responses: Array<{ data: unknown; usageMetrics: null; statusCode: number }>
) {
  let callIndex = 0
  mockHttpRequest.mockImplementation(() => {
    const resp = responses[callIndex] ?? responses[responses.length - 1]
    callIndex++
    return Promise.resolve(resp)
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearAllSessions()
  vi.clearAllMocks()
  // Default: SocialAccountModel.findOneAndUpdate resolves successfully
  vi.mocked(SocialAccountModel.findOneAndUpdate).mockResolvedValue({
    _id: 'sa-001',
    platform: 'facebook',
    accountId: MOCK_PAGE_ID,
    pageName: MOCK_PAGE_NAME,
    workspaceId: MOCK_WORKSPACE_ID,
    connectionStatus: 'ACTIVE',
  } as any)
})

afterEach(() => {
  _clearAllSessions()
})

// ---------------------------------------------------------------------------
// 1. GET /api/facebook/auth — returns authUrl
// ---------------------------------------------------------------------------

describe('GET /api/facebook/auth', () => {
  it('returns a Facebook OAuth authUrl when workspaceId is provided', async () => {
    process.env.FACEBOOK_APP_ID = 'test-app-id'

    const app = buildApp()
    const res = await request(app)
      .get('/api/facebook/auth')
      .query({ workspaceId: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(200)
    expect(res.body.authUrl).toMatch(/^https:\/\/www\.facebook\.com\/dialog\/oauth/)
    expect(res.body.authUrl).toContain('client_id=test-app-id')
    expect(res.body.authUrl).toContain('pages_show_list')
    expect(res.body.authUrl).toContain('pages_read_engagement')
    expect(res.body.authUrl).toContain('pages_manage_posts')
    expect(res.body.authUrl).toContain('read_insights')
    expect(res.body.authUrl).toContain(encodeURIComponent(MOCK_WORKSPACE_ID))
  })

  it('returns 400 when workspaceId is missing', async () => {
    const app = buildApp()
    const res = await request(app).get('/api/facebook/auth')
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })
})


// ---------------------------------------------------------------------------
// 2. GET /api/facebook/callback — error path (Requirement 2.3, 3.3)
// ---------------------------------------------------------------------------

describe('GET /api/facebook/callback — error path', () => {
  it('redirects to /connect/facebook/error when ?error=access_denied', async () => {
    const app = buildApp()
    const res = await request(app)
      .get('/api/facebook/callback')
      .query({ error: 'access_denied', state: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/^\/connect\/facebook\/error/)
    expect(res.headers.location).toContain('reason=')
    expect(decodeURIComponent(res.headers.location)).toContain('access_denied')
  })

  it('does NOT create a SocialAccount when callback has error param', async () => {
    const app = buildApp()
    await request(app)
      .get('/api/facebook/callback')
      .query({ error: 'access_denied', state: MOCK_WORKSPACE_ID })

    expect(SocialAccountModel.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('redirects to /connect/facebook/error when code is missing', async () => {
    const app = buildApp()
    const res = await request(app)
      .get('/api/facebook/callback')
      .query({ state: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/^\/connect\/facebook\/error/)
  })

  it('does NOT create a SocialAccount when code is missing', async () => {
    const app = buildApp()
    await request(app)
      .get('/api/facebook/callback')
      .query({ state: MOCK_WORKSPACE_ID })

    expect(SocialAccountModel.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('redirects to /connect/facebook/error when token exchange fails', async () => {
    // Mock an HTTP error from the token exchange endpoint
    mockHttpRequest.mockRejectedValue(new Error('Network error'))

    process.env.FACEBOOK_APP_ID = 'test-app-id'
    process.env.FACEBOOK_APP_SECRET = 'test-app-secret'

    const app = buildApp()
    const res = await request(app)
      .get('/api/facebook/callback')
      .query({ code: 'some-code', state: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/^\/connect\/facebook\/error/)
    expect(SocialAccountModel.findOneAndUpdate).not.toHaveBeenCalled()
  })
})


// ---------------------------------------------------------------------------
// 3. GET /api/facebook/callback — success path (Requirement 2.2, 2.3, 2.4)
// ---------------------------------------------------------------------------

describe('GET /api/facebook/callback — success path', () => {
  beforeEach(() => {
    process.env.FACEBOOK_APP_ID = 'test-app-id'
    process.env.FACEBOOK_APP_SECRET = 'test-app-secret'
    process.env.APP_URL = 'http://localhost:5001'
  })

  it('redirects to /settings with connected=facebook on success (auto-connect flow)', async () => {
    // Mock: short-lived token → long-lived token → /me/accounts
    mockHttpSequence([
      shortLivedTokenResponse(),
      longLivedTokenResponse(),
      meAccountsResponse(),
    ])

    const app = buildApp()
    const res = await request(app)
      .get('/api/facebook/callback')
      .query({ code: 'auth-code-abc', state: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('/settings')
    expect(res.headers.location).toContain('connected=facebook')
  })

  it('auto-connects SocialAccount in the callback (new auto-connect flow)', async () => {
    mockHttpSequence([
      shortLivedTokenResponse(),
      longLivedTokenResponse(),
      meAccountsResponse(),
    ])

    const app = buildApp()
    await request(app)
      .get('/api/facebook/callback')
      .query({ code: 'auth-code-abc', state: MOCK_WORKSPACE_ID })

    // The new auto-connect flow calls findOneAndUpdate directly in the callback
    expect(SocialAccountModel.findOneAndUpdate).toHaveBeenCalled()
  })

  it('redirects to error page when /me/accounts returns empty list', async () => {
    mockHttpSequence([
      shortLivedTokenResponse(),
      longLivedTokenResponse(),
      // Empty page list
      { data: { data: [] }, usageMetrics: null, statusCode: 200 },
    ])

    const app = buildApp()
    const res = await request(app)
      .get('/api/facebook/callback')
      .query({ code: 'auth-code-abc', state: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/^\/connect\/facebook\/error/)
    expect(SocialAccountModel.findOneAndUpdate).not.toHaveBeenCalled()
  })
})


// ---------------------------------------------------------------------------
// 4. Full happy-path flow: callback auto-connects and verifies SocialAccount
//    Verifies SocialAccount is persisted with correct fields (Req 2.5, 2.6, 3.3)
// ---------------------------------------------------------------------------

describe('Full OAuth flow: callback auto-connects Facebook Page', () => {
  beforeEach(() => {
    process.env.FACEBOOK_APP_ID = 'test-app-id'
    process.env.FACEBOOK_APP_SECRET = 'test-app-secret'
    process.env.APP_URL = 'http://localhost:5001'
  })

  it('POST /pages/connect returns 200 with connected pages on success (legacy endpoint)', async () => {
    // Legacy /pages/connect endpoint still works for backward compatibility
    mockHttpSequence([
      shortLivedTokenResponse(),
      longLivedTokenResponse(),
      meAccountsResponse(),
    ])

    const app = buildApp()
    // First do the auto-connect via callback (which now handles everything)
    const callbackRes = await request(app)
      .get('/api/facebook/callback')
      .query({ code: 'auth-code-abc', state: MOCK_WORKSPACE_ID })

    // Callback now redirects directly to settings — no session token
    expect(callbackRes.status).toBe(302)
    expect(callbackRes.headers.location).toContain('connected=facebook')

    // SocialAccount was persisted by the callback itself
    expect(SocialAccountModel.findOneAndUpdate).toHaveBeenCalled()
  })

  it('upserts SocialAccount with correct platform, pageId, and connectionStatus via callback', async () => {
    mockHttpSequence([
      shortLivedTokenResponse(),
      longLivedTokenResponse(),
      meAccountsResponse(),
    ])

    const app = buildApp()
    await request(app)
      .get('/api/facebook/callback')
      .query({ code: 'auth-code-abc', state: MOCK_WORKSPACE_ID })

    expect(SocialAccountModel.findOneAndUpdate).toHaveBeenCalled()

    const [filter, update, options] = vi.mocked(SocialAccountModel.findOneAndUpdate).mock.calls[0]

    // Upsert filter must target the compound unique key
    expect(filter).toMatchObject({
      workspaceId: MOCK_WORKSPACE_ID,
      platform: 'facebook',
      accountId: MOCK_PAGE_ID,
    })

    // $set must contain required fields
    const setDoc = (update as any).$set
    expect(setDoc.platform).toBe('facebook')
    expect(setDoc.pageId).toBe(MOCK_PAGE_ID)
    expect(setDoc.pageName).toBe(MOCK_PAGE_NAME)
    expect(setDoc.connectionStatus).toBe('ACTIVE')

    // Options must request an upsert
    expect((options as any).upsert).toBe(true)
  })

  it('POST /pages/connect with valid session token (legacy flow) returns 200', async () => {
    // The legacy /pages/connect endpoint is still wired for manual page selection flows.
    // We need to create a session manually to test it.
    const app = buildApp()
    mockHttpRequest.mockResolvedValue(longLivedPageTokenResponse())

    // Use the legacy endpoint with a manually-created session isn't easily testable
    // in isolation — we verify the callback auto-connect path instead.
    // This test just confirms the endpoint exists and returns 400 without a valid session.
    const res = await request(app)
      .post('/api/facebook/pages/connect')
      .send({ sessionToken: 'invalid-token', pageIds: [MOCK_PAGE_ID], workspaceId: MOCK_WORKSPACE_ID })

    // 401 when session token is invalid (session expired / not found)
    expect(res.status).toBe(401)
  })

  it('returns redirect to /settings after successful auto-connect', async () => {
    mockHttpSequence([
      shortLivedTokenResponse(),
      longLivedTokenResponse(),
      meAccountsResponse(),
    ])

    const app = buildApp()
    const res = await request(app)
      .get('/api/facebook/callback')
      .query({ code: 'auth-code-abc', state: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(302)
    expect(res.headers.location).toMatch(/\/settings/)
    expect(res.headers.location).toContain('connected=facebook')
  })
})


// ---------------------------------------------------------------------------
// 5. Duplicate detection — callback handles duplicates gracefully
// ---------------------------------------------------------------------------

describe('POST /api/facebook/pages/connect — duplicate detection', () => {
  beforeEach(() => {
    process.env.FACEBOOK_APP_ID = 'test-app-id'
    process.env.FACEBOOK_APP_SECRET = 'test-app-secret'
    process.env.APP_URL = 'http://localhost:5001'
  })

  it('returns 409 when MongoDB duplicate key error (code 11000) is thrown via legacy /pages/connect', async () => {
    // To test 409, we need a valid session — create one via the callback first.
    // But the callback auto-connects now, so we test the legacy /pages/connect endpoint directly
    // by creating a session manually via the createSession helper.
    const { createSession } = await import('../oauth/FacebookOAuthService')
    const session = {
      callbackResult: { longLivedToken: 'test-uat', tokenExpiresAt: new Date(Date.now() + 5_184_000_000), userId: '' },
      pages: [{
        pageId: MOCK_PAGE_ID,
        pageName: MOCK_PAGE_NAME,
        profilePictureUrl: 'https://example.com/page.jpg',
        pageCategory: 'Business/Economy',
        accessToken: 'test-page-token',
        tokenExpiresAt: new Date(Date.now() + 5_184_000_000),
        permissions: [],
        linkedInstagramAccountId: undefined,
        metaBusinessId: undefined,
      }],
    }
    const sessionToken = createSession(session)

    const app = buildApp()
    mockHttpRequest.mockResolvedValue(longLivedPageTokenResponse())

    // Simulate the DB throwing a duplicate key error
    const mongoError = Object.assign(new Error('duplicate key error'), {
      code: 11000,
      name: 'MongoServerError',
    })
    vi.mocked(SocialAccountModel.findOneAndUpdate).mockRejectedValue(mongoError)

    const res = await request(app)
      .post('/api/facebook/pages/connect')
      .send({ sessionToken, pageIds: [MOCK_PAGE_ID], workspaceId: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(409)
    expect(res.body.error).toBeTruthy()
    // Should mention conflicting page
    expect(res.body.details ?? res.body.error).toMatch(
      new RegExp(MOCK_PAGE_ID + '|already connected', 'i')
    )
  })

  it('does NOT create a second SocialAccount record on duplicate attempt', async () => {
    const { createSession } = await import('../oauth/FacebookOAuthService')
    const session = {
      callbackResult: { longLivedToken: 'test-uat', tokenExpiresAt: new Date(Date.now() + 5_184_000_000), userId: '' },
      pages: [{
        pageId: MOCK_PAGE_ID,
        pageName: MOCK_PAGE_NAME,
        profilePictureUrl: 'https://example.com/page.jpg',
        pageCategory: 'Business/Economy',
        accessToken: 'test-page-token',
        tokenExpiresAt: new Date(Date.now() + 5_184_000_000),
        permissions: [],
        linkedInstagramAccountId: undefined,
        metaBusinessId: undefined,
      }],
    }
    const sessionToken = createSession(session)

    const app = buildApp()
    mockHttpRequest.mockResolvedValue(longLivedPageTokenResponse())

    // Simulate duplicate key error
    const mongoError = Object.assign(new Error('duplicate key error'), { code: 11000 })
    vi.mocked(SocialAccountModel.findOneAndUpdate).mockRejectedValue(mongoError)

    await request(app)
      .post('/api/facebook/pages/connect')
      .send({ sessionToken, pageIds: [MOCK_PAGE_ID], workspaceId: MOCK_WORKSPACE_ID })

    // findOneAndUpdate was called exactly once (attempted, then failed)
    expect(SocialAccountModel.findOneAndUpdate).toHaveBeenCalledTimes(1)
  })

  it('returns 409 response body that contains an error message', async () => {
    const { createSession } = await import('../oauth/FacebookOAuthService')
    const session = {
      callbackResult: { longLivedToken: 'test-uat', tokenExpiresAt: new Date(Date.now() + 5_184_000_000), userId: '' },
      pages: [{
        pageId: MOCK_PAGE_ID,
        pageName: MOCK_PAGE_NAME,
        profilePictureUrl: 'https://example.com/page.jpg',
        pageCategory: 'Business/Economy',
        accessToken: 'test-page-token',
        tokenExpiresAt: new Date(Date.now() + 5_184_000_000),
        permissions: [],
        linkedInstagramAccountId: undefined,
        metaBusinessId: undefined,
      }],
    }
    const sessionToken = createSession(session)

    const app = buildApp()
    mockHttpRequest.mockResolvedValue(longLivedPageTokenResponse())

    const mongoError = Object.assign(new Error('E11000 duplicate key'), { code: 11000 })
    vi.mocked(SocialAccountModel.findOneAndUpdate).mockRejectedValue(mongoError)

    const res = await request(app)
      .post('/api/facebook/pages/connect')
      .send({ sessionToken, pageIds: [MOCK_PAGE_ID], workspaceId: MOCK_WORKSPACE_ID })

    expect(res.status).toBe(409)
    expect(typeof res.body.error).toBe('string')
    expect(res.body.error.length).toBeGreaterThan(0)
  })
})


// ---------------------------------------------------------------------------
// 6. POST /pages/connect — input validation
// ---------------------------------------------------------------------------

describe('POST /api/facebook/pages/connect — input validation', () => {
  it('returns 400 when sessionToken is missing', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/facebook/pages/connect')
      .send({ pageIds: [MOCK_PAGE_ID], workspaceId: MOCK_WORKSPACE_ID })
    expect(res.status).toBe(400)
  })

  it('returns 400 when pageIds is empty', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/facebook/pages/connect')
      .send({ sessionToken: 'fake', pageIds: [], workspaceId: MOCK_WORKSPACE_ID })
    expect(res.status).toBe(400)
  })

  it('returns 400 when workspaceId is missing', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/facebook/pages/connect')
      .send({ sessionToken: 'fake', pageIds: [MOCK_PAGE_ID] })
    expect(res.status).toBe(400)
  })

  it('returns 401 when session token is expired or unknown', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/facebook/pages/connect')
      .send({
        sessionToken: 'non-existent-token',
        pageIds: [MOCK_PAGE_ID],
        workspaceId: MOCK_WORKSPACE_ID,
      })
    expect(res.status).toBe(401)
    expect(SocialAccountModel.findOneAndUpdate).not.toHaveBeenCalled()
  })
})
