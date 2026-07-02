import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { aiRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { AuthenticatedRequest } from '../../types/express';
import { storage } from '../../mongodb-storage';
import { VoiceProfileService } from '../../services/VoiceProfileService';
import mongoose from 'mongoose';

const router = Router();

// Schema for voice profile analyze endpoint
const AnalyzeVoiceProfileSchema = z.object({
  sampleCaptions: z.array(z.string().min(1).max(5000)).min(5, 'At least 5 sample captions are required'),
  workspaceId: z.string().optional(),
});

/**
 * POST /api/voice-profile/analyze
 * Analyzes sample captions to create a voice profile
 * 
 * Requirements: 1.1, 1.3
 * 
 * Request body:
 * - sampleCaptions: string[] (min 5 captions required)
 * - workspaceId: string (optional)
 * 
 * Response:
 * - success: boolean
 * - voiceProfile: VoiceProfile summary
 * - confidence: number (0-1)
 */
router.post('/analyze',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: AnalyzeVoiceProfileSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { sampleCaptions, workspaceId } = req.body;

      console.log('[VOICE PROFILE] Analyzing voice profile for user:', userId);

      // Determine workspace ID (from body, query, or header)
      const targetWorkspaceId = workspaceId || 
                                 req.query.workspaceId as string || 
                                 req.headers['workspace-id'] as string;

      if (!targetWorkspaceId) {
        return res.status(400).json({ 
          error: 'Workspace ID is required'
        });
      }

      // Verify workspace access
      const workspace = await storage.getWorkspace(targetWorkspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      // Verify user owns or has access to workspace
      const user = await storage.getUser(userId);
      const workspaceUserId = workspace.userId?.toString();
      const requestUserId = userId.toString();
      const firebaseUid = user?.firebaseUid;

      const userOwnsWorkspace = workspaceUserId === requestUserId || 
                               workspaceUserId === firebaseUid ||
                               workspace.userId === userId ||
                               workspace.userId === firebaseUid;

      if (!userOwnsWorkspace) {
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Validate sample captions
      if (!sampleCaptions || sampleCaptions.length < 5) {
        return res.status(400).json({ 
          error: 'At least 5 sample captions are required for voice profile analysis'
        });
      }

      // Filter out empty or very short captions
      const validCaptions = sampleCaptions.filter(caption => 
        caption && caption.trim().length >= 10
      );

      if (validCaptions.length < 5) {
        return res.status(400).json({ 
          error: 'At least 5 valid captions with 10+ characters are required'
        });
      }

      // Initialize VoiceProfileService
      // Get the native MongoDB client from mongoose connection
      const mongoClient = mongoose.connection.getClient();
      const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
      const voiceProfileService = new VoiceProfileService(mongoClient, dbName);

      // Analyze and create voice profile
      const voiceProfile = await voiceProfileService.analyzeAndCreateProfile(
        userId,
        targetWorkspaceId,
        validCaptions
      );

      console.log('[VOICE PROFILE] Successfully created voice profile with confidence:', voiceProfile.confidence);

      // Format response with voice profile summary
      const profileSummary = {
        confidence: voiceProfile.confidence,
        sampleSize: voiceProfile.sampleSize,
        
        // Voice characteristics summary
        characteristics: {
          paragraphStructure: voiceProfile.paragraphStructure,
          sentenceLengthDistribution: voiceProfile.sentenceLengthDistribution,
          
          // Emoji usage
          emojiUsage: {
            frequency: voiceProfile.emojiUsagePattern.frequency,
            placement: voiceProfile.emojiUsagePattern.placement,
            topEmojis: voiceProfile.emojiUsagePattern.topEmojis.slice(0, 5), // Top 5 emojis
          },
          
          // Punctuation style
          punctuation: {
            exclamations: voiceProfile.punctuationStyle.exclamationUsage,
            questions: voiceProfile.punctuationStyle.questionUsage,
            ellipsis: voiceProfile.punctuationStyle.ellipsisUsage,
          },
          
          // Tone markers (top 3 tones)
          dominantTones: Object.entries(voiceProfile.toneMarkers)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([tone, score]) => ({ tone, score: Math.round(score * 100) })),
          
          // Writing patterns
          signaturePhrases: voiceProfile.signaturePhrases.slice(0, 5), // Top 5 signature phrases
          hookPatterns: voiceProfile.hookPatterns.slice(0, 3), // Top 3 hook patterns
          engagementStyles: voiceProfile.engagementQuestionStyle.slice(0, 3), // Top 3 question styles
          storytellingStructure: voiceProfile.storytellingStructure,
        },
        
        // Top vocabulary (top 10 most frequent words)
        topVocabulary: Object.entries(voiceProfile.vocabularyFrequency)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([word, freq]) => ({ word, frequency: Math.round(freq * 1000) / 1000 })),
        
        createdAt: voiceProfile.createdAt,
        lastUpdated: voiceProfile.lastUpdated,
      };

      res.json({
        success: true,
        voiceProfile: profileSummary,
        confidence: voiceProfile.confidence,
        message: `Voice profile created successfully. Analyzed ${voiceProfile.sampleSize} captions with ${Math.round(voiceProfile.confidence * 100)}% confidence.`
      });

    } catch (error: any) {
      console.error('[VOICE PROFILE] Analysis failed:', error);
      
      // Handle specific error cases
      if (error.message && error.message.includes('At least 5 sample captions')) {
        return res.status(400).json({ 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to analyze voice profile',
      });
    }
  }
);

/**
 * GET /api/voice-profile/:workspaceId
 * Retrieves an existing voice profile for a workspace
 * 
 * Requirements: 1.3
 * 
 * URL parameters:
 * - workspaceId: string (workspace identifier)
 * 
 * Response:
 * - success: boolean
 * - voiceProfile: VoiceProfile (complete profile including patterns, metrics, and metadata)
 * - exists: boolean (indicates if profile was found or default was returned)
 */
router.get('/:workspaceId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { workspaceId } = req.params;

      console.log('[VOICE PROFILE] Retrieving voice profile for workspace:', workspaceId);

      // Validate workspaceId parameter
      if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim() === '') {
        return res.status(400).json({ 
          error: 'Valid workspace ID is required'
        });
      }

      // Verify workspace exists
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ 
          error: 'Workspace not found'
        });
      }

      // Verify user owns or has access to workspace
      const user = await storage.getUser(userId);
      const workspaceUserId = workspace.userId?.toString();
      const requestUserId = userId.toString();
      const firebaseUid = user?.firebaseUid;

      const userOwnsWorkspace = workspaceUserId === requestUserId || 
                               workspaceUserId === firebaseUid ||
                               workspace.userId === userId ||
                               workspace.userId === firebaseUid;

      if (!userOwnsWorkspace) {
        return res.status(403).json({ 
          error: 'Access denied to workspace' 
        });
      }

      // Initialize VoiceProfileService
      const mongoClient = mongoose.connection.getClient();
      const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
      const voiceProfileService = new VoiceProfileService(mongoClient, dbName);

      // Retrieve voice profile
      const voiceProfile = await voiceProfileService.getProfile(userId, workspaceId);

      // Check if this is an actual profile or default profile
      const profileExists = voiceProfile.sampleSize > 0;

      if (!profileExists) {
        console.log('[VOICE PROFILE] No profile found for workspace, returning default');
        return res.status(404).json({
          error: 'Voice profile not found',
          message: 'No voice profile exists for this workspace. Create one by analyzing sample captions.',
          exists: false
        });
      }

      console.log('[VOICE PROFILE] Found voice profile with', voiceProfile.sampleSize, 'samples');

      // Format complete response with full profile data
      const completeProfile = {
        // Metadata
        confidence: voiceProfile.confidence,
        sampleSize: voiceProfile.sampleSize,
        createdAt: voiceProfile.createdAt,
        lastUpdated: voiceProfile.lastUpdated,
        
        // Voice Characteristics
        vocabularyFrequency: voiceProfile.vocabularyFrequency,
        signaturePhrases: voiceProfile.signaturePhrases,
        sentenceLengthDistribution: voiceProfile.sentenceLengthDistribution,
        paragraphStructure: voiceProfile.paragraphStructure,
        
        // Emoji & Punctuation
        emojiUsagePattern: voiceProfile.emojiUsagePattern,
        punctuationStyle: voiceProfile.punctuationStyle,
        
        // Tone & Style
        toneMarkers: voiceProfile.toneMarkers,
        
        // Pattern Recognition
        hookPatterns: voiceProfile.hookPatterns,
        engagementQuestionStyle: voiceProfile.engagementQuestionStyle,
        storytellingStructure: voiceProfile.storytellingStructure,
      };

      res.json({
        success: true,
        voiceProfile: completeProfile,
        exists: true,
        message: `Voice profile loaded with ${voiceProfile.sampleSize} sample(s) and ${Math.round(voiceProfile.confidence * 100)}% confidence`
      });

    } catch (error: any) {
      console.error('[VOICE PROFILE] Retrieval failed:', error);
      
      res.status(500).json({ 
        error: 'Failed to retrieve voice profile',
      });
    }
  }
);

// Schema for voice profile recalibrate endpoint
const RecalibrateVoiceProfileSchema = z.object({
  recentCaptions: z.array(z.string().min(1).max(5000)).min(5).optional(),
  forceUpdate: z.boolean().optional(),
});

/**
 * PUT /api/voice-profile/:workspaceId/recalibrate
 * Manually triggers voice profile recalibration using recent captions
 * 
 * Requirements: 10.6
 * 
 * URL params:
 * - workspaceId: string
 * 
 * Request body (optional):
 * - recentCaptions: string[] (min 5 captions, optional - fetches from DB if not provided)
 * - forceUpdate: boolean (optional - force recalibration even if profile is recent)
 * 
 * Response:
 * - success: boolean
 * - voiceProfile: VoiceProfile summary
 * - message: string
 * - recalibratedAt: Date
 */
router.put('/:workspaceId/recalibrate',
  requireAuth,
  aiRateLimiter,
  validateRequest({ body: RecalibrateVoiceProfileSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { workspaceId } = req.params;
      const { recentCaptions, forceUpdate } = req.body;

      console.log('[VOICE PROFILE] Recalibrating voice profile for workspace:', workspaceId);

      // Validate workspaceId parameter
      if (!workspaceId) {
        return res.status(400).json({ 
          error: 'Workspace ID is required in URL path'
        });
      }

      // Verify workspace access
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }

      // Verify user owns or has access to workspace
      const user = await storage.getUser(userId);
      const workspaceUserId = workspace.userId?.toString();
      const requestUserId = userId.toString();
      const firebaseUid = user?.firebaseUid;

      const userOwnsWorkspace = workspaceUserId === requestUserId || 
                               workspaceUserId === firebaseUid ||
                               workspace.userId === userId ||
                               workspace.userId === firebaseUid;

      if (!userOwnsWorkspace) {
        return res.status(403).json({ error: 'Access denied to workspace' });
      }

      // Initialize VoiceProfileService
      const mongoClient = mongoose.connection.getClient();
      const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
      const voiceProfileService = new VoiceProfileService(mongoClient, dbName);

      let captionsForRecalibration: string[] = [];

      // If recentCaptions provided, use those
      if (recentCaptions && recentCaptions.length >= 5) {
        console.log('[VOICE PROFILE] Using provided captions for recalibration');
        captionsForRecalibration = recentCaptions.filter(caption => 
          caption && caption.trim().length >= 10
        );
      } else {
        // Fetch recent captions from database
        console.log('[VOICE PROFILE] Fetching recent captions from database');
        
        const recentContent = await storage.getContentByWorkspace(workspaceId, 20);
        
        // Extract captions from contentData (captions may be in different fields)
        captionsForRecalibration = recentContent
          .filter(content => {
            const caption = content.contentData?.caption || 
                          content.contentData?.description || 
                          content.description;
            return caption && typeof caption === 'string' && caption.trim().length >= 10;
          })
          .map(content => {
            const caption = content.contentData?.caption || 
                          content.contentData?.description || 
                          content.description;
            return caption as string;
          })
          .slice(0, 20); // Limit to 20 most recent

        console.log('[VOICE PROFILE] Found', captionsForRecalibration.length, 'captions from recent content');
      }

      // Validate we have enough captions
      if (captionsForRecalibration.length < 5) {
        return res.status(400).json({ 
          error: 'Insufficient captions for recalibration. Need at least 5 captions with 10+ characters.',
          found: captionsForRecalibration.length,
          required: 5,
          suggestion: 'Either provide recentCaptions in the request body or ensure you have at least 5 published posts with captions.'
        });
      }

      // Check if profile exists and was recently updated (unless forceUpdate is true)
      const existingProfile = await voiceProfileService.getProfile(userId, workspaceId);
      
      if (!forceUpdate && existingProfile.sampleSize > 0) {
        const hoursSinceUpdate = (Date.now() - existingProfile.lastUpdated.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceUpdate < 24) {
          console.log('[VOICE PROFILE] Profile was recently updated, skipping recalibration unless forced');
          return res.status(200).json({
            success: false,
            message: `Voice profile was updated ${Math.round(hoursSinceUpdate)} hours ago. Use forceUpdate: true to recalibrate anyway.`,
            lastUpdated: existingProfile.lastUpdated,
            hoursSinceUpdate: Math.round(hoursSinceUpdate)
          });
        }
      }

      // Recalibrate profile using analyzeAndCreateProfile (which upserts)
      console.log('[VOICE PROFILE] Recalibrating profile with', captionsForRecalibration.length, 'captions');
      
      const updatedProfile = await voiceProfileService.analyzeAndCreateProfile(
        userId,
        workspaceId,
        captionsForRecalibration
      );

      console.log('[VOICE PROFILE] Successfully recalibrated voice profile');

      // Format response with updated voice profile summary
      const profileSummary = {
        confidence: updatedProfile.confidence,
        sampleSize: updatedProfile.sampleSize,
        
        // Voice characteristics summary
        characteristics: {
          paragraphStructure: updatedProfile.paragraphStructure,
          sentenceLengthDistribution: updatedProfile.sentenceLengthDistribution,
          
          // Emoji usage
          emojiUsage: {
            frequency: updatedProfile.emojiUsagePattern.frequency,
            placement: updatedProfile.emojiUsagePattern.placement,
            topEmojis: updatedProfile.emojiUsagePattern.topEmojis.slice(0, 5),
          },
          
          // Punctuation style
          punctuation: {
            exclamations: updatedProfile.punctuationStyle.exclamationUsage,
            questions: updatedProfile.punctuationStyle.questionUsage,
            ellipsis: updatedProfile.punctuationStyle.ellipsisUsage,
          },
          
          // Tone markers (top 3 tones)
          dominantTones: Object.entries(updatedProfile.toneMarkers)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([tone, score]) => ({ tone, score: Math.round(score * 100) })),
          
          // Writing patterns
          signaturePhrases: updatedProfile.signaturePhrases.slice(0, 5),
          hookPatterns: updatedProfile.hookPatterns.slice(0, 3),
          engagementStyles: updatedProfile.engagementQuestionStyle.slice(0, 3),
          storytellingStructure: updatedProfile.storytellingStructure,
        },
        
        // Top vocabulary (top 10 most frequent words)
        topVocabulary: Object.entries(updatedProfile.vocabularyFrequency)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([word, freq]) => ({ word, frequency: Math.round(freq * 1000) / 1000 })),
        
        lastUpdated: updatedProfile.lastUpdated,
        createdAt: updatedProfile.createdAt,
      };

      res.json({
        success: true,
        voiceProfile: profileSummary,
        confidence: updatedProfile.confidence,
        message: `Voice profile recalibrated successfully using ${updatedProfile.sampleSize} recent captions with ${Math.round(updatedProfile.confidence * 100)}% confidence.`,
        recalibratedAt: updatedProfile.lastUpdated
      });

    } catch (error: any) {
      console.error('[VOICE PROFILE] Recalibration failed:', error);
      
      res.status(500).json({ 
        error: 'Failed to recalibrate voice profile',
      });
    }
  }
);

/**
 * GET /api/voice-profile/:workspaceId/evolution
 * Retrieves voice profile evolution data including snapshots, milestones, and acceptance trends
 * 
 * Requirements: 10.4, 10.5
 * 
 * URL parameters:
 * - workspaceId: string (workspace identifier)
 * 
 * Response:
 * - success: boolean
 * - snapshots: VoiceProfileSnapshot[] (voice profile snapshots over time)
 * - milestones: LearningMilestone[] (learning achievements and improvements)
 * - acceptanceTrend: AcceptanceRateTrend[] (caption acceptance rates over time)
 */
router.get('/:workspaceId/evolution',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { workspaceId } = req.params;

      console.log('[VOICE PROFILE] Retrieving evolution data for workspace:', workspaceId);

      // Validate workspaceId parameter
      if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim() === '') {
        return res.status(400).json({ 
          error: 'Valid workspace ID is required'
        });
      }

      // Verify workspace exists
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ 
          error: 'Workspace not found'
        });
      }

      // Verify user owns or has access to workspace
      const user = await storage.getUser(userId);
      const workspaceUserId = workspace.userId?.toString();
      const requestUserId = userId.toString();
      const firebaseUid = user?.firebaseUid;

      const userOwnsWorkspace = workspaceUserId === requestUserId || 
                               workspaceUserId === firebaseUid ||
                               workspace.userId === userId ||
                               workspace.userId === firebaseUid;

      if (!userOwnsWorkspace) {
        return res.status(403).json({ 
          error: 'Access denied to workspace' 
        });
      }

      // Initialize VoiceProfileService
      const mongoClient = mongoose.connection.getClient();
      const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
      const voiceProfileService = new VoiceProfileService(mongoClient, dbName);

      // Get voice profile snapshots (historical data)
      const snapshots = await voiceProfileService.getProfileSnapshots(userId, workspaceId);

      // Get learning milestones
      const milestones = await voiceProfileService.getLearningMilestones(userId, workspaceId);

      // Get acceptance rate trends
      const acceptanceTrend = await voiceProfileService.getAcceptanceRateTrend(userId, workspaceId);

      console.log('[VOICE PROFILE] Found', snapshots.length, 'snapshots,', milestones.length, 'milestones,', acceptanceTrend.length, 'trends');

      res.json({
        success: true,
        snapshots,
        milestones,
        acceptanceTrend
      });

    } catch (error: any) {
      console.error('[VOICE PROFILE] Evolution data retrieval failed:', error);
      
      res.status(500).json({ 
        error: 'Failed to retrieve voice profile evolution data',
      });
    }
  }
);

export default router;
