import { MongoClient } from 'mongodb';
import { VoiceProfileService } from './VoiceProfileService';
import { ViralPatternService } from './ViralPatternService';
import { FeedbackCaptureService } from './FeedbackCaptureService';
import { GeneratedCaptionModel } from '../models/AI/GeneratedCaption';
import { CaptionFeedbackModel } from '../models/AI/CaptionFeedback';
import { user_input } from '../utils/user-interaction';

/**
 * Profile Update Scheduler Service
 * 
 * Implements background jobs for continuous learning and profile optimization.
 * 
 * Tasks:
 * - Monthly voice profile updates based on accumulated feedback
 * - Pattern preference learning from user selections
 * - Performance correlation analysis
 * - Declining acceptance detection with recalibration triggers
 * 
 * Requirements: 10.4, 10.5, 10.6
 */

export interface ProfileUpdateJobResult {
  userId: string;
  workspaceId: string;
  updateType: 'voice_profile' | 'pattern_preference' | 'performance_correlation';
  updatesApplied: number;
  improvements: string[];
  nextScheduledUpdate?: Date;
}

export interface AcceptanceMetrics {
  totalGenerated: number;
  totalAccepted: number;
  totalRejected: number;
  totalEdited: number;
  acceptanceRate: number;
  rejectionRate: number;
  heavyEditRate: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface RecalibrationTrigger {
  triggered: boolean;
  reason: string;
  metrics: AcceptanceMetrics;
  recommendations: string[];
  severity: 'low' | 'medium' | 'high';
}

export class ProfileUpdateScheduler {
  private voiceProfileService: VoiceProfileService;
  private viralPatternService: ViralPatternService;
  private feedbackCaptureService: FeedbackCaptureService;
  private monthlyUpdateInterval: NodeJS.Timeout | null = null;
  private patternLearningInterval: NodeJS.Timeout | null = null;
  private acceptanceCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    mongoClient: MongoClient,
    dbName: string
  ) {
    this.voiceProfileService = new VoiceProfileService(mongoClient, dbName);
    this.viralPatternService = new ViralPatternService(mongoClient, dbName);
    this.feedbackCaptureService = new FeedbackCaptureService(mongoClient, dbName);
  }

  /**
   * Start all background scheduler jobs
   */
  start(): void {
    console.log('[ProfileUpdateScheduler] Starting background profile update jobs');

    // Schedule monthly voice profile updates (runs on the 1st of each month)
    this.scheduleMonthlyVoiceProfileUpdate();

    // Schedule pattern preference learning (runs daily)
    this.schedulePatternPreferenceLearning();

    // Schedule declining acceptance detection (runs daily)
    this.scheduleDecliningAcceptanceCheck();

    console.log('[ProfileUpdateScheduler] All jobs scheduled successfully');
  }

  /**
   * Stop all background scheduler jobs
   */
  stop(): void {
    console.log('[ProfileUpdateScheduler] Stopping background profile update jobs');

    if (this.monthlyUpdateInterval) {
      clearInterval(this.monthlyUpdateInterval);
      this.monthlyUpdateInterval = null;
    }

    if (this.patternLearningInterval) {
      clearInterval(this.patternLearningInterval);
      this.patternLearningInterval = null;
    }

    if (this.acceptanceCheckInterval) {
      clearInterval(this.acceptanceCheckInterval);
      this.acceptanceCheckInterval = null;
    }

    console.log('[ProfileUpdateScheduler] All jobs stopped');
  }

  /**
   * Schedule monthly voice profile update job
   * Runs on the 1st of each month to update profiles based on accumulated feedback
   * 
   * Requirement: 10.4
   */
  private scheduleMonthlyVoiceProfileUpdate(): void {
    // Calculate milliseconds until next month's 1st day at midnight
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    const msUntilNextMonth = nextMonth.getTime() - now.getTime();

    // Schedule first run
    setTimeout(() => {
      this.runMonthlyVoiceProfileUpdate();

      // Then schedule recurring monthly updates (every 30 days)
      this.monthlyUpdateInterval = setInterval(
        () => this.runMonthlyVoiceProfileUpdate(),
        30 * 24 * 60 * 60 * 1000 // 30 days
      );
    }, msUntilNextMonth);

    console.log(`[ProfileUpdateScheduler] Monthly voice profile update scheduled for ${nextMonth.toISOString()}`);
  }

  /**
   * Run monthly voice profile update for all users
   * Updates voice profiles based on feedback from the past month
   * 
   * Requirement: 10.4
   */
  private async runMonthlyVoiceProfileUpdate(): Promise<void> {
    console.log('[ProfileUpdateScheduler] Running monthly voice profile update job');

    try {
      // Get all unique users with feedback in the last month
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const usersWithFeedback = await CaptionFeedbackModel.aggregate([
        {
          $match: {
            timestamp: { $gte: oneMonthAgo }
          }
        },
        {
          $group: {
            _id: { userId: '$userId', workspaceId: '$workspaceId' }
          }
        }
      ]);

      console.log(`[ProfileUpdateScheduler] Found ${usersWithFeedback.length} users with feedback this month`);

      // Process each user
      for (const user of usersWithFeedback) {
        const { userId, workspaceId } = user._id;

        try {
          await this.updateVoiceProfileFromFeedback(userId, workspaceId);
          console.log(`[ProfileUpdateScheduler] Updated voice profile for user ${userId}`);
        } catch (error) {
          console.error(`[ProfileUpdateScheduler] Failed to update profile for user ${userId}:`, error);
        }
      }

      console.log('[ProfileUpdateScheduler] Monthly voice profile update completed');
    } catch (error) {
      console.error('[ProfileUpdateScheduler] Error in monthly voice profile update:', error);
    }
  }

  /**
   * Update voice profile based on accumulated feedback from the past month
   * 
   * Requirement: 10.4
   */
  async updateVoiceProfileFromFeedback(
    userId: string,
    workspaceId: string
  ): Promise<ProfileUpdateJobResult> {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Get all feedback from the past month
    const recentFeedback = await this.feedbackCaptureService.getRecentFeedback(
      userId,
      workspaceId,
      1000 // Get up to 1000 recent feedback items
    );

    const monthFeedback = recentFeedback.filter(f => f.timestamp >= oneMonthAgo);

    if (monthFeedback.length === 0) {
      return {
        userId,
        workspaceId,
        updateType: 'voice_profile',
        updatesApplied: 0,
        improvements: ['No feedback to process this month'],
        nextScheduledUpdate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };
    }

    let updatesApplied = 0;
    const improvements: string[] = [];

    // Process selection feedback
    const selectionFeedback = monthFeedback.filter(f => f.feedbackType === 'selection');
    for (const feedback of selectionFeedback) {
      const generatedCaption = await GeneratedCaptionModel.findById(feedback.generatedCaptionId);
      if (generatedCaption && feedback.selectedVariation !== undefined) {
        const selectedVariation = generatedCaption.variations[feedback.selectedVariation];
        const rejectedVariations = (feedback.rejectedVariations || [])
          .map(idx => generatedCaption.variations[idx]?.caption)
          .filter(Boolean);

        if (selectedVariation?.caption) {
          await this.voiceProfileService.updateFromSelection(
            userId,
            workspaceId,
            selectedVariation.caption,
            rejectedVariations
          );
          updatesApplied++;
        }
      }
    }

    if (selectionFeedback.length > 0) {
      improvements.push(`Processed ${selectionFeedback.length} caption selections`);
    }

    // Process edit feedback
    const editFeedback = monthFeedback.filter(f => f.feedbackType === 'edit');
    for (const feedback of editFeedback) {
      const generatedCaption = await GeneratedCaptionModel.findById(feedback.generatedCaptionId);
      if (generatedCaption?.originalCaption && generatedCaption?.editedCaption) {
        await this.voiceProfileService.updateFromEdit(
          userId,
          workspaceId,
          generatedCaption.originalCaption,
          generatedCaption.editedCaption
        );
        updatesApplied++;
      }
    }

    if (editFeedback.length > 0) {
      improvements.push(`Learned from ${editFeedback.length} caption edits`);
    }

    // Process published post feedback with performance data
    const publishedCaptions = await GeneratedCaptionModel.find({
      userId,
      workspaceId,
      publishedAt: { $gte: oneMonthAgo },
      'actualMetrics.likes': { $exists: true } // Has performance data
    }).limit(100);

    for (const caption of publishedCaptions) {
      const selectedVariation = caption.variations[caption.selectedVariationIndex || 0];
      if (selectedVariation?.caption) {
        await this.voiceProfileService.updateFromPublishedPost(
          userId,
          workspaceId,
          selectedVariation.caption,
          caption.actualMetrics
        );
        updatesApplied++;
      }
    }

    if (publishedCaptions.length > 0) {
      improvements.push(`Learned from ${publishedCaptions.length} published posts with performance data`);
    }

    improvements.push(`Total profile updates applied: ${updatesApplied}`);

    return {
      userId,
      workspaceId,
      updateType: 'voice_profile',
      updatesApplied,
      improvements,
      nextScheduledUpdate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
  }

  /**
   * Schedule pattern preference learning job
   * Runs daily to learn which viral patterns users prefer
   * 
   * Requirement: 10.5
   */
  private schedulePatternPreferenceLearning(): void {
    // Run daily at 2 AM
    const runDaily = () => {
      const now = new Date();
      const next2AM = new Date(now);
      next2AM.setHours(2, 0, 0, 0);
      
      if (next2AM <= now) {
        next2AM.setDate(next2AM.getDate() + 1);
      }

      const msUntilNext = next2AM.getTime() - now.getTime();

      setTimeout(() => {
        this.runPatternPreferenceLearning();
        this.patternLearningInterval = setInterval(
          () => this.runPatternPreferenceLearning(),
          24 * 60 * 60 * 1000 // 24 hours
        );
      }, msUntilNext);
    };

    runDaily();
    console.log('[ProfileUpdateScheduler] Pattern preference learning scheduled (daily at 2 AM)');
  }

  /**
   * Run pattern preference learning job
   * Analyzes which viral patterns users consistently choose or reject
   * 
   * Requirement: 10.5
   */
  private async runPatternPreferenceLearning(): Promise<void> {
    console.log('[ProfileUpdateScheduler] Running pattern preference learning job');

    try {
      // Get all feedback from the last 7 days
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const recentFeedback = await CaptionFeedbackModel.find({
        timestamp: { $gte: oneWeekAgo },
        feedbackType: 'selection',
        preferredPatterns: { $exists: true, $ne: [] }
      });

      // Aggregate pattern preferences by user
      const userPatternPreferences = new Map<string, {
        userId: string;
        workspaceId: string;
        preferredPatterns: Map<string, number>;
        rejectedPatterns: Map<string, number>;
      }>();

      for (const feedback of recentFeedback) {
        const key = `${feedback.userId}:${feedback.workspaceId}`;
        
        if (!userPatternPreferences.has(key)) {
          userPatternPreferences.set(key, {
            userId: feedback.userId,
            workspaceId: feedback.workspaceId,
            preferredPatterns: new Map(),
            rejectedPatterns: new Map()
          });
        }

        const userPref = userPatternPreferences.get(key)!;

        // Track preferred patterns
        feedback.preferredPatterns?.forEach(pattern => {
          const count = userPref.preferredPatterns.get(pattern) || 0;
          userPref.preferredPatterns.set(pattern, count + 1);
        });

        // Track rejected patterns
        feedback.rejectedPatterns?.forEach(pattern => {
          const count = userPref.rejectedPatterns.get(pattern) || 0;
          userPref.rejectedPatterns.set(pattern, count + 1);
        });
      }

      // Update pattern performance based on user preferences
      for (const [key, userPref] of userPatternPreferences) {
        // Update success rates for preferred patterns
        for (const [patternId, count] of userPref.preferredPatterns) {
          await this.viralPatternService.updatePatternPerformance(
            patternId,
            1.0 // Success indicator
          );
        }

        console.log(`[ProfileUpdateScheduler] Updated pattern preferences for user ${userPref.userId}`);
      }

      console.log('[ProfileUpdateScheduler] Pattern preference learning completed');
    } catch (error) {
      console.error('[ProfileUpdateScheduler] Error in pattern preference learning:', error);
    }
  }

  /**
   * Schedule declining acceptance detection job
   * Runs daily to check if users are rejecting too many captions
   * 
   * Requirement: 10.6
   */
  private scheduleDecliningAcceptanceCheck(): void {
    // Run daily at 3 AM
    const runDaily = () => {
      const now = new Date();
      const next3AM = new Date(now);
      next3AM.setHours(3, 0, 0, 0);
      
      if (next3AM <= now) {
        next3AM.setDate(next3AM.getDate() + 1);
      }

      const msUntilNext = next3AM.getTime() - now.getTime();

      setTimeout(() => {
        this.runDecliningAcceptanceCheck();
        this.acceptanceCheckInterval = setInterval(
          () => this.runDecliningAcceptanceCheck(),
          24 * 60 * 60 * 1000 // 24 hours
        );
      }, msUntilNext);
    };

    runDaily();
    console.log('[ProfileUpdateScheduler] Declining acceptance check scheduled (daily at 3 AM)');
  }

  /**
   * Run declining acceptance detection
   * Checks if users are rejecting >30% of captions and triggers recalibration
   * 
   * Requirement: 10.6
   */
  private async runDecliningAcceptanceCheck(): Promise<void> {
    console.log('[ProfileUpdateScheduler] Running declining acceptance detection');

    try {
      // Get all users who have generated captions in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const usersWithActivity = await GeneratedCaptionModel.aggregate([
        {
          $match: {
            generatedAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: { userId: '$userId', workspaceId: '$workspaceId' }
          }
        }
      ]);

      console.log(`[ProfileUpdateScheduler] Checking acceptance rates for ${usersWithActivity.length} active users`);

      for (const user of usersWithActivity) {
        const { userId, workspaceId } = user._id;

        try {
          const metrics = await this.calculateAcceptanceMetrics(userId, workspaceId);
          const trigger = await this.detectDecliningAcceptance(metrics);

          if (trigger.triggered) {
            console.log(`[ProfileUpdateScheduler] 🚨 Declining acceptance detected for user ${userId}`);
            console.log(`[ProfileUpdateScheduler] Reason: ${trigger.reason}`);
            console.log(`[ProfileUpdateScheduler] Rejection rate: ${metrics.rejectionRate.toFixed(1)}%`);
            
            // Trigger recalibration workflow
            await this.triggerRecalibration(userId, workspaceId, trigger);
          }
        } catch (error) {
          console.error(`[ProfileUpdateScheduler] Failed to check acceptance for user ${userId}:`, error);
        }
      }

      console.log('[ProfileUpdateScheduler] Declining acceptance check completed');
    } catch (error) {
      console.error('[ProfileUpdateScheduler] Error in declining acceptance check:', error);
    }
  }

  /**
   * Calculate acceptance metrics for a user
   * Tracks acceptance, rejection, and edit rates
   * 
   * Requirement: 10.6
   */
  async calculateAcceptanceMetrics(
    userId: string,
    workspaceId: string
  ): Promise<AcceptanceMetrics> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all generated captions from the last 30 days
    const generatedCaptions = await GeneratedCaptionModel.find({
      userId,
      workspaceId,
      generatedAt: { $gte: thirtyDaysAgo }
    });

    const totalGenerated = generatedCaptions.length;

    if (totalGenerated === 0) {
      return {
        totalGenerated: 0,
        totalAccepted: 0,
        totalRejected: 0,
        totalEdited: 0,
        acceptanceRate: 0,
        rejectionRate: 0,
        heavyEditRate: 0,
        trend: 'stable'
      };
    }

    // Count accepted (published unchanged), rejected, and edited
    const totalAccepted = generatedCaptions.filter(
      c => c.publishedAt && !c.wasEdited
    ).length;

    const totalEdited = generatedCaptions.filter(
      c => c.wasEdited && c.editDistance && c.editDistance > 50 // Heavy edit threshold
    ).length;

    // Get rejection feedback
    const rejectionFeedback = await CaptionFeedbackModel.countDocuments({
      userId,
      workspaceId,
      feedbackType: 'rejection',
      timestamp: { $gte: thirtyDaysAgo }
    });

    const totalRejected = rejectionFeedback;

    // Calculate rates
    const acceptanceRate = (totalAccepted / totalGenerated) * 100;
    const rejectionRate = (totalRejected / totalGenerated) * 100;
    const heavyEditRate = (totalEdited / totalGenerated) * 100;

    // Determine trend by comparing last 15 days vs previous 15 days
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const recentGenerated = generatedCaptions.filter(
      c => c.generatedAt >= fifteenDaysAgo
    ).length;

    const recentRejected = await CaptionFeedbackModel.countDocuments({
      userId,
      workspaceId,
      feedbackType: 'rejection',
      timestamp: { $gte: fifteenDaysAgo }
    });

    const olderGenerated = generatedCaptions.filter(
      c => c.generatedAt < fifteenDaysAgo
    ).length;

    const olderRejected = totalRejected - recentRejected;

    const recentRejectionRate = recentGenerated > 0 
      ? (recentRejected / recentGenerated) * 100 
      : 0;
    
    const olderRejectionRate = olderGenerated > 0 
      ? (olderRejected / olderGenerated) * 100 
      : 0;

    let trend: 'improving' | 'stable' | 'declining';
    if (recentRejectionRate > olderRejectionRate + 10) {
      trend = 'declining';
    } else if (recentRejectionRate < olderRejectionRate - 10) {
      trend = 'improving';
    } else {
      trend = 'stable';
    }

    return {
      totalGenerated,
      totalAccepted,
      totalRejected,
      totalEdited,
      acceptanceRate,
      rejectionRate,
      heavyEditRate,
      trend
    };
  }

  /**
   * Detect declining acceptance and determine if recalibration is needed
   * Triggers when rejection rate > 30%
   * 
   * Requirement: 10.6
   */
  async detectDecliningAcceptance(
    metrics: AcceptanceMetrics
  ): Promise<RecalibrationTrigger> {
    const recommendations: string[] = [];
    let triggered = false;
    let reason = '';
    let severity: 'low' | 'medium' | 'high' = 'low';

    // Check if rejection rate exceeds 30% threshold
    if (metrics.rejectionRate > 30) {
      triggered = true;
      reason = `High rejection rate detected: ${metrics.rejectionRate.toFixed(1)}% (threshold: 30%)`;
      
      if (metrics.rejectionRate > 50) {
        severity = 'high';
        recommendations.push('URGENT: Over 50% of captions are being rejected');
        recommendations.push('Immediate voice profile recalibration recommended');
      } else if (metrics.rejectionRate > 40) {
        severity = 'medium';
        recommendations.push('Significant rejection rate detected');
        recommendations.push('Voice profile recalibration recommended');
      } else {
        severity = 'low';
        recommendations.push('Elevated rejection rate detected');
        recommendations.push('Consider voice profile recalibration');
      }
    }

    // Check if heavy edit rate is high (indicates captions need lots of changes)
    if (metrics.heavyEditRate > 40) {
      triggered = true;
      if (!reason) {
        reason = `High heavy edit rate: ${metrics.heavyEditRate.toFixed(1)}%`;
      }
      recommendations.push(`${metrics.heavyEditRate.toFixed(1)}% of captions require significant editing`);
      recommendations.push('Generated captions may not match your current voice');
    }

    // Check trend
    if (metrics.trend === 'declining') {
      triggered = true;
      if (!reason) {
        reason = 'Declining acceptance trend detected';
      }
      recommendations.push('Caption acceptance is getting worse over time');
      recommendations.push('Recent rejections are significantly higher than before');
    }

    // Add actionable recommendations
    if (triggered) {
      recommendations.push('Suggested actions:');
      recommendations.push('1. Review and update sample captions with recent successful posts');
      recommendations.push('2. Recalibrate voice profile to match current writing style');
      recommendations.push('3. Check if content niche or target audience has changed');
      recommendations.push('4. Review rejected captions to identify common issues');
    }

    return {
      triggered,
      reason,
      metrics,
      recommendations,
      severity
    };
  }

  /**
   * Trigger recalibration workflow
   * Notifies the system that a user needs profile recalibration
   * 
   * Requirement: 10.6
   */
  async triggerRecalibration(
    userId: string,
    workspaceId: string,
    trigger: RecalibrationTrigger
  ): Promise<void> {
    console.log(`[ProfileUpdateScheduler] Triggering recalibration for user ${userId}`);
    console.log(`[ProfileUpdateScheduler] Severity: ${trigger.severity}`);
    console.log(`[ProfileUpdateScheduler] Reason: ${trigger.reason}`);

    // Store recalibration trigger in database for UI to display
    // This would typically be stored in a user notifications collection
    // For now, we'll log it and could expand to send notifications

    try {
      // Get recent published captions to use for recalibration
      const recentPublishedCaptions = await GeneratedCaptionModel.find({
        userId,
        workspaceId,
        publishedAt: { $exists: true },
        'actualMetrics.likes': { $exists: true } // Has performance data
      })
      .sort({ publishedAt: -1 })
      .limit(10);

      const captionsForRecalibration = recentPublishedCaptions
        .map(c => {
          const selectedVar = c.variations[c.selectedVariationIndex || 0];
          return c.editedCaption || selectedVar?.caption;
        })
        .filter(Boolean) as string[];

      if (captionsForRecalibration.length >= 5) {
        // Automatically recalibrate if we have enough recent data
        console.log(`[ProfileUpdateScheduler] Auto-recalibrating profile with ${captionsForRecalibration.length} recent captions`);
        
        await this.voiceProfileService.analyzeAndCreateProfile(
          userId,
          workspaceId,
          captionsForRecalibration
        );

        console.log('[ProfileUpdateScheduler] Voice profile recalibrated successfully');
      } else {
        console.log('[ProfileUpdateScheduler] Insufficient recent captions for auto-recalibration');
        console.log('[ProfileUpdateScheduler] User will need to manually provide sample captions');
      }

      // Log recalibration event
      console.log('[ProfileUpdateScheduler] Recalibration trigger stored:', {
        userId,
        workspaceId,
        severity: trigger.severity,
        reason: trigger.reason,
        metrics: trigger.metrics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[ProfileUpdateScheduler] Error triggering recalibration:', error);
      throw error;
    }
  }

  /**
   * Build performance correlation analyzer
   * Correlates caption characteristics with actual engagement performance
   * 
   * Requirement: 10.5
   */
  async analyzePerformanceCorrelations(
    userId: string,
    workspaceId: string
  ): Promise<ProfileUpdateJobResult> {
    console.log(`[ProfileUpdateScheduler] Analyzing performance correlations for user ${userId}`);

    const improvements: string[] = [];
    let updatesApplied = 0;

    try {
      // Get captions with actual performance data from the last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const captionsWithPerformance = await GeneratedCaptionModel.find({
        userId,
        workspaceId,
        publishedAt: { $gte: ninetyDaysAgo },
        'actualMetrics.likes': { $exists: true },
        'actualMetrics.impressions': { $gt: 0 }
      }).limit(100);

      if (captionsWithPerformance.length < 5) {
        improvements.push('Insufficient performance data for correlation analysis');
        return {
          userId,
          workspaceId,
          updateType: 'performance_correlation',
          updatesApplied: 0,
          improvements
        };
      }

      improvements.push(`Analyzing ${captionsWithPerformance.length} captions with performance data`);

      // Calculate engagement rates
      const captionPerformance = captionsWithPerformance.map(caption => {
        const metrics = caption.actualMetrics!;
        const engagementRate = (
          (metrics.likes + metrics.comments + (metrics.saves || 0)) / 
          metrics.impressions
        ) * 100;

        const selectedVariation = caption.variations[caption.selectedVariationIndex || 0];

        return {
          captionId: caption._id.toString(),
          engagementRate,
          patterns: selectedVariation?.usedPatterns || [],
          hooks: selectedVariation?.usedHooks || [],
          authenticityScore: selectedVariation?.authenticityScore || 0,
          caption: selectedVariation?.caption || ''
        };
      });

      // Sort by engagement rate
      captionPerformance.sort((a, b) => b.engagementRate - a.engagementRate);

      // Identify top performing patterns (top 20%)
      const topPerformers = captionPerformance.slice(0, Math.ceil(captionPerformance.length * 0.2));
      const bottomPerformers = captionPerformance.slice(Math.floor(captionPerformance.length * 0.8));

      // Count pattern occurrences in top vs bottom performers
      const topPatternCounts = new Map<string, number>();
      const bottomPatternCounts = new Map<string, number>();

      topPerformers.forEach(perf => {
        [...perf.patterns, ...perf.hooks].forEach(pattern => {
          topPatternCounts.set(pattern, (topPatternCounts.get(pattern) || 0) + 1);
        });
      });

      bottomPerformers.forEach(perf => {
        [...perf.patterns, ...perf.hooks].forEach(pattern => {
          bottomPatternCounts.set(pattern, (bottomPatternCounts.get(pattern) || 0) + 1);
        });
      });

      // Update viral pattern performance based on correlations
      for (const [patternId, topCount] of topPatternCounts) {
        const bottomCount = bottomPatternCounts.get(patternId) || 0;
        
        // If pattern appears more in top performers, boost its performance score
        if (topCount > bottomCount) {
          const avgTopEngagement = topPerformers
            .filter(p => [...p.patterns, ...p.hooks].includes(patternId))
            .reduce((sum, p) => sum + p.engagementRate, 0) / topCount;

          await this.viralPatternService.updatePatternPerformance(
            patternId,
            avgTopEngagement
          );

          updatesApplied++;
        }
      }

      improvements.push(`Updated performance scores for ${updatesApplied} patterns`);

      // Identify consistently high-performing patterns
      const consistentWinners = Array.from(topPatternCounts.entries())
        .filter(([pattern, count]) => {
          const bottomCount = bottomPatternCounts.get(pattern) || 0;
          return count >= 2 && count > bottomCount * 2; // Appears 2x more in top
        })
        .map(([pattern]) => pattern);

      if (consistentWinners.length > 0) {
        improvements.push(`Identified ${consistentWinners.length} consistently high-performing patterns`);
      }

      // Calculate average authenticity score correlation
      const avgTopAuthenticity = topPerformers.reduce((sum, p) => sum + p.authenticityScore, 0) / topPerformers.length;
      const avgBottomAuthenticity = bottomPerformers.reduce((sum, p) => sum + p.authenticityScore, 0) / bottomPerformers.length;

      if (avgTopAuthenticity > avgBottomAuthenticity) {
        improvements.push(`Higher authenticity scores correlate with ${((avgTopAuthenticity - avgBottomAuthenticity) * 100).toFixed(1)}% better performance`);
      }

      console.log(`[ProfileUpdateScheduler] Performance correlation analysis completed for user ${userId}`);

      return {
        userId,
        workspaceId,
        updateType: 'performance_correlation',
        updatesApplied,
        improvements
      };
    } catch (error) {
      console.error('[ProfileUpdateScheduler] Error in performance correlation analysis:', error);
      throw error;
    }
  }
}
