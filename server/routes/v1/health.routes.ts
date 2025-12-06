import { Router, Response } from 'express';
import { corsHealthCheck } from '../../middleware/cors-security';
import { securityMetricsHandler } from '../../middleware/security-monitoring';

const router = Router();

router.get('/health', async (req: any, res: Response) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        database: 'connected',
        server: 'running'
      }
    };
    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/cors-health', corsHealthCheck);

router.get('/security/metrics', securityMetricsHandler);

export default router;
