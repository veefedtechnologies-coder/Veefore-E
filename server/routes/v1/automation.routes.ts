import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
import { validateWorkspaceAccess } from '../../middleware/workspace-validation';
import { requireResourceWorkspaceAccess, automationRuleWorkspace } from '../../lib/workspace-access';
import { automationRateLimiter } from '../../middleware/rate-limiting-working';
import { storage } from '../../storage';
import { AutomationSystem } from '../../automation-system';
import { automationGuards, automationToggleGuards } from '../../middleware/ai-route-guards';

const router = Router();

const automationSystem = new AutomationSystem(storage);

const phase1ReviewGuard = (req: Request, res: Response, next: any) => {
  if (process.env.META_PHASE_1_REVIEW_MODE === 'true') {
    return res.status(403).json({ error: 'Feature disabled during Phase 1 Review' });
  }
  next();
};

const GetRulesQuerySchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
});

const CreateRuleSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  keywords: z.any(),
  responses: z.any(),
  targetMediaIds: z.array(z.string()).optional(),
  matchMode: z.string().optional(),
  negativeKeywords: z.array(z.string()).optional(),
  aiIntents: z.array(z.string()).optional(),
  followerGate: z.any().optional(),
});

const UpdateRuleParamsSchema = z.object({
  ruleId: z.string().min(1),
});

const UpdateRuleBodySchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  keywords: z.any().optional(),
  responses: z.any().optional(),
  enabled: z.boolean().optional(),
  followerGate: z.any().optional(),
}).passthrough();

const RuleIdParamsSchema = z.object({
  ruleId: z.string().min(1),
});

const GetLogsParamsSchema = z.object({
  workspaceId: z.string().min(1),
});

const GetLogsQuerySchema = z.object({
  limit: z.string().optional().default('50'),
  type: z.string().optional(),
});

// TENANT ISOLATION (Req 13): `workspaceId` comes from the query string and was
// passed straight into `automationSystem.getRules`, so any authenticated user
// could list another tenant's automation rules.
router.get('/rules',
  requireAuth,
  validateWorkspaceAccess({ source: 'query' }),
  validateRequest({ query: GetRulesQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.query;

      const rules = await automationSystem.getRules(workspaceId);
      res.json({ rules });
    } catch (error: any) {
      console.error('[NEW AUTOMATION] Get rules error:', error);
      res.status(500).json({ error: 'Failed to fetch automation rules' });
    }
  }
);

// TENANT ISOLATION (Req 13): creates a LIVE automation rule from a body-supplied
// workspaceId. Unguarded, an authenticated user could install an automation that
// acts on another tenant's connected social account.
router.post('/rules',
  requireAuth,
  validateWorkspaceAccess({ source: 'body' }),
  phase1ReviewGuard,
  automationRateLimiter,
  ...automationGuards,
  validateRequest({ body: CreateRuleSchema }),
  async (req: Request, res: Response) => {
    try {
      console.log('[NEW AUTOMATION] Creating rule with body:', req.body);
      const { workspaceId, name, type, keywords, targetMediaIds, responses: responsesConfig, matchMode, negativeKeywords, aiIntents } = req.body;
      
      // Extract properties that might be nested inside responses due to frontend structure
      const responses = Array.isArray(responsesConfig) ? responsesConfig : (responsesConfig?.responses || []);
      const dmResponses = responsesConfig?.dmResponses || [];
      const dmButtons = responsesConfig?.dmButtons || [];
      const followerGate = req.body.followerGate || responsesConfig?.followerGate;

      console.log('[NEW AUTOMATION] Extracted fields:', {
        workspaceId, name, type, keywords, targetMediaIds, responses, dmResponses, dmButtons, matchMode, negativeKeywords, aiIntents, followerGate
      });
      
      if (!workspaceId || !name || !type || !keywords) {
        console.log('[NEW AUTOMATION] Missing required fields validation failed');
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const rule = await automationSystem.createRule({
        workspaceId,
        name,
        type,
        keywords,
        targetMediaIds: targetMediaIds || [],
        responses,
        matchMode,
        negativeKeywords: negativeKeywords || [],
        aiIntents: aiIntents || [],
        followerGate: followerGate,
        isActive: true,
      } as any);

      // We must manually add dmResponses and dmButtons to the payload since createRule doesn't pass them in its type definition natively
      (rule as any).action = {
        responses,
        dmResponses,
        dmButtons
      };
      
      // Actually update the rule in the database with the proper action block
      const { automationRuleRepository } = await import('../../repositories/AutomationRepository');
      await automationRuleRepository.updateById(rule.id, {
        action: { responses, dmResponses, dmButtons },
        followerGate: followerGate
      });

      console.log('[NEW AUTOMATION] Rule created successfully:', rule);
      res.json({ rule });
    } catch (error: any) {
      console.error('[NEW AUTOMATION] Create rule error:', error);
      res.status(500).json({ error: 'Failed to create automation rule' });
    }
  }
);

router.put('/rules/:ruleId',
  requireAuth,
  // TENANT ISOLATION (Req 13): keyed by opaque ruleId, so the workspace is only
  // knowable by loading the rule. Without this any authenticated user could
  // modify, disable or delete ANOTHER tenant's live automation rule.
  requireResourceWorkspaceAccess('ruleId', automationRuleWorkspace, 'automation rule'),
  phase1ReviewGuard,
  validateRequest({ params: UpdateRuleParamsSchema, body: UpdateRuleBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      const updates = { ...req.body };
      
      // Extract properties that might be nested inside responses due to frontend structure
      if (updates.responses && !Array.isArray(updates.responses)) {
        const responsesConfig = updates.responses;
        updates.responses = Array.isArray(responsesConfig.responses) ? responsesConfig.responses : [];
        
        // Structure the action block correctly for updates
        updates.action = {
          ...(updates.action || {}),
          responses: updates.responses,
          dmResponses: responsesConfig.dmResponses || [],
          dmButtons: responsesConfig.dmButtons || []
        };
        
        if (responsesConfig.followerGate) {
          updates.followerGate = responsesConfig.followerGate;
        }
      }
      
      const rule = await storage.updateAutomationRule(ruleId, updates);
      res.json({ rule });
    } catch (error: any) {
      console.error('[NEW AUTOMATION] Update rule error:', error);
      res.status(500).json({ error: 'Failed to update automation rule' });
    }
  }
);

router.delete('/rules/:ruleId',
  requireAuth,
  // TENANT ISOLATION (Req 13): keyed by opaque ruleId, so the workspace is only
  // knowable by loading the rule. Without this any authenticated user could
  // modify, disable or delete ANOTHER tenant's live automation rule.
  requireResourceWorkspaceAccess('ruleId', automationRuleWorkspace, 'automation rule'),
  phase1ReviewGuard,
  validateRequest({ params: RuleIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      
      await automationSystem.deleteRule(ruleId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[NEW AUTOMATION] Delete rule error:', error);
      res.status(500).json({ error: 'Failed to delete automation rule' });
    }
  }
);

router.post('/rules/:ruleId/toggle',
  requireAuth,
  // TENANT ISOLATION (Req 13): keyed by opaque ruleId, so the workspace is only
  // knowable by loading the rule. Without this any authenticated user could
  // modify, disable or delete ANOTHER tenant's live automation rule.
  requireResourceWorkspaceAccess('ruleId', automationRuleWorkspace, 'automation rule'),
  phase1ReviewGuard,
  automationRateLimiter,
  ...automationToggleGuards,
  validateRequest({ params: RuleIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      
      const rule = await automationSystem.toggleRule(ruleId);
      res.json({ rule });
    } catch (error: any) {
      console.error('[NEW AUTOMATION] Toggle rule error:', error);
      res.status(500).json({ error: 'Failed to toggle automation rule' });
    }
  }
);

// TENANT ISOLATION (Req 13): automation logs contain another tenant's activity.
router.get('/logs/:workspaceId',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: GetLogsParamsSchema, query: GetLogsQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.params;
      const { limit = '50', type } = req.query;
      
      const logs = await storage.getAutomationLogs?.(workspaceId, {
        limit: parseInt(limit as string),
        type: type as string
      }) || [];
      
      res.json({ logs });
    } catch (error: any) {
      console.error('[AUTOMATION] Get logs error:', error);
      res.status(500).json({ error: 'Failed to fetch automation logs' });
    }
  }
);

export default router;
