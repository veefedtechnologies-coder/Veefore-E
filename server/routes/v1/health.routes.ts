import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { corsHealthCheck } from '../../middleware/cors-security';
import { securityMetricsHandler } from '../../middleware/security-monitoring';

const router = Router();

router.get('/health', async (req: any, res: Response) => {
  try {
    const mongoState = mongoose.connection.readyState;
    const isDatabaseConnected = mongoState === 1;
    const databaseStatus = isDatabaseConnected ? 'connected' : 'disconnected';
    const isHealthy = isDatabaseConnected;
    
    const healthStatus = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        database: databaseStatus,
        server: 'running'
      }
    };
    
    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
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
