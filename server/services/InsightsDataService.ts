import crypto from 'crypto';

/**
 * InsightsDataService
 *
 * Centralises the heavy MongoDB aggregation used by the AI Performance Banner
 * and the Growth Recommendations features. It is intended to be called from the
 * BullMQ insights worker (off the request path) so plain HTTP requests read the
 * finished result from Redis instead of hammering MongoDB on every page load.
 *
 * Each builder returns both the assembled dataset AND a stable signature of the
 * inputs that affect the AI output, so callers can decide whether a cached
 * result is still valid.
 */

export interface BannerDataset {
  data: any;
  signature: string;
  period: 'day' | 'week' | 'month';
}

export interface RecommendationsDataset {
  data: any;
  signature: string;
}

const toObj = (m: any) => (!m ? undefined : m instanceof Map ? Object.fromEntries(m) : m);

/**
 * Build the period-scoped dataset for the AI Performance Overview banner.
 * Mirrors the previous inline route logic but lives here so the worker owns the
 * DB reads.
 */
export async function buildBannerData(
  workspaceId: string,
  period: 'day' | 'week' | 'month',
  clientMetrics?: any
): Promise<BannerDataset> {
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const periodLabel = period === 'day' ? 'Today' : period === 'week' ? 'This Week' : 'This Month';

  const { analyticsService } = await import('./index');
  const enrichedData: any = {
    period,
    periodLabel,
    periodDays: days,
    clientMetrics: clientMetrics || null,
  };

  try {
    const summary = await analyticsService.getPerformanceSummary(workspaceId, days);
    enrichedData.overview = summary.overview;
    enrichedData.growth = summary.growth;
    enrichedData.growthRate = summary.growthRate;
    enrichedData.posts = summary.posts;
    enrichedData.engagement = summary.engagement;
    enrichedData.reach = summary.reach;
    enrichedData.followers = summary.followers;
    enrichedData.audience = summary.audience;
    enrichedData.dailyTrend = (summary.dailyMetrics || []).slice(-days);
  } catch (e: any) {
    console.warn('[InsightsDataService] Banner performance summary unavailable:', e?.message);
  }

  try {
    const followerData = await analyticsService.getFollowerAnalytics(workspaceId);

    // Pick the right period-specific values
    const periodGained = period === 'day' ? followerData.dailyGained
      : period === 'week' ? followerData.weeklyGained
      : followerData.monthlyGained;
    const periodLost = period === 'day' ? followerData.dailyLost
      : period === 'week' ? followerData.weeklyLost
      : followerData.monthlyLost;
    const periodGrowth = period === 'day' ? followerData.dailyGrowth
      : period === 'week' ? followerData.weeklyGrowth
      : followerData.monthlyGrowth;
    const prevGrowth = period === 'day' ? followerData.prevDailyGrowth
      : period === 'week' ? followerData.prevWeeklyGrowth
      : followerData.prevMonthlyGrowth;
    const prevGained = period === 'day' ? followerData.prevDailyGained
      : period === 'week' ? followerData.prevWeeklyGained
      : followerData.prevMonthlyGained;

    const baseline = Math.max(1, (followerData.currentFollowers || 0) - (periodGrowth || 0));
    const periodFollowerGrowthPct = baseline > 0
      ? Number(((periodGrowth / baseline) * 100).toFixed(2))
      : 0;

    // Compare vs previous period for the banner context
    const gainedVsPrev = prevGained > 0
      ? Number((((periodGained - prevGained) / prevGained) * 100).toFixed(1))
      : null;

    enrichedData.followerTrend = {
      currentFollowers: followerData.currentFollowers,
      periodLabel,
      followerGrowth: periodGrowth,          // net (gained - lost)
      followerGained: periodGained,           // gross gained this period
      followerLost: periodLost,               // gross lost this period
      followerGrowthPercentage: periodFollowerGrowthPct,
      gainedVsPreviousPeriodPct: gainedVsPrev,
      prevPeriodGained: prevGained,
      prevPeriodNet: prevGrowth,
      direction: (periodGrowth || 0) > 0 ? 'up' : (periodGrowth || 0) < 0 ? 'down' : 'flat',
    };
  } catch (e: any) {
    console.warn('[InsightsDataService] Banner follower analytics unavailable:', e?.message);
  }

  // Also enrich with reach data from the Analytics collection for this period
  try {
    const { socialAccountRepository } = await import('../repositories/SocialAccountRepository');
    const { analyticsRepository } = await import('../repositories/AnalyticsRepository');
    const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId);
    const activePlatforms = accounts.map((a: any) => a.platform);
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevStart = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

    const [currentAgg, prevAgg] = await Promise.all([
      analyticsRepository.getAggregatedMetrics(workspaceId, startDate, now, activePlatforms),
      analyticsRepository.getAggregatedMetrics(workspaceId, prevStart, startDate, activePlatforms),
    ]);

    const reachField = period === 'day' ? 'reachDay' : period === 'week' ? 'reachWeek' : 'reachDays28';
    // Use the period-specific reach from the latest Analytics record
    const AnalyticsModel = (await import('../models/Analytics/Analytics')).AnalyticsModel;
    const latestRecord = await AnalyticsModel.findOne({ workspaceId })
      .sort({ date: -1 }).select(`${reachField} engagement`).lean();

    enrichedData.periodReach = {
      current: (latestRecord as any)?.[reachField] || currentAgg.totalReach || 0,
      previousPeriod: prevAgg.totalReach || 0,
    };
    enrichedData.periodEngagement = {
      current: currentAgg.avgEngagement || 0,
      totalLikes: currentAgg.totalLikes || 0,
      totalComments: currentAgg.totalComments || 0,
    };
  } catch (e: any) {
    console.warn('[InsightsDataService] Banner reach enrichment unavailable:', e?.message);
  }

  // Signature excludes volatile client metrics timestamps so an unchanged
  // dataset yields the same signature across requests.
  const signature = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      period,
      overview: enrichedData.overview,
      growth: enrichedData.growth,
      followerTrend: enrichedData.followerTrend,
      posts: enrichedData.posts,
      reach: enrichedData.reach,
      followers: enrichedData.followers,
      periodReach: enrichedData.periodReach,
    }))
    .digest('hex');

  return { data: enrichedData, signature, period };
}

/**
 * Build the COMPLETE account dataset for Growth Recommendations:
 * profile, follower trend, engagement/reach metrics, post-level performance,
 * posting frequency/cadence, best active times, audience demographics,
 * and media visual analysis via AI vision.
 */
export async function buildRecommendationsData(workspaceId: string): Promise<RecommendationsDataset> {
  const accountData: any = {};

  // 1) Connected social accounts
  const { socialAccountRepository } = await import('../repositories/SocialAccountRepository');
  const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId);

  accountData.accounts = (accounts || []).map((a: any) => ({
    platform: a.platform,
    username: a.username,
    followers: a.followersCount || 0,
    following: a.followingCount || 0,
    mediaCount: a.mediaCount || 0,
    biography: a.biography,
    engagementRate: a.engagementRate || a.avgEngagement || 0,
    avgLikes: a.avgLikes,
    avgComments: a.avgComments,
    avgReach: a.avgReach,
    totalLikes: a.totalLikes || 0,
    totalComments: a.totalComments || 0,
    totalReach: a.totalReach || 0,
    totalViews: a.totalViews || 0,
    totalShares: a.totalShares || 0,
    totalSaves: a.totalSaves || 0,
    accountReach: a.accountReach || 0,
    audience: {
      city: toObj(a.audienceCity),
      country: toObj(a.audienceCountry),
      genderAge: toObj(a.audienceGenderAge),
      activeTime: toObj(a.audienceActiveTime),
    },
  }));

  // 2) Performance summary + follower trend (30-day + 7-day comparison)
  const { analyticsService } = await import('./index');
  try {
    const [summary30, summary7] = await Promise.all([
      analyticsService.getPerformanceSummary(workspaceId, 30),
      analyticsService.getPerformanceSummary(workspaceId, 7).catch(() => null),
    ]);
    accountData.performance = {
      period: summary30.period,
      followers: summary30.followers,
      reach: summary30.reach,
      engagementRate: summary30.engagement,
      posts: summary30.posts,
      growthDelta: summary30.growthDelta,
      overview: summary30.overview,
      growthRate: summary30.growthRate,
      weekly: summary7 ? {
        reach: summary7.reach,
        engagementRate: summary7.engagement,
        posts: summary7.posts,
        followers: summary7.followers,
      } : null,
    };
    accountData.audienceInsights = summary30.audience;
  } catch (e: any) {
    console.warn('[InsightsDataService] Recs performance summary unavailable:', e?.message);
  }

  try {
    const followerData = await analyticsService.getFollowerAnalytics(workspaceId);
    accountData.followerTrend = {
      currentFollowers: followerData.currentFollowers,
      dailyGrowth: followerData.dailyGrowth,
      dailyGained: followerData.dailyGained,
      dailyLost: followerData.dailyLost,
      weeklyGrowth: followerData.weeklyGrowth,
      weeklyGained: followerData.weeklyGained,
      weeklyLost: followerData.weeklyLost,
      monthlyGrowth: followerData.monthlyGrowth,
      monthlyGained: followerData.monthlyGained,
      monthlyLost: followerData.monthlyLost,
      growthPercentage: followerData.growthPercentage,
      trend: followerData.trend,
    };
  } catch (e: any) {
    console.warn('[InsightsDataService] Recs follower analytics unavailable:', e?.message);
  }

  // 3) Post-level performance + posting frequency + media URLs for vision analysis
  try {
    const { ContentModel } = await import('../models/Content/Content');
    const now = new Date();
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const posts = await ContentModel.find({
      workspaceId,
      status: 'published',
      publishedAt: { $gte: since, $lte: now },
    })
      .sort({ publishedAt: -1 })
      .limit(100)
      .lean();

    const scored = posts.map((p: any) => {
      const m = p.metrics || {};
      const engagement = (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
      const engagementRate = m.reach > 0 ? ((engagement / m.reach) * 100).toFixed(2) : null;

      // Extract media URL for potential vision analysis
      const mediaUrls = p.contentData?.mediaUrls || p.contentData?.media || [];
      const primaryMediaUrl = Array.isArray(mediaUrls) && mediaUrls.length > 0
        ? mediaUrls[0]
        : (p.contentData?.mediaUrl || p.contentData?.thumbnailUrl || null);

      return {
        type: p.type,
        publishedAt: p.publishedAt,
        caption: typeof p.title === 'string' ? p.title.slice(0, 200) : undefined,
        likes: m.likes || 0,
        comments: m.comments || 0,
        shares: m.shares || 0,
        saves: m.saves || 0,
        views: m.views || 0,
        reach: m.reach || 0,
        impressions: m.impressions || 0,
        engagement,
        engagementRate,
        mediaUrl: primaryMediaUrl,  // for vision analysis
      };
    });

    const totalPosts90 = posts.length;
    let postsPerWeek = 0;
    let daysSinceLastPost: number | null = null;
    let avgGapDays: number | null = null;
    if (totalPosts90 > 0) {
      const dates = posts
        .map((p: any) => (p.publishedAt ? new Date(p.publishedAt).getTime() : null))
        .filter((t: number | null): t is number => t !== null)
        .sort((a: number, b: number) => b - a);
      if (dates.length > 0) {
        daysSinceLastPost = Math.floor((now.getTime() - dates[0]) / (1000 * 60 * 60 * 24));
        const spanDays = Math.max(1, (dates[0] - dates[dates.length - 1]) / (1000 * 60 * 60 * 24));
        postsPerWeek = Number(((dates.length / spanDays) * 7).toFixed(2));
        if (dates.length > 1) {
          let gapSum = 0;
          for (let i = 0; i < dates.length - 1; i++) gapSum += dates[i] - dates[i + 1];
          avgGapDays = Number((gapSum / (dates.length - 1) / (1000 * 60 * 60 * 24)).toFixed(1));
        }
      }
    }

    const formatMix: Record<string, number> = {};
    for (const p of posts) {
      const t = (p as any).type || 'unknown';
      formatMix[t] = (formatMix[t] || 0) + 1;
    }

    const sortedByEngagement = [...scored].sort((a, b) => b.engagement - a.engagement);
    const topPosts = sortedByEngagement.slice(0, 5);
    const worstPosts = sortedByEngagement.slice(-3);

    // Separate by media type for format-specific analysis
    const isReel = (p: any) => ['reel', 'video', 'REEL', 'VIDEO'].includes(p.type || '');
    const isImage = (p: any) => !isReel(p);

    const topReels   = sortedByEngagement.filter(isReel).slice(0, 3);
    const topImages  = sortedByEngagement.filter(isImage).slice(0, 3);
    const worstReels  = [...sortedByEngagement].reverse().filter(isReel).slice(0, 3);
    const worstImages = [...sortedByEngagement].reverse().filter(isImage).slice(0, 3);

    accountData.content = {
      totalPostsLast90Days: totalPosts90,
      postsPerWeek,
      daysSinceLastPost,
      avgGapBetweenPostsDays: avgGapDays,
      formatMix,
      topPosts,
      worstPosts,
      topReels,
      topImages,
      worstReels,
      worstImages,
      recentPosts: scored.slice(0, 10),
    };

    // 4) Media Vision Analysis — analyze top AND worst performing posts across
    //    both images and reels so the AI can give format-specific feedback.
    //    - Top 3 images:  visual quality, composition, color, text overlay
    //    - Top 3 reels:   video/visual quality via Gemini video vision
    //    - Worst 3 images: what makes them underperform visually
    //    - Worst 3 reels:  what makes them underperform
    try {
      const { aiServiceManager } = await import('./AIServiceManager');

      const analyzePost = async (post: any, performanceTier: 'top' | 'worst') => {
        if (!post.mediaUrl) return null;
        try {
          const isVideoPost = isReel(post)
            || post.mediaUrl.includes('.mp4')
            || post.mediaUrl.includes('.mov')
            || post.mediaUrl.includes('.webm');

          const visionResult = await aiServiceManager.analyzeContentImage(
            post.mediaUrl,
            {
              engagement: post.engagement,
              likes: post.likes,
              comments: post.comments,
              reach: post.reach,
              type: post.type,
              caption: post.caption,
            }
          );

          if (!visionResult) return null;

          return {
            postCaption: post.caption?.slice(0, 120),
            postType: post.type,
            mediaType: isVideoPost ? 'video' : 'image',
            performanceTier,
            engagement: post.engagement,
            reach: post.reach,
            views: post.views,
            ...visionResult,
          };
        } catch (ve: any) {
          console.warn(`[InsightsDataService] Vision analysis failed for ${post.type} post:`, ve?.message);
          return null;
        }
      };

      // Run all vision analyses in parallel (up to 12 posts total)
      const candidatePosts = [
        ...topImages.map(p => ({ post: p, tier: 'top' as const })),
        ...topReels.map(p => ({ post: p, tier: 'top' as const })),
        ...worstImages.slice(0, 2).map(p => ({ post: p, tier: 'worst' as const })), // limit worst to avoid too many AI calls
        ...worstReels.slice(0, 2).map(p => ({ post: p, tier: 'worst' as const })),
      ].filter(({ post }) => !!post.mediaUrl);

      const visionResults = await Promise.allSettled(
        candidatePosts.map(({ post, tier }) => analyzePost(post, tier))
      );

      const visionAnalyses = visionResults
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => (r as PromiseFulfilledResult<any>).value);

      if (visionAnalyses.length > 0) {
        const topImageAnalyses = visionAnalyses.filter(a => a.performanceTier === 'top' && a.mediaType === 'image');
        const topVideoAnalyses = visionAnalyses.filter(a => a.performanceTier === 'top' && a.mediaType === 'video');
        const worstImageAnalyses = visionAnalyses.filter(a => a.performanceTier === 'worst' && a.mediaType === 'image');
        const worstVideoAnalyses = visionAnalyses.filter(a => a.performanceTier === 'worst' && a.mediaType === 'video');

        accountData.mediaAnalysis = {
          analyzed: visionAnalyses.length,
          topImages: topImageAnalyses,
          topVideos: topVideoAnalyses,
          worstImages: worstImageAnalyses,
          worstVideos: worstVideoAnalyses,
          allAnalyses: visionAnalyses,
          summary: `Analyzed ${visionAnalyses.length} posts via AI vision: `
            + `${topImageAnalyses.length} top images, ${topVideoAnalyses.length} top reels, `
            + `${worstImageAnalyses.length} worst images, ${worstVideoAnalyses.length} worst reels.`,
        };
      }
    } catch (ve: any) {
      console.warn('[InsightsDataService] Vision analysis step unavailable:', ve?.message);
    }
  } catch (e: any) {
    console.warn('[InsightsDataService] Recs content/posting-frequency analysis unavailable:', e?.message);
  }

  // 5) Best time to post data — feeds timing recommendations
  try {
    const { getSmartBestTime } = await import('./bestTimeService');
    const bestTime = await getSmartBestTime(workspaceId);
    if (bestTime?.bestSlot) {
      accountData.bestTimeToPost = {
        bestDow: bestTime.bestSlot.dow,
        bestDayName: bestTime.bestSlot.dayName,
        bestHour: bestTime.bestSlot.hour,
        bestHourLabel: bestTime.bestSlot.hourLabel,
        confidence: bestTime.confidence,
        confidenceLevel: bestTime.confidenceLevel,
        topSlots: (bestTime.topSlots || []).slice(0, 3).map((s: any) => ({
          dayName: s.dayName,
          hourLabel: s.hourLabel,
          score: s.score,
        })),
      };
    }
  } catch (e: any) {
    console.warn('[InsightsDataService] Recs best-time data unavailable:', e?.message);
  }

  // 6) Recent AnalyticsDailyMetric data — real follower gains/losses per day
  try {
    const AnalyticsDailyMetricModel = (await import('../models/Analytics/AnalyticsDailyMetric')).default;
    const igAccounts = (accounts || []).filter((a: any) => a.platform === 'instagram' && a.accountId);
    const accountIds = igAccounts.map((a: any) => a.accountId);

    if (accountIds.length > 0) {
      const now = new Date();
      const since28 = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const toYmd = (d: Date) => d.toISOString().slice(0, 10);

      const followRows = await AnalyticsDailyMetricModel.find({
        accountId: { $in: accountIds },
        metricGroup: 'follows_and_unfollows',
        date: { $gte: toYmd(since28), $lte: toYmd(now) },
      }).select('date values').lean();

      if (followRows.length > 0) {
        let totalGained28 = 0, totalLost28 = 0;
        const dailyBreakdown: any[] = [];
        for (const r of followRows) {
          const v = (r as any).values || {};
          const g = typeof v.gained === 'number' ? v.gained : 0;
          const l = typeof v.lost === 'number' ? v.lost : 0;
          totalGained28 += g;
          totalLost28 += l;
          dailyBreakdown.push({ date: (r as any).date, gained: g, lost: l, net: g - l });
        }
        accountData.followerFlowLast28Days = {
          totalGained: totalGained28,
          totalLost: totalLost28,
          netChange: totalGained28 - totalLost28,
          churnRate: totalGained28 > 0 ? Number((totalLost28 / totalGained28 * 100).toFixed(1)) : 0,
          dailyBreakdown: dailyBreakdown.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14),
        };
      }
    }
  } catch (e: any) {
    console.warn('[InsightsDataService] Recs follower flow data unavailable:', e?.message);
  }

  const signature = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      accounts: accountData.accounts,
      performance: accountData.performance,
      followerTrend: accountData.followerTrend,
      content: accountData.content ? {
        totalPostsLast90Days: accountData.content.totalPostsLast90Days,
        postsPerWeek: accountData.content.postsPerWeek,
        formatMix: accountData.content.formatMix,
      } : null,
      followerFlowLast28Days: accountData.followerFlowLast28Days,
    }))
    .digest('hex');

  return { data: accountData, signature };
}

/**
 * Compose a signature that also factors in the AI-config fields which change
 * the generated output (so changing the model/goal/persona regenerates).
 */
export function withConfigSignature(dataSignature: string, preferences: any): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      dataSignature,
      cfg: {
        aiModel: preferences?.aiModel || 'veegpt-hybrid',
        creativityLevel: preferences?.creativityLevel ?? 0.7,
        optimizationGoals: preferences?.optimizationGoals || 'Engagement',
        aiPersona: preferences?.aiPersona || '',
        captionStyle: preferences?.captionStyle || '',
        multilingual: preferences?.multilingual || 'auto',
      },
    }))
    .digest('hex');
}
