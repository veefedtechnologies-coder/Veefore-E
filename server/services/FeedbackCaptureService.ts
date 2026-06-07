import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { 
  CaptionFeedbackModel, 
  ICaptionFeedback, 
  IEditChange 
} from '../models/AI/CaptionFeedback';
import { GeneratedCaptionModel, IGeneratedCaption } from '../models/AI/GeneratedCaption';

/**
 * Feedback Capture Service
 * 
 * Captures and analyzes user feedback on generated captions to enable
 * continuous learning and voice profile improvements.
 * 
 * Requirements: 10.1, 10.2, 10.6
 */

export interface SelectionFeedback {
  generatedCaptionId: string;
  selectedVariationIndex: number;
  rejectedVariationIndices: number[];
}

export interface EditAnalysis {
  originalCaption: string;
  editedCaption: string;
  changes: IEditChange[];
  editDistance: number;
  changeTypes: {
    vocabulary: number;
    structure: number;
    emoji: number;
    length: number;
    tone: number;
    other: number;
  };
}

export interface RejectionPattern {
  pattern: string;
  rejectionCount: number;
  lastRejectedAt: Date;
  commonReasons: string[];
}

export interface RejectionAnalysis {
  userId: string;
  workspaceId: string;
  totalRejections: number;
  mostRejectedPatterns: RejectionPattern[];
  mostRejectedHooks: RejectionPattern[];
  rejectionTrends: {
    rejectionsLastWeek: number;
    rejectionsLastMonth: number;
    rejectionRate: number; // % of generated captions rejected
  };
}

export class FeedbackCaptureService {
  private db: Db;
  private feedbackCollection: Collection<ICaptionFeedback>;

  constructor(mongoClient: MongoClient, dbName: string) {
    this.db = mongoClient.db(dbName);
    this.feedbackCollection = this.db.collection<ICaptionFeedback>('captionfeedback');
  }

  /**
   * Record caption selection tracking
   * Captures which variation the user selected and which they rejected
   * 
   * Requirements: 10.1, 10.2
   */
  async recordSelection(
    userId: string,
    workspaceId: string,
    feedback: SelectionFeedback
  ): Promise<void> {
    try {
      // Fetch the generated caption to get pattern details
      const generatedCaption = await GeneratedCaptionModel.findById(
        feedback.generatedCaptionId
      );

      if (!generatedCaption) {
        throw new Error(`Generated caption not found: ${feedback.generatedCaptionId}`);
      }

      // Extract pattern preferences from selected and rejected variations
      const selectedVariation = generatedCaption.variations[feedback.selectedVariationIndex];
      const preferredPatterns = selectedVariation?.usedPatterns || [];
      const preferredHooks = selectedVariation?.usedHooks || [];

      const rejectedPatterns: string[] = [];
      const rejectedHooks: string[] = [];

      feedback.rejectedVariationIndices.forEach(index => {
        const rejectedVariation = generatedCaption.variations[index];
        if (rejectedVariation) {
          rejectedPatterns.push(...rejectedVariation.usedPatterns);
          rejectedHooks.push(...rejectedVariation.usedHooks);
        }
      });

      // Create feedback document
      const captionFeedback: Partial<ICaptionFeedback> = {
        userId,
        workspaceId,
        generatedCaptionId: feedback.generatedCaptionId,
        feedbackType: 'selection',
        selectedVariation: feedback.selectedVariationIndex,
        rejectedVariations: feedback.rejectedVariationIndices,
        preferredPatterns: [...preferredPatterns, ...preferredHooks],
        rejectedPatterns: [...rejectedPatterns, ...rejectedHooks],
        timestamp: new Date(),
        niche: generatedCaption.niche,
        postType: generatedCaption.postType
      };

      await CaptionFeedbackModel.create(captionFeedback);

      // Update the generated caption with selection info
      await GeneratedCaptionModel.findByIdAndUpdate(
        feedback.generatedCaptionId,
        {
          selectedVariationIndex: feedback.selectedVariationIndex
        }
      );

      console.log(`[FeedbackCaptureService] Recorded selection for caption ${feedback.generatedCaptionId}`);
    } catch (error) {
      console.error('[FeedbackCaptureService] Error recording selection:', error);
      throw error;
    }
  }

  /**
   * Analyze caption edits to detect change patterns
   * Identifies what users modify: vocabulary, structure, emoji, length, tone
   * 
   * Requirements: 10.1, 10.2
   */
  async analyzeEdit(
    userId: string,
    workspaceId: string,
    generatedCaptionId: string,
    originalCaption: string,
    editedCaption: string
  ): Promise<EditAnalysis> {
    try {
      // Calculate edit distance (Levenshtein)
      const editDistance = this.calculateLevenshteinDistance(
        originalCaption,
        editedCaption
      );

      // Detect changes
      const changes = this.detectChanges(originalCaption, editedCaption);

      // Count change types
      const changeTypes = {
        vocabulary: 0,
        structure: 0,
        emoji: 0,
        length: 0,
        tone: 0,
        other: 0
      };

      changes.forEach(change => {
        changeTypes[change.type]++;
      });

      // Store feedback
      const captionFeedback: Partial<ICaptionFeedback> = {
        userId,
        workspaceId,
        generatedCaptionId,
        feedbackType: 'edit',
        editsMade: changes,
        timestamp: new Date()
      };

      await CaptionFeedbackModel.create(captionFeedback);

      // Update the generated caption with edit info
      await GeneratedCaptionModel.findByIdAndUpdate(
        generatedCaptionId,
        {
          wasEdited: true,
          originalCaption,
          editedCaption,
          editDistance
        }
      );

      console.log(`[FeedbackCaptureService] Analyzed edit for caption ${generatedCaptionId}`);

      return {
        originalCaption,
        editedCaption,
        changes,
        editDistance,
        changeTypes
      };
    } catch (error) {
      console.error('[FeedbackCaptureService] Error analyzing edit:', error);
      throw error;
    }
  }

  /**
   * Analyze rejection patterns to learn what users don't want
   * Identifies which patterns, hooks, and styles users consistently reject
   * 
   * Requirements: 10.6
   */
  async analyzeRejections(
    userId: string,
    workspaceId: string
  ): Promise<RejectionAnalysis> {
    try {
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get all rejection and selection feedback
      const feedback = await CaptionFeedbackModel.find({
        userId,
        workspaceId,
        feedbackType: { $in: ['selection', 'rejection'] }
      }).lean();

      // Count rejections
      const rejectionsLastWeek = feedback.filter(
        f => f.timestamp >= oneWeekAgo
      ).length;

      const rejectionsLastMonth = feedback.filter(
        f => f.timestamp >= oneMonthAgo
      ).length;

      // Get total generations for rejection rate
      const totalGenerations = await GeneratedCaptionModel.countDocuments({
        userId,
        workspaceId
      });

      const totalRejections = feedback.length;
      const rejectionRate = totalGenerations > 0 
        ? (totalRejections / totalGenerations) * 100 
        : 0;

      // Aggregate rejected patterns
      const patternRejections = new Map<string, RejectionPattern>();

      feedback.forEach(f => {
        if (f.rejectedPatterns && f.rejectedPatterns.length > 0) {
          f.rejectedPatterns.forEach(pattern => {
            if (!patternRejections.has(pattern)) {
              patternRejections.set(pattern, {
                pattern,
                rejectionCount: 0,
                lastRejectedAt: f.timestamp,
                commonReasons: []
              });
            }
            const existing = patternRejections.get(pattern)!;
            existing.rejectionCount++;
            if (f.timestamp > existing.lastRejectedAt) {
              existing.lastRejectedAt = f.timestamp;
            }
          });
        }
      });

      // Sort by rejection count
      const mostRejectedPatterns = Array.from(patternRejections.values())
        .sort((a, b) => b.rejectionCount - a.rejectionCount)
        .slice(0, 10);

      console.log(`[FeedbackCaptureService] Analyzed rejections for user ${userId}`);

      return {
        userId,
        workspaceId,
        totalRejections,
        mostRejectedPatterns,
        mostRejectedHooks: [], // Hooks are included in patterns
        rejectionTrends: {
          rejectionsLastWeek,
          rejectionsLastMonth,
          rejectionRate
        }
      };
    } catch (error) {
      console.error('[FeedbackCaptureService] Error analyzing rejections:', error);
      throw error;
    }
  }

  /**
   * Detect specific changes between original and edited captions
   */
  private detectChanges(original: string, edited: string): IEditChange[] {
    const changes: IEditChange[] = [];

    // Detect length changes
    const lengthDiff = Math.abs(edited.length - original.length);
    if (lengthDiff > 50) {
      changes.push({
        type: 'length',
        before: `${original.length} characters`,
        after: `${edited.length} characters`,
        reason: edited.length > original.length ? 'Expanded content' : 'Shortened content'
      });
    }

    // Detect emoji changes
    const originalEmojis = this.extractEmojis(original);
    const editedEmojis = this.extractEmojis(edited);
    
    if (originalEmojis.length !== editedEmojis.length || 
        originalEmojis.join('') !== editedEmojis.join('')) {
      changes.push({
        type: 'emoji',
        before: originalEmojis.length > 0 ? originalEmojis.join(' ') : 'none',
        after: editedEmojis.length > 0 ? editedEmojis.join(' ') : 'none',
        reason: editedEmojis.length > originalEmojis.length 
          ? 'Added emojis' 
          : editedEmojis.length < originalEmojis.length 
          ? 'Removed emojis' 
          : 'Changed emojis'
      });
    }

    // Detect structure changes (line breaks, paragraphs)
    const originalLines = original.split('\n').length;
    const editedLines = edited.split('\n').length;
    
    if (Math.abs(originalLines - editedLines) > 1) {
      changes.push({
        type: 'structure',
        before: `${originalLines} lines`,
        after: `${editedLines} lines`,
        reason: editedLines > originalLines ? 'Added line breaks' : 'Removed line breaks'
      });
    }

    // Detect vocabulary changes (word replacements)
    const originalWords = original.toLowerCase().split(/\s+/);
    const editedWords = edited.toLowerCase().split(/\s+/);
    
    const originalSet = new Set(originalWords);
    const editedSet = new Set(editedWords);
    
    const addedWords = [...editedSet].filter(w => !originalSet.has(w));
    const removedWords = [...originalSet].filter(w => !editedSet.has(w));
    
    if (addedWords.length > 0 || removedWords.length > 0) {
      changes.push({
        type: 'vocabulary',
        before: removedWords.length > 0 ? removedWords.slice(0, 5).join(', ') : 'n/a',
        after: addedWords.length > 0 ? addedWords.slice(0, 5).join(', ') : 'n/a',
        reason: 'Word replacements'
      });
    }

    // Detect tone changes (exclamation marks, question marks)
    const originalExclamations = (original.match(/!/g) || []).length;
    const editedExclamations = (edited.match(/!/g) || []).length;
    const originalQuestions = (original.match(/\?/g) || []).length;
    const editedQuestions = (edited.match(/\?/g) || []).length;
    
    if (Math.abs(originalExclamations - editedExclamations) > 1 ||
        Math.abs(originalQuestions - editedQuestions) > 1) {
      changes.push({
        type: 'tone',
        before: `${originalExclamations}!, ${originalQuestions}?`,
        after: `${editedExclamations}!, ${editedQuestions}?`,
        reason: 'Tone adjustment'
      });
    }

    return changes;
  }

  /**
   * Extract emojis from text
   */
  private extractEmojis(text: string): string[] {
    // Unicode emoji regex pattern
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    return text.match(emojiRegex) || [];
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Measures the minimum number of single-character edits required
   */
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Create a 2D array for dynamic programming
    const dp: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;

    // Fill the dp array
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // deletion
            dp[i][j - 1] + 1,    // insertion
            dp[i - 1][j - 1] + 1 // substitution
          );
        }
      }
    }

    return dp[len1][len2];
  }

  /**
   * Get recent feedback for a user
   */
  async getRecentFeedback(
    userId: string,
    workspaceId: string,
    limit: number = 50
  ): Promise<ICaptionFeedback[]> {
    return CaptionFeedbackModel
      .find({ userId, workspaceId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get feedback by type
   */
  async getFeedbackByType(
    userId: string,
    workspaceId: string,
    feedbackType: 'selection' | 'edit' | 'rejection' | 'regeneration',
    limit: number = 50
  ): Promise<ICaptionFeedback[]> {
    return CaptionFeedbackModel
      .find({ userId, workspaceId, feedbackType })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get user's preferred patterns based on selection history
   */
  async getPreferredPatterns(
    userId: string,
    workspaceId: string
  ): Promise<string[]> {
    const selectionFeedback = await CaptionFeedbackModel
      .find({ 
        userId, 
        workspaceId, 
        feedbackType: 'selection',
        preferredPatterns: { $exists: true, $ne: [] }
      })
      .lean();

    // Count pattern occurrences
    const patternCounts = new Map<string, number>();
    
    selectionFeedback.forEach(feedback => {
      feedback.preferredPatterns?.forEach(pattern => {
        patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
      });
    });

    // Sort by count and return top patterns
    return Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([pattern]) => pattern)
      .slice(0, 10);
  }
}
