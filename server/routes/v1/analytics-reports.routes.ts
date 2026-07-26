/**
 * Veefore Enterprise Report Data Endpoint
 * Assembles a comprehensive analytics payload for enterprise-grade export.
 * AI-written narratives, all KPIs, charts data, audience, posts, recommendations.
 */
import { Router } from 'express'
import { requireAuth } from '../../middleware/require-auth'
import { validateWorkspaceAccess } from '../../middleware/workspace-validation'
import { analyticsExportGuards, injectAnalyticsExportMode, clampAnalyticsHistoryWindow } from '../../middleware/apply-route-guards'
import { z } from 'zod'

const router = Router()

const Q = z.object({
  workspaceId: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  compareFrom: z.string().datetime().optional(),
  compareTo: z.string().datetime().optional(),
})

router.get('/export-data', requireAuth, validateWorkspaceAccess({ source: 'query' }), ...analyticsExportGuards, clampAnalyticsHistoryWindow(), injectAnalyticsExportMode(), async (req: any, res) => {
  try {
    const query = Q.parse(req.query)
    const workspaceId = (req as any).workspaceId ?? query.workspaceId
    const endDate = query.to ? new Date(query.to) : new Date()
    const startDate = query.from ? new Date(query.from) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    const spanMs = endDate.getTime() - startDate.getTime()
    const spanDays = Math.round(spanMs / (24 * 60 * 60 * 1000))

    // Comparison window: use client-provided if present, otherwise auto-calculate previous period
    const prevEnd = query.compareTo ? new Date(query.compareTo) : new Date(startDate.getTime() - 1)
    const prevStart = query.compareFrom ? new Date(query.compareFrom) : new Date(startDate.getTime() - spanMs)

    const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository')
    const { ContentModel } = await import('../../models/Content/Content')
    const { getAccessTokenFromAccount } = await import('../../storage/converters')

    const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
    const igAccount = accounts.find((a: any) => a.platform === 'instagram')
    const histAccounts = accounts
      .filter((a: any) => a.platform === 'instagram' && a.accountId)
      .map((a: any) => ({ accountId: String(a.accountId), token: getAccessTokenFromAccount(a) ?? '' }))
      .filter((a: any) => a.token)

    const n = (v: unknown): number => typeof v === 'number' && isFinite(v) ? v : 0
    const pct = (cur: number, prev: number) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null

    // ── Account Info ─────────────────────────────────────────────────────
    const accountInfo = igAccount ? {
      username: igAccount.username, platform: 'Instagram',
      accountType: igAccount.accountType ?? 'BUSINESS',
      followersCount: n(igAccount.followersCount),
      followingCount: n(igAccount.followingCount),
      mediaCount: n(igAccount.mediaCount),
      engagementRate: n(igAccount.engagementRate),
      profilePictureUrl: igAccount.profilePictureUrl,
    } : null

    // ── Insights ──────────────────────────────────────────────────────────
    let cur: Record<string, number> = {}, prev: Record<string, number> = {}
    let follows = { gained: 0, lost: 0 }, prevFollows = { gained: 0, lost: 0 }
    try {
      const { getInsightsRange } = await import('../../features/analytics/history/insightsHistory')
      const { getFollowsRange } = await import('../../features/analytics/history/followsHistory')
      const [ci, pi, cf, pf] = await Promise.all([
        getInsightsRange(workspaceId, histAccounts, startDate, endDate),
        getInsightsRange(workspaceId, histAccounts, prevStart, prevEnd),
        getFollowsRange(workspaceId, histAccounts, startDate, endDate),
        getFollowsRange(workspaceId, histAccounts, prevStart, prevEnd),
      ])
      if (ci) cur = ci; if (pi) prev = pi
      if (cf) follows = cf; if (pf) prevFollows = pf
    } catch { /* non-fatal */ }

    const reach = n(cur.reach); const views = n(cur.views)
    const likes = n(cur.likes); const comments = n(cur.comments)
    const shares = n(cur.shares); const saves = n(cur.saves)
    const engagements = likes + comments + shares + saves
    const prevReach = n(prev.reach)
    const prevLikes = n(prev.likes); const prevComments = n(prev.comments)
    const prevShares = n(prev.shares); const prevSaves = n(prev.saves)
    const prevEngagements = prevLikes + prevComments + prevShares + prevSaves
    const prevViews = n(prev.views)
    const prevProfileViews = n(prev.profile_views)
    const prevWebsiteClicks = n(prev.website_clicks)
    const engRate = reach > 0 ? Math.round((engagements / reach) * 10000) / 100 : 0
    const prevEngRate = prevReach > 0 ? Math.round((prevEngagements / prevReach) * 10000) / 100 : 0
    const engRateChange = prevEngRate > 0 ? Math.round(((engRate - prevEngRate) / prevEngRate) * 100) : null
    const saveRate = reach > 0 ? Math.round((saves / reach) * 10000) / 100 : 0
    const prevSaveRate = prevReach > 0 ? Math.round((prevSaves / prevReach) * 10000) / 100 : 0
    const saveRateChange = prevSaveRate > 0 ? Math.round(((saveRate - prevSaveRate) / prevSaveRate) * 100) : null
    const shareRate = reach > 0 ? Math.round((shares / reach) * 10000) / 100 : 0
    const prevShareRate = prevReach > 0 ? Math.round((prevShares / prevReach) * 10000) / 100 : 0
    const shareRateChange = prevShareRate > 0 ? Math.round(((shareRate - prevShareRate) / prevShareRate) * 100) : null
    const profileViews = n(cur.profile_views); const websiteClicks = n(cur.website_clicks)

    // ── Publishing ────────────────────────────────────────────────────────
    const [pubCount, failCount] = await Promise.all([
      ContentModel.countDocuments({ workspaceId, status: 'published', publishedAt: { $gte: startDate, $lte: endDate } }),
      ContentModel.countDocuments({ workspaceId, status: 'failed', publishedAt: { $gte: startDate, $lte: endDate } }),
    ])

    // ── Daily Series ──────────────────────────────────────────────────────
    let dailySeries: any[] = []
    try {
      const { getInsightsDaily } = await import('../../features/analytics/history/insightsHistory')
      const { AnalyticsDailyMetricModel } = await import('../../models/Analytics/AnalyticsDailyMetric')
      const { toUtcYmd, clampToNow } = await import('../../features/analytics/history/windowKeys')
      const ids = histAccounts.map((a: any) => a.accountId)
      const [insRows, followRows] = await Promise.all([
        getInsightsDaily(ids, startDate, endDate),
        AnalyticsDailyMetricModel.find({ accountId: { $in: ids }, metricGroup: 'follows_and_unfollows', date: { $gte: toUtcYmd(startDate), $lte: toUtcYmd(clampToNow(endDate)) } }).select('date values').lean(),
      ])
      const fMap = new Map<string, number>()
      for (const r of followRows as any[]) fMap.set(r.date, (fMap.get(r.date) ?? 0) + n(r.values?.gained))
      const lMap = new Map<string, number>()
      for (const r of followRows as any[]) lMap.set(r.date, (lMap.get(r.date) ?? 0) + n(r.values?.lost))
      dailySeries = insRows.map((d: any) => ({
        date: d.date, reach: n(d.values.reach), views: n(d.values.views),
        likes: n(d.values.likes), comments: n(d.values.comments),
        shares: n(d.values.shares), saves: n(d.values.saves),
        engagements: n(d.values.likes) + n(d.values.comments) + n(d.values.shares) + n(d.values.saves),
        profileViews: n(d.values.profile_views), websiteClicks: n(d.values.website_clicks),
        newFollowers: fMap.get(d.date) ?? 0, lostFollowers: lMap.get(d.date) ?? 0,
      }))
    } catch { /* non-fatal */ }

    // ── Posts ─────────────────────────────────────────────────────────────
    const rawPosts = await ContentModel.find({ workspaceId, status: 'published' }).sort({ publishedAt: -1 }).limit(100).lean()
    const posts = (rawPosts as any[]).map((p, i) => ({
      rank: i + 1, id: String(p._id), title: p.title || 'Untitled post',
      publishedAt: p.publishedAt?.toISOString() ?? null, mediaType: p.contentData?.media_type ?? 'IMAGE',
      permalink: p.contentData?.permalink ?? null, thumbnailUrl: p.contentData?.thumbnail_url || p.contentData?.media_url || null,
      metrics: {
        reach: n(p.metrics?.reach), views: n(p.metrics?.views),
        likes: n(p.metrics?.likes), comments: n(p.metrics?.comments),
        shares: n(p.metrics?.shares), saves: n(p.metrics?.saves),
        engagements: n(p.metrics?.likes) + n(p.metrics?.comments) + n(p.metrics?.shares) + n(p.metrics?.saves),
        engRate: n(p.metrics?.reach) > 0
          ? Math.round(((n(p.metrics?.likes) + n(p.metrics?.comments) + n(p.metrics?.shares) + n(p.metrics?.saves)) / n(p.metrics?.reach)) * 10000) / 100 : 0,
      },
    }))

    // Segment posts by type
    const reels = posts.filter((p) => p.mediaType === 'VIDEO').slice(0, 10)
    const carousels = posts.filter((p) => p.mediaType === 'CAROUSEL_ALBUM').slice(0, 10)
    const images = posts.filter((p) => p.mediaType === 'IMAGE').slice(0, 10)
    const topPosts = [...posts].sort((a, b) => b.metrics.engagements - a.metrics.engagements).slice(0, 10)
    const worstPosts = [...posts].filter((p) => p.metrics.reach > 0).sort((a, b) => a.metrics.engRate - b.metrics.engRate).slice(0, 5)

    // ── Audience ──────────────────────────────────────────────────────────
    const toArr = (m: any) => {
      const src = m instanceof Map ? Object.fromEntries(m) : (m ?? {})
      return Object.entries(src).map(([label, value]) => ({ label, value: n(value) })).sort((a, b) => b.value - a.value)
    }
    const demographics = igAccount ? {
      country: toArr(igAccount.audienceCountry).slice(0, 15),
      city: toArr(igAccount.audienceCity).slice(0, 15),
      genderAge: toArr(igAccount.audienceGenderAge).slice(0, 20),
      activeTime: igAccount.audienceActiveTime instanceof Map
        ? Object.fromEntries(igAccount.audienceActiveTime as any) : ((igAccount as any).audienceActiveTime ?? {}),
      weeklyActiveTime: (igAccount as any).audienceActiveTimeWeekly instanceof Map
        ? Object.fromEntries((igAccount as any).audienceActiveTimeWeekly) : ((igAccount as any).audienceActiveTimeWeekly ?? {}),
    } : { country: [], city: [], genderAge: [], activeTime: {}, weeklyActiveTime: {} }

    // ── AI Intelligence — real LLM via AIServiceManager (parallel) ───────
    let aiSummary = ''; let aiInsights: string[] = []; let recommendations: any[] = []
    let contentStrategy = ''; let opportunities: any[] = []
    try {
      const { storage } = await import('../../mongodb-storage')
      const { aiServiceManager } = await import('../../services/AIServiceManager')
      const workspace = await storage.getWorkspace(workspaceId).catch(() => null)
      const cfg = (workspace as any)?.aiConfiguration ?? {}
      const aiPrefs = {
        aiModel: cfg.aiModel ?? 'veegpt-hybrid',
        creativityLevel: cfg.creativityLevel ?? 0.7,
        aiPersona: cfg.aiPersona ?? 'Professional & Authoritative',
        captionStyle: cfg.captionStyle ?? 'Storytelling',
        responseLength: 'long',
        multilingual: cfg.multilingual ?? 'auto',
        contentSafety: cfg.contentSafety ?? 'standard',
        aiMemory: cfg.aiMemory ?? 'long-term',
        googleAiStudioKey: cfg.googleAiStudioKey ?? '',
        openAiKey: cfg.openAiKey ?? '',
      }
      const reachChange = pct(reach, n(prev.reach))
      const engChange = pct(engagements, prevEngagements)
      const videoRatio = posts.length > 0 ? Math.round((reels.length / posts.length) * 100) : 0
      const carouselRatio = posts.length > 0 ? Math.round((carousels.length / posts.length) * 100) : 0
      const topPost = topPosts[0]
      const dataSnapshot = `ANALYTICS DATA SNAPSHOT — ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}
Account: ${igAccount?.username ?? 'unknown'} (${igAccount?.accountType ?? 'Business'}) | ${n(igAccount?.followersCount).toLocaleString()} followers
PERFORMANCE: Reach ${reach.toLocaleString()} (${reachChange !== null ? `${reachChange > 0 ? '+' : ''}${reachChange}% vs prev` : 'no prior data'}) | Views ${views.toLocaleString()} | Engagements ${engagements.toLocaleString()} (${engChange !== null ? `${engChange > 0 ? '+' : ''}${engChange}%` : 'no prior'}) | Eng Rate ${engRate}%
INTERACTIONS: Likes ${likes.toLocaleString()} | Comments ${comments.toLocaleString()} | Shares ${shares.toLocaleString()} | Saves ${saves.toLocaleString()} | Save Rate ${saveRate}% | Share Rate ${shareRate}%
PROFILE: Views ${n(cur.profile_views).toLocaleString()} | Website Clicks ${n(cur.website_clicks).toLocaleString()}
FOLLOWERS: New ${follows.gained.toLocaleString()} | Lost ${follows.lost.toLocaleString()} | Net ${(follows.gained - follows.lost).toLocaleString()}
CONTENT: ${posts.length} posts — Reels ${reels.length} (${videoRatio}%) | Carousels ${carousels.length} (${carouselRatio}%) | Images ${images.length} (${100 - videoRatio - carouselRatio}%) | Published ${pubCount} | Failed ${failCount}
TOP POST: ${topPost ? `"${topPost.title.slice(0, 60)}" — ${topPost.metrics.engagements.toLocaleString()} engagements, ${topPost.metrics.reach.toLocaleString()} reach (${topPost.mediaType})` : 'N/A'}
AUDIENCE: Top country ${demographics.country[0]?.label ?? 'N/A'} (${demographics.country[0]?.value ?? 0}) | Top segment ${demographics.genderAge[0]?.label ?? 'N/A'}`

      // ── Fire all 5 LLM calls in PARALLEL — ~5s total instead of ~25s ──
      const [summaryR, insightsR, recsR, strategyR, oppsR] = await Promise.allSettled([
        aiServiceManager.generateText(
          `You are a senior social media analyst writing an executive summary for a professional analytics report.\n${dataSnapshot}\nWrite a single compelling paragraph (4-6 sentences) summarising the account's overall performance for this period. Cover: overall performance trend, biggest achievement, biggest concern, content strategy observation, and one concrete recommendation.\nTone: Professional, data-driven. Do NOT use bullet points. Do NOT start with "This report" or "During this period". Write as if presenting to a board.`,
          aiPrefs),
        aiServiceManager.generateText(
          `You are a social media intelligence analyst. Based on this data, generate exactly 5 specific, numbered insights.\n${dataSnapshot}\nEach insight must reference actual numbers and explain WHY it happened or what it means. 2-3 sentences max. Number them 1-5, one per line.`,
          aiPrefs),
        aiServiceManager.generateText(
          `You are a growth strategist. Generate exactly 5 strategic recommendations based on this data.\n${dataSnapshot}\nUse this EXACT format for each (include the --- separator):\nTITLE: [action title]\nEXPLANATION: [2-3 sentences: problem, why this helps, expected outcome]\nPRIORITY: [HIGH/MEDIUM/LOW]\nIMPACT: [e.g. "+15-20% reach in 30 days"]\nDIFFICULTY: [Easy/Medium/Hard]\nCONFIDENCE: [high/medium/low]\n---`,
          aiPrefs),
        aiServiceManager.generateText(
          `You are a content strategist. Write a concise content strategy analysis paragraph (3-4 sentences).\n${dataSnapshot}\nCover: content mix assessment, what's working, what needs improvement, and one strategic direction. No bullet points.`,
          aiPrefs),
        aiServiceManager.generateText(
          `You are a growth strategist. Identify exactly 5 specific growth opportunities.\n${dataSnapshot}\nUse this EXACT format for each (include the --- separator):\nAREA: [name]\nDESCRIPTION: [2 sentences: what and why it matters]\nPRIORITY: [HIGH/MEDIUM/LOW]\nIMPACT: [e.g. "+20% Reach"]\nDIFFICULTY: [Easy/Medium/Hard]\n---`,
          aiPrefs),
      ])

      if (summaryR.status === 'fulfilled') aiSummary = summaryR.value

      if (insightsR.status === 'fulfilled') {
        const parsed = insightsR.value.split('\n').map((l: string) => l.replace(/^\d+[\.\)]\s*/, '').trim()).filter((l: string) => l.length > 20).slice(0, 5)
        aiInsights = parsed.length > 0 ? parsed : [insightsR.value.trim()]
      }

      if (recsR.status === 'fulfilled') {
        const blocks = recsR.value.split('---').map((b: string) => b.trim()).filter(Boolean)
        const parsed = blocks.slice(0, 5).map((block: string) => {
          const g = (k: string) => { const m = block.match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : '' }
          return { title: g('TITLE') || 'Improve Strategy', explanation: g('EXPLANATION') || block.slice(0, 200), priority: ['HIGH','MEDIUM','LOW'].includes(g('PRIORITY')) ? g('PRIORITY') : 'MEDIUM', expectedImpact: g('IMPACT') || 'Improvement expected', difficulty: g('DIFFICULTY') || 'Medium', confidence: g('CONFIDENCE') || 'medium' }
        }).filter((r: any) => r.title)
        if (parsed.length > 0) recommendations = parsed
      }
      if (recommendations.length === 0) recommendations = [
        { title: 'Optimise Posting Schedule', explanation: `Aligning post timing with peak audience activity can increase initial reach by 15-25%. The Instagram algorithm rewards early engagement velocity.`, priority: 'HIGH', expectedImpact: '+15-25% Reach', difficulty: 'Easy', confidence: 'high' },
        { title: videoRatio < 40 ? 'Increase Reel Frequency' : 'Diversify Content Formats', explanation: videoRatio < 40 ? `With only ${videoRatio}% Reels, significant organic discovery potential is untapped. Accounts at 40%+ Reels consistently see 2-3x reach growth.` : `Your Reel ratio is strong. Introducing Carousel posts can improve save rates and content shelf-life.`, priority: 'HIGH', expectedImpact: '+20% Reach', difficulty: 'Medium', confidence: 'high' },
        { title: 'Improve Save Rate', explanation: `A save rate of ${saveRate}% ${saveRate > 1.5 ? 'is above average — continue creating reference-worthy content.' : 'has room to grow. Educational posts and tip lists generate 3-5x more saves.'}`, priority: saveRate < 1.5 ? 'HIGH' : 'LOW', expectedImpact: '+Save Rate', difficulty: 'Medium', confidence: 'medium' },
        { title: 'Replicate Top Content Formula', explanation: topPost ? `"${topPost.title.slice(0, 40)}" achieved ${topPost.metrics.engRate}% engagement. Analyse its format, posting time and caption, then apply those elements systematically.` : 'Identify your highest-performing post format and build a content series around it.', priority: 'MEDIUM', expectedImpact: '+Engagement Rate', difficulty: 'Medium', confidence: 'medium' },
        { title: pubCount < 8 ? 'Increase Posting Frequency' : 'Maintain Consistency', explanation: pubCount < 8 ? `Only ${pubCount} posts in ${spanDays} days is below the 3-5/week threshold. Irregular cadence directly impacts reach and follower growth.` : `${pubCount} posts shows strong cadence. Maintain a repeatable weekly schedule to sustain algorithm momentum.`, priority: pubCount < 8 ? 'HIGH' : 'LOW', expectedImpact: pubCount < 8 ? '+30% Reach' : 'Sustain Growth', difficulty: 'Medium', confidence: 'high' },
      ]

      if (strategyR.status === 'fulfilled') contentStrategy = strategyR.value
      else contentStrategy = `The account published ${posts.length} posts (${videoRatio}% Reels, ${carouselRatio}% Carousels, ${100 - videoRatio - carouselRatio}% Images). ${videoRatio > 50 ? "The video-forward strategy aligns with Instagram's algorithm priorities." : 'Increasing Reel frequency could improve organic discovery.'} ${topPost ? `Top post "${topPost.title.slice(0, 50)}" achieved ${topPost.metrics.engagements.toLocaleString()} engagements.` : ''}`

      if (oppsR.status === 'fulfilled') {
        const blocks = oppsR.value.split('---').map((b: string) => b.trim()).filter(Boolean)
        const parsed = blocks.slice(0, 5).map((block: string) => {
          const g = (k: string) => { const m = block.match(new RegExp(`${k}:\\s*(.+)`)); return m ? m[1].trim() : '' }
          return { area: g('AREA') || 'Growth Opportunity', description: g('DESCRIPTION') || block.slice(0, 200), priority: g('PRIORITY') || 'MEDIUM', impact: g('IMPACT') || 'Improvement expected', difficulty: g('DIFFICULTY') || 'Medium' }
        }).filter((o: any) => o.area)
        if (parsed.length > 0) opportunities = parsed
      }
      if (opportunities.length === 0) opportunities = [
        { area: 'Best Time Optimisation', description: 'Scheduling posts during peak audience activity hours increases initial engagement velocity, which the algorithm uses to determine content distribution.', priority: 'HIGH', impact: '+15-25% Reach', difficulty: 'Easy' },
        { area: videoRatio < 40 ? 'Reel Production' : 'Content Series', description: videoRatio < 40 ? `Instagram Reels distributes content beyond existing followers. With only ${videoRatio}% Reels, organic discovery potential is untapped.` : 'Building themed content series creates audience anticipation and improves return visit rates.', priority: videoRatio < 40 ? 'HIGH' : 'MEDIUM', impact: '+20% Reach', difficulty: 'Medium' },
        { area: 'Save-Worthy Content', description: `With a ${saveRate}% save rate, creating more reference-worthy content can extend algorithmic distribution over time.`, priority: saveRate < 1.5 ? 'HIGH' : 'MEDIUM', impact: '+Save Rate', difficulty: 'Medium' },
        { area: 'Hashtag Optimisation', description: 'A mixed hashtag strategy combining niche-specific and mid-range tags improves discoverability for new audiences.', priority: 'MEDIUM', impact: '+10% Reach', difficulty: 'Easy' },
        { area: 'Audience Re-engagement', description: follows.lost > follows.gained * 0.5 ? 'High unfollow rate suggests content-audience alignment issues. Interactive Stories and polls can help identify the disconnect.' : 'Leveraging interactive content (polls, Q&As) deepens engagement and improves algorithmic signals.', priority: follows.lost > follows.gained * 0.5 ? 'HIGH' : 'LOW', impact: '+Retention Rate', difficulty: 'Medium' },
      ]

    } catch (aiErr: any) {
      console.error('[REPORTS] AI generation error:', aiErr?.message)
    }

    // ── Performance Score ─────────────────────────────────────────────────
    let performanceScore = 50
    if (engRate >= 5) performanceScore += 20
    else if (engRate >= 2) performanceScore += 10
    if (reach > 0) performanceScore += 10
    if (follows.gained > follows.lost) performanceScore += 10
    if (pubCount >= 8) performanceScore += 10
    performanceScore = Math.min(100, performanceScore)

    const scoreLabel = performanceScore >= 80 ? 'Excellent' : performanceScore >= 60 ? 'Good' : performanceScore >= 40 ? 'Average' : 'Needs Improvement'

    // ── KPI Object ────────────────────────────────────────────────────────
    const kpis = {
      reach, prevReach, reachChange: pct(reach, prevReach),
      views, prevViews, viewsChange: pct(views, prevViews),
      engagements, prevEngagements, engagementsChange: pct(engagements, prevEngagements),
      engRate, prevEngRate, engRateChange,
      likes, prevLikes, likesChange: pct(likes, prevLikes),
      comments, prevComments, commentsChange: pct(comments, prevComments),
      shares, prevShares, sharesChange: pct(shares, prevShares),
      saves, prevSaves, savesChange: pct(saves, prevSaves),
      saveRate, prevSaveRate, saveRateChange,
      shareRate, prevShareRate, shareRateChange,
      profileViews, prevProfileViews, profileViewsChange: pct(profileViews, prevProfileViews),
      websiteClicks, prevWebsiteClicks, websiteClicksChange: pct(websiteClicks, prevWebsiteClicks),
      followersTotal: n(igAccount?.followersCount), followingTotal: n(igAccount?.followingCount),
      newFollowers: follows.gained, lostFollowers: follows.lost,
      prevNewFollowers: prevFollows.gained, prevLostFollowers: prevFollows.lost,
      prevNetFollowers: prevFollows.gained - prevFollows.lost,
      netFollowers: follows.gained - follows.lost,
      newFollowersChange: pct(follows.gained, prevFollows.gained),
      lostFollowersChange: pct(follows.lost, prevFollows.lost),
      publishedPosts: pubCount, failedPosts: failCount,
      publishingSuccessRate: (pubCount + failCount) > 0 ? Math.round((pubCount / (pubCount + failCount)) * 100) : 100,
      performanceScore, scoreLabel,
    }

    res.json({
      meta: {
        workspaceId, workspaceName: igAccount ? `@${igAccount.username}` : 'Your Workspace',
        from: startDate.toISOString(), to: endDate.toISOString(), spanDays,
        generatedAt: new Date().toISOString(),
        exportedBy: (req as any).user?.email ?? (req as any).user?.id ?? 'Unknown',
        periodLabel: `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        prevPeriodLabel: `${prevStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${prevEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        comparisonMode: query.compareFrom ? 'custom' : 'previous',
        platform: 'Instagram', apiVersion: 'v22.0',
        // Plan-driven export capabilities (see injectAnalyticsExportMode):
        //  - exportMode: 'watermarked_pdf' (Free) | 'full' (Creator+)
        //  - watermark: whether the export must carry a Veefore watermark
        //  - whiteLabel: Business+ can strip Veefore branding
        //  - advancedReports: Pro+ unlock richer report sections
        //  - allowedFormats: which export formats the plan permits
        exportMode: (req as any).analyticsExportMode ?? 'watermarked_pdf',
        watermark: ((req as any).analyticsExportMode ?? 'watermarked_pdf') !== 'full' && !((req as any).analyticsWhiteLabel === true),
        whiteLabel: (req as any).analyticsWhiteLabel === true,
        advancedReports: (req as any).analyticsAdvancedReports === true,
        allowedFormats: (req as any).analyticsExportFormats ?? ['pdf'],
      },
      accountInfo, kpis, dailySeries, demographics,
      posts, topPosts, worstPosts, reels, carousels, images,
      aiSummary, aiInsights, recommendations, contentStrategy, opportunities,
    })
  } catch (err: any) {
    console.error('[REPORTS] Export data error:', err.message)
    res.status(500).json({ error: 'Failed to assemble report data' })
  }
})

export default router
