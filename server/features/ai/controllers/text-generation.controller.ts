import { Response } from 'express';
import { AuthenticatedRequest } from '../../../types/express';
import { AIServiceManager } from '../../../services/AIServiceManager';
import { AICreditService } from '../../../services/AICreditService';
import { storage } from '../../../mongodb-storage';
import { resolveNiche } from '../../../services/niche.util';

/**
 * Text Generation Controller
 * 
 * Handles HTTP request/response for AI text generation endpoints.
 * All business logic is delegated to AIServiceManager.
 * 
 * Requirements: 4.1, 4.2, 4.4
 */
export class TextGenerationController {
  private aiServiceManager: AIServiceManager;

  constructor() {
    this.aiServiceManager = AIServiceManager.getInstance();
  }

  /**
   * Get AI preferences from user and workspace
   */
  private async getAIPreferences(userId: string, req: AuthenticatedRequest): Promise<any> {
    let preferences: any = {};
    
    try {
      const userObj = await storage.getUser(userId);
      if (userObj && userObj.preferences) {
        preferences = { ...userObj.preferences };
      }
      if (userObj && !preferences.contentNiche) {
        const niche = resolveNiche(userObj);
        if (niche) preferences.contentNiche = niche;
      }
    } catch (e) {
      console.warn('[TextGenerationController] Failed to load user preferences', e);
    }
    
    const workspaceId = req.body.workspaceId || req.query.workspaceId || req.headers['workspace-id'];
    if (workspaceId) {
      try {
        const workspace = await storage.getWorkspace(workspaceId as string);
        if (workspace && workspace.aiConfiguration) {
          preferences = { ...preferences, ...workspace.aiConfiguration };
        }
      } catch (e) {
        console.warn('[TextGenerationController] Failed to load workspace AI configuration', e);
      }
    }
    
    return preferences;
  }

  /**
   * Validate workspace access for the user
   */
  private async validateWorkspaceAccess(workspaceId: string, userId: string): Promise<boolean> {
    try {
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return false;
      }
      
      const user = await storage.getUser(userId);
      const workspaceUserId = workspace.userId?.toString();
      const requestUserId = userId.toString();
      const firebaseUid = user?.firebaseUid;
      
      return workspaceUserId === requestUserId || 
             workspaceUserId === firebaseUid ||
             workspace.userId === userId ||
             workspace.userId === firebaseUid;
    } catch (error) {
      console.error('[TextGenerationController] Workspace validation error:', error);
      return false;
    }
  }

  /**
   * Generate creative brief
   * POST /api/v1/ai/creative-brief
   */
  async generateCreativeBrief(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const creditCost = AICreditService.calculateCost('content_generation');
      
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      const workspaceId = req.body.workspaceId || req.headers['workspace-id'];
      if (workspaceId) {
        const hasAccess = await this.validateWorkspaceAccess(workspaceId as string, userId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied to workspace' });
          return;
        }
      }

      console.log('[TextGenerationController] Generating creative brief for user:', userId);

      const { creativeBriefAI } = await import('../../../creative-brief-ai');
      const briefResult = await creativeBriefAI.generateBrief(req.body);

      const deductResult = await AICreditService.deductCredits(userId, 'content_generation', {
        creditsToDeduct: creditCost,
        workspaceId: workspaceId as string,
        endpoint: '/api/v1/ai/creative-brief'
      });

      if (!deductResult.success) {
        console.error('[TextGenerationController] Credit deduction failed:', deductResult.error);
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      res.json({
        success: true,
        generated: briefResult,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[TextGenerationController] Creative brief generation failed:', error);
      res.status(500).json({ error: 'Failed to generate creative brief' });
    }
  }

  /**
   * Repurpose content for different platforms/languages
   * POST /api/v1/ai/content-repurpose
   */
  async repurposeContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const creditCost = AICreditService.calculateCost('repurpose');
      
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      const workspaceId = req.body.workspaceId || req.headers['workspace-id'];
      if (workspaceId) {
        const hasAccess = await this.validateWorkspaceAccess(workspaceId as string, userId);
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied to workspace' });
          return;
        }
      }

      console.log('[TextGenerationController] Repurposing content for user:', userId);

      const { contentRepurposeAI } = await import('../../../content-repurpose-ai');
      const repurposeResult = await contentRepurposeAI.repurposeContent(req.body);

      const deductResult = await AICreditService.deductCredits(userId, 'repurpose', {
        creditsToDeduct: creditCost,
        workspaceId: workspaceId as string,
        endpoint: '/api/v1/ai/content-repurpose'
      });

      if (!deductResult.success) {
        console.error('[TextGenerationController] Credit deduction failed:', deductResult.error);
        res.status(402).json({ error: deductResult.error || 'Failed to deduct credits' });
        return;
      }

      res.json({
        success: true,
        repurposed: repurposeResult,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter
      });

    } catch (error: any) {
      console.error('[TextGenerationController] Content repurpose failed:', error);
      res.status(500).json({ error: 'Failed to repurpose content' });
    }
  }

  /**
   * Bulk repurpose content to multiple languages
   * POST /api/v1/ai/content-repurpose/bulk
   */
  async bulkRepurpose(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { sourceContent, sourceLanguage, targetLanguages, contentType, platform } = req.body;
      const userId = req.user.id;

      const creditCost = targetLanguages.length * AICreditService.calculateCost('repurpose');
      const creditCheck = await AICreditService.checkCredits(userId, creditCost);
      if (!creditCheck.hasCredits) {
        res.status(402).json({ 
          error: 'Insufficient credits',
          required: creditCost,
          current: creditCheck.currentCredits
        });
        return;
      }

      const { contentRepurposeAI } = await import('../../../content-repurpose-ai');
      
      const bulkResults = await contentRepurposeAI.bulkRepurpose(
        sourceContent,
        sourceLanguage,
        targetLanguages,
        contentType,
        platform
      );

      const deductResult = await AICreditService.deductCredits(userId, 'repurpose', {
        creditsToDeduct: creditCost,
        endpoint: '/api/v1/ai/content-repurpose/bulk'
      });

      res.json({
        results: bulkResults,
        generated: bulkResults,
        creditsUsed: deductResult.creditsDeducted,
        remainingCredits: deductResult.creditsAfter,
        successCount: Object.keys(bulkResults).length,
        requestedCount: targetLanguages.length
      });

    } catch (error: any) {
      console.error('[TextGenerationController] Bulk repurpose failed:', error);
      res.status(500).json({ error: 'Failed to process bulk repurposing' });
    }
  }
}

export const textGenerationController = new TextGenerationController();
