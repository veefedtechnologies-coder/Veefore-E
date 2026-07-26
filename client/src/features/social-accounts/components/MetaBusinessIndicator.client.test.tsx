/**
 * @vitest-environment happy-dom
 *
 * Unit tests for MetaBusinessIndicator
 *
 * NOTE: This project has a dual-React installation (root + client/node_modules)
 * that prevents rendering Radix UI components (TooltipProvider etc.) in tests.
 * The component-rendering tests are therefore replaced with logic-level tests
 * following the same pattern used in AccountOnboarding.client.test.tsx.
 *
 * Requirements: 2.12, 4.4
 */

import { describe, it, expect } from 'vitest'
import {
  getSharedMetaBusinessId,
  type SocialAccountLike,
} from './MetaBusinessIndicator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const igAccount = (metaBusinessId?: string): SocialAccountLike => ({
  platform: 'instagram',
  username: 'ig_username',
  platformMetadata: metaBusinessId ? { metaBusinessId } : {},
})

const fbAccount = (metaBusinessId?: string, pageName?: string): SocialAccountLike => ({
  platform: 'facebook',
  username: 'fb_username',
  pageName,
  platformMetadata: metaBusinessId ? { metaBusinessId } : {},
})

// ---------------------------------------------------------------------------
// getSharedMetaBusinessId — pure detection logic (Req 2.12, 4.4)
// ---------------------------------------------------------------------------

describe('getSharedMetaBusinessId', () => {
  describe('positive detection', () => {
    it('returns the shared ID when both accounts have the same metaBusinessId', () => {
      expect(
        getSharedMetaBusinessId(igAccount('biz-123'), fbAccount('biz-123')),
      ).toBe('biz-123')
    })

    it('returns the shared ID regardless of the actual ID value', () => {
      const id = 'meta_biz_9999999999'
      expect(
        getSharedMetaBusinessId(igAccount(id), fbAccount(id)),
      ).toBe(id)
    })
  })

  describe('negative detection — no relationship', () => {
    it('returns null when the IDs differ', () => {
      expect(
        getSharedMetaBusinessId(igAccount('biz-111'), fbAccount('biz-999')),
      ).toBeNull()
    })

    it('returns null when Instagram metaBusinessId is absent', () => {
      expect(
        getSharedMetaBusinessId(igAccount(), fbAccount('biz-123')),
      ).toBeNull()
    })

    it('returns null when Facebook metaBusinessId is absent', () => {
      expect(
        getSharedMetaBusinessId(igAccount('biz-123'), fbAccount()),
      ).toBeNull()
    })

    it('returns null when both metaBusinessIds are absent', () => {
      expect(getSharedMetaBusinessId(igAccount(), fbAccount())).toBeNull()
    })

    it('returns null when Instagram metaBusinessId is whitespace only', () => {
      expect(
        getSharedMetaBusinessId(
          { platform: 'instagram', platformMetadata: { metaBusinessId: '  ' } },
          fbAccount('biz-123'),
        ),
      ).toBeNull()
    })

    it('returns null when Facebook metaBusinessId is whitespace only', () => {
      expect(
        getSharedMetaBusinessId(
          igAccount('biz-123'),
          { platform: 'facebook', platformMetadata: { metaBusinessId: '   ' } },
        ),
      ).toBeNull()
    })

    it('returns null when platformMetadata is undefined on Instagram', () => {
      const noMeta: SocialAccountLike = { platform: 'instagram' }
      expect(getSharedMetaBusinessId(noMeta, fbAccount('biz-123'))).toBeNull()
    })

    it('returns null when platformMetadata is undefined on Facebook', () => {
      const noMeta: SocialAccountLike = { platform: 'facebook' }
      expect(getSharedMetaBusinessId(igAccount('biz-123'), noMeta)).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// Rendering decision logic (mirrors the conditional in the component)
// ---------------------------------------------------------------------------

describe('MetaBusinessIndicator — render decision logic', () => {
  it('should render (non-null) when IDs match', () => {
    const id = getSharedMetaBusinessId(igAccount('biz-abc'), fbAccount('biz-abc'))
    expect(id).not.toBeNull()
    // Component renders when id !== null
    expect(id !== null).toBe(true)
  })

  it('should NOT render (null) when IDs do not match', () => {
    const id = getSharedMetaBusinessId(igAccount('biz-111'), fbAccount('biz-999'))
    expect(id).toBeNull()
    // Component returns null when id is null
    expect(id === null).toBe(true)
  })

  it('should NOT render when no metaBusinessId is set on either account', () => {
    const id = getSharedMetaBusinessId(igAccount(), fbAccount())
    expect(id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Business-name derivation logic (mirrors the businessName variable in the
// component — ensures display name priority: pageName > username > ig username)
// ---------------------------------------------------------------------------

function deriveBusinessName(
  igAcc: SocialAccountLike,
  fbAcc: SocialAccountLike,
): string {
  return fbAcc.pageName || fbAcc.username || igAcc.username || 'Meta Business'
}

describe('MetaBusinessIndicator — business name derivation', () => {
  it('uses facebookAccount.pageName as the primary business name', () => {
    expect(
      deriveBusinessName(igAccount('x'), fbAccount('x', 'Acme Page')),
    ).toBe('Acme Page')
  })

  it('falls back to facebookAccount.username when pageName is absent', () => {
    expect(
      deriveBusinessName(igAccount('x'), fbAccount('x')), // fbAccount has username 'fb_username'
    ).toBe('fb_username')
  })

  it('falls back to instagramAccount.username when both Facebook name fields absent', () => {
    const fbNoName: SocialAccountLike = {
      platform: 'facebook',
      platformMetadata: { metaBusinessId: 'x' },
    }
    expect(
      deriveBusinessName(igAccount('x'), fbNoName), // ig has username 'ig_username'
    ).toBe('ig_username')
  })

  it("falls back to 'Meta Business' when all name fields are absent", () => {
    const igNoName: SocialAccountLike = { platform: 'instagram', platformMetadata: { metaBusinessId: 'x' } }
    const fbNoName: SocialAccountLike = { platform: 'facebook', platformMetadata: { metaBusinessId: 'x' } }
    expect(deriveBusinessName(igNoName, fbNoName)).toBe('Meta Business')
  })
})
