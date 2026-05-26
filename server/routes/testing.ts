/**
 * P8: Testing API Routes
 * 
 * API endpoints for comprehensive audit testing
 */

import { Router } from 'express';
import { runSecurityAudit } from '../../tests/security-tests';
import { runIntegrationAudit } from '../../tests/integration-tests';
import { runE2EAudit } from '../../tests/e2e-tests';

const router = Router();

/**
 * P8.1: Execute security audit
 */
router.post('/security-audit', async (req, res) => {
  try {
    console.log('🔒 P8.1: Starting security audit...');
    await runSecurityAudit();
    
    res.json({
      success: true,
      message: 'Security audit completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ P8.1: Security audit failed:', error);
    res.status(500).json({
      success: false,
      error: 'Security audit failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * P8.2: Execute integration tests
 */
router.post('/integration-audit', async (req, res) => {
  try {
    console.log('🔄 P8.2: Starting integration audit...');
    await runIntegrationAudit();
    
    res.json({
      success: true,
      message: 'Integration audit completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ P8.2: Integration audit failed:', error);
    res.status(500).json({
      success: false,
      error: 'Integration audit failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * P8.3: Execute E2E tests
 */
router.post('/e2e-audit', async (req, res) => {
  try {
    console.log('🎭 P8.3: Starting E2E audit...');
    await runE2EAudit();
    
    res.json({
      success: true,
      message: 'E2E audit completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ P8.3: E2E audit failed:', error);
    res.status(500).json({
      success: false,
      error: 'E2E audit failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * P8: Execute comprehensive audit
 */
router.post('/comprehensive-audit', async (req, res) => {
  try {
    console.log('🎯 P8: Starting comprehensive audit...');
    
    const startTime = Date.now();
    
    // Run all test suites
    await runSecurityAudit();
    await runIntegrationAudit();
    await runE2EAudit();
    
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      message: 'Comprehensive audit completed',
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ P8: Comprehensive audit failed:', error);
    res.status(500).json({
      success: false,
      error: 'Comprehensive audit failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * P8: Get audit status
 */
router.get('/audit-status', (req, res) => {
  res.json({
    availableTests: [
      'security-audit',
      'integration-audit', 
      'e2e-audit',
      'comprehensive-audit'
    ],
    description: 'P8: Testing framework for comprehensive security and performance validation',
    timestamp: new Date().toISOString()
  });
});

export default router;