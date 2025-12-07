import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/require-auth';
import { validateRequest } from '../../middleware/validation';
import { storage } from '../../storage';
import { AutomationSystem } from '../../automation-system';

const router = Router();

const automationSystem = new AutomationSystem(storage);

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

router.get('/rules',
  requireAuth,
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

router.post('/rules',
  requireAuth,
  validateRequest({ body: CreateRuleSchema }),
  async (req: Request, res: Response) => {
    try {
      console.log('[NEW AUTOMATION] Creating rule with body:', req.body);
      const { workspaceId, name, type, keywords, targetMediaIds, responses } = req.body;
      
      console.log('[NEW AUTOMATION] Extracted fields:', {
        workspaceId, name, type, keywords, targetMediaIds, responses
      });
      
      if (!workspaceId || !name || !type || !keywords || !responses) {
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
        isActive: true,
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
  validateRequest({ params: UpdateRuleParamsSchema, body: UpdateRuleBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;
      
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

router.get('/logs/:workspaceId',
  requireAuth,
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
