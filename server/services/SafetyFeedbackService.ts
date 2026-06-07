/**
 * Safety Feedback Service
 * 
 * Handles user feedback on safety false positives and calibrates safety filters
 * based on user preferences while maintaining actual safety protections.
 * 
 * Task 22.2: Implement safety flag system
 * Requirements: 11.6 - Allow users to provide feedback on safety false positives
 * 
 * Key Features:
 * - Record user feedback on safety flags
 * - Learn from false positive feedback
 * - Calibrate per-user safety filters
 * - Maintain safety boundaries while respecting authentic voice
 */

import { SafetyFeedbackModel, SafetyCalibrationModel } from '../models/SafetyFeedback';
import type { SafetyFeedback, InsertSafetyFeedback, SafetyCalibration, InsertSafetyCalibration } from '../domain/types';

export class SafetyFeedbackService {
  /**
   * Submit safety feedback from user
   * 
   * @param feedback - Feedback details
   * @returns Created feedback record
   */
  async submitFeedback(feedback: InsertSafetyFeedback): Promise<SafetyFeedback> {
    console.log('[SafetyFeedbackService] Submitting feedback', {
      userId: feedback.userId,
      workspaceId: feedback.workspaceId,
      feedbackType: feedback.feedbackType,
      flaggedIssue: feedback.flaggedIssue,
    });

    const feedbackDoc = new SafetyFeedbackModel({
      ...feedback,
      status: 'pending',
      calibrationApplied: false,
    });

    const saved = await feedbackDoc.save();

    // Trigger async calibration update if this is a false positive
    if (feedback.feedbackType === 'false_positive' && feedback.userRating === 'authentic') {
      this.updateCalibration(feedback.userId, feedback.workspaceId, feedback).catch(err => {
        console.error('[SafetyFeedbackService] Error updating calibration:', err);
      });
    }

    return {
      id: saved._id.toString(),
      userId: saved.userId,
      workspaceId: saved.workspaceId,
      captionId: saved.captionId,
      feedbackType: saved.feedbackType,
      flaggedIssue: saved.flaggedIssue,
      userRating: saved.userRating,
      comment: saved.comment,
      caption: saved.caption,
      safetyLevel: saved.safetyLevel,
      originalSafetyScore: saved.originalSafetyScore,
      originalFlags: saved.originalFlags,
      status: saved.status,
      reviewedAt: saved.reviewedAt,
      calibrationApplied: saved.calibrationApplied,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Get calibration for user/workspace
   * 
   * @param userId - User ID
   * @param workspaceId - Workspace ID
   * @returns Safety calibration settings or default
   */
  async getCalibration(userId: string, workspaceId: string): Promise<SafetyCalibration | null> {
    const calibration = await SafetyCalibrationModel.findOne({
      userId,
      workspaceId,
    });

    if (!calibration) {
      return null;
    }

    return {
      id: calibration._id.toString(),
      userId: calibration.userId,
      workspaceId: calibration.workspaceId,
      allowedPatterns: calibration.allowedPatterns || [],
      sensitivePatterns: calibration.sensitivePatterns || [],
      customRules: calibration.customRules || [],
      falsePositiveCount: calibration.falsePositiveCount || 0,
      feedbackCount: calibration.feedbackCount || 0,
      lastCalibrationAt: calibration.lastCalibrationAt,
      createdAt: calibration.createdAt,
      updatedAt: calibration.updatedAt,
    };
  }

  /**
   * Update calibration based on feedback
   * 
   * This learns from user feedback to adjust safety filters while maintaining
   * actual safety protections.
   * 
   * @param userId - User ID
   * @param workspaceId - Workspace ID
   * @param feedback - Feedback that triggered the update
   */
  private async updateCalibration(
    userId: string,
    workspaceId: string,
    feedback: InsertSafetyFeedback
  ): Promise<void> {
    console.log('[SafetyFeedbackService] Updating calibration', {
      userId,
      workspaceId,
      feedbackType: feedback.feedbackType,
    });

    const now = new Date();

    const existingCalibration = await this.getCalibration(userId, workspaceId);

    if (!existingCalibration) {
      // Create new calibration
      const newCalibration = new SafetyCalibrationModel({
        userId,
        workspaceId,
        allowedPatterns: [],
        sensitivePatterns: [],
        customRules: [],
        falsePositiveCount: feedback.feedbackType === 'false_positive' ? 1 : 0,
        feedbackCount: 1,
        lastCalibrationAt: now,
      });

      // Add pattern to allowed list if user rated it as authentic
      if (feedback.userRating === 'authentic' && feedback.flaggedIssue) {
        newCalibration.allowedPatterns.push(this.normalizePattern(feedback.flaggedIssue));
      }

      await newCalibration.save();
    } else {
      // Update existing calibration
      const updates: any = {
        feedbackCount: existingCalibration.feedbackCount + 1,
        updatedAt: now,
      };

      if (feedback.feedbackType === 'false_positive') {
        updates.falsePositiveCount = existingCalibration.falsePositiveCount + 1;
        updates.lastCalibrationAt = now;

        // Add to allowed patterns if user rated as authentic
        if (feedback.userRating === 'authentic' && feedback.flaggedIssue) {
          const normalizedPattern = this.normalizePattern(feedback.flaggedIssue);
          
          if (!existingCalibration.allowedPatterns.includes(normalizedPattern)) {
            updates.allowedPatterns = [...existingCalibration.allowedPatterns, normalizedPattern];
          }
        }
      }

      if (feedback.feedbackType === 'missed_issue') {
        // Add to sensitive patterns if user marked something as inappropriate
        if (feedback.userRating === 'inappropriate' && feedback.flaggedIssue) {
          const normalizedPattern = this.normalizePattern(feedback.flaggedIssue);
          
          if (!existingCalibration.sensitivePatterns.includes(normalizedPattern)) {
            updates.sensitivePatterns = [...existingCalibration.sensitivePatterns, normalizedPattern];
          }
        }
      }

      await SafetyCalibrationModel.updateOne(
        { userId, workspaceId },
        { $set: updates }
      );
    }

    // Mark feedback as calibrated
    if (feedback.captionId) {
      await SafetyFeedbackModel.updateOne(
        { captionId: feedback.captionId },
        {
          $set: {
            status: 'calibrated',
            calibrationApplied: true,
            reviewedAt: now,
            updatedAt: now,
          },
        }
      );
    }

    console.log('[SafetyFeedbackService] Calibration updated successfully');
  }

  /**
   * Normalize a pattern for consistent matching
   * 
   * @param pattern - Raw pattern from feedback
   * @returns Normalized pattern
   */
  private normalizePattern(pattern: string): string {
    return pattern
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Check if a pattern is in user's allowed list
   * 
   * @param pattern - Pattern to check
   * @param calibration - User's calibration settings
   * @returns True if pattern is allowed
   */
  isPatternAllowed(pattern: string, calibration: SafetyCalibration | null): boolean {
    if (!calibration || calibration.allowedPatterns.length === 0) {
      return false;
    }

    const normalizedPattern = this.normalizePattern(pattern);
    return calibration.allowedPatterns.some(allowed => 
      normalizedPattern.includes(allowed) || allowed.includes(normalizedPattern)
    );
  }

  /**
   * Check if a pattern is in user's sensitive list (stricter filtering)
   * 
   * @param pattern - Pattern to check
   * @param calibration - User's calibration settings
   * @returns True if pattern is sensitive
   */
  isPatternSensitive(pattern: string, calibration: SafetyCalibration | null): boolean {
    if (!calibration || calibration.sensitivePatterns.length === 0) {
      return false;
    }

    const normalizedPattern = this.normalizePattern(pattern);
    return calibration.sensitivePatterns.some(sensitive => 
      normalizedPattern.includes(sensitive) || sensitive.includes(normalizedPattern)
    );
  }

  /**
   * Get feedback statistics for user/workspace
   * 
   * @param userId - User ID
   * @param workspaceId - Workspace ID
   * @returns Feedback statistics
   */
  async getFeedbackStats(userId: string, workspaceId: string): Promise<{
    totalFeedback: number;
    falsePositives: number;
    missedIssues: number;
    calibrationRequests: number;
    calibrationAccuracy: number;
  }> {
    const feedback = await SafetyFeedbackModel.find({
      userId,
      workspaceId,
    });

    const totalFeedback = feedback.length;
    const falsePositives = feedback.filter(f => f.feedbackType === 'false_positive').length;
    const missedIssues = feedback.filter(f => f.feedbackType === 'missed_issue').length;
    const calibrationRequests = feedback.filter(f => f.feedbackType === 'calibration_request').length;

    // Calculate calibration accuracy (lower false positive rate = better accuracy)
    const calibrationAccuracy = totalFeedback > 0 
      ? Math.max(0, 100 - (falsePositives / totalFeedback * 100))
      : 100;

    return {
      totalFeedback,
      falsePositives,
      missedIssues,
      calibrationRequests,
      calibrationAccuracy: Math.round(calibrationAccuracy),
    };
  }

  /**
   * Get recent feedback for user/workspace
   * 
   * @param userId - User ID
   * @param workspaceId - Workspace ID
   * @param limit - Maximum number of records to return
   * @returns Recent feedback records
   */
  async getRecentFeedback(
    userId: string,
    workspaceId: string,
    limit: number = 10
  ): Promise<SafetyFeedback[]> {
    const feedback = await SafetyFeedbackModel
      .find({ userId, workspaceId })
      .sort({ createdAt: -1 })
      .limit(limit);

    return feedback.map(f => ({
      id: f._id.toString(),
      userId: f.userId,
      workspaceId: f.workspaceId,
      captionId: f.captionId,
      feedbackType: f.feedbackType,
      flaggedIssue: f.flaggedIssue,
      userRating: f.userRating,
      comment: f.comment,
      caption: f.caption,
      safetyLevel: f.safetyLevel,
      originalSafetyScore: f.originalSafetyScore,
      originalFlags: f.originalFlags,
      status: f.status,
      reviewedAt: f.reviewedAt,
      calibrationApplied: f.calibrationApplied,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  /**
   * Apply calibration to safety check
   * 
   * This adjusts safety filtering based on user's learned preferences
   * while maintaining core safety protections.
   * 
   * @param issues - Original safety issues
   * @param calibration - User's calibration settings
   * @returns Filtered issues based on calibration
   */
  applyCalibrationToIssues(
    issues: string[],
    calibration: SafetyCalibration | null
  ): string[] {
    if (!calibration || calibration.allowedPatterns.length === 0) {
      return issues;
    }

    // Filter out issues that match allowed patterns
    // But keep critical safety issues (hate speech, personal info, etc.)
    const CRITICAL_ISSUE_KEYWORDS = [
      'hate speech',
      'discriminatory',
      'personal information',
      'ssn',
      'credit card',
      'prohibited topic',
    ];

    return issues.filter(issue => {
      const lowerIssue = issue.toLowerCase();
      
      // Always keep critical safety issues
      if (CRITICAL_ISSUE_KEYWORDS.some(keyword => lowerIssue.includes(keyword))) {
        return true;
      }

      // Check if this issue matches an allowed pattern
      const isAllowed = calibration.allowedPatterns.some(pattern => 
        lowerIssue.includes(pattern) || pattern.includes(lowerIssue)
      );

      // Keep issue if NOT in allowed list
      return !isAllowed;
    });
  }
}

// Singleton instance
export const safetyFeedbackService = new SafetyFeedbackService();
