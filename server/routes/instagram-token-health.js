/**
 * Instagram Token Health Management Routes
 * Provides endpoints for validating, fixing, and monitoring Instagram token health
 */

import express from 'express';
import { instagramTokenValidator } from '../services/instagramTokenValidator.js';
import { tokenHealthChecker } from '../middleware/tokenHealthCheck.js';

const router = express.Router();

/**
 * POST /api/instagram/token-health/validate
 * Validate and fix Instagram tokens for a workspace
 */
router.post('/validate', async (req, res) => {
  try {
    const { workspaceId, forceRefresh = false } = req.body;

    if (!workspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing workspaceId'
      });
    }

    console.log(`[TOKEN HEALTH API] Validating tokens for workspace: ${workspaceId}`);

    // Get storage instance
    const storage = req.app.locals.storage;
    if (!storage) {
      return res.status(500).json({
        success: false,
        error: 'Storage not available'
      });
    }

    // Validate and fix tokens
    const result = await instagramTokenValidator.validateAndFixToken(storage, workspaceId, forceRefresh);

    res.json(result);
  } catch (error) {
    console.error('[TOKEN HEALTH API] Error validating tokens:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      accounts: [],
      issues: []
    });
  }
});

/**
 * GET /api/instagram/token-health/status/:workspaceId
 * Get current token health status for a workspace
 */
router.get('/status/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;

    console.log(`[TOKEN HEALTH API] Getting status for workspace: ${workspaceId}`);

    // Get storage instance
    const storage = req.app.locals.storage;
    if (!storage) {
      return res.status(500).json({
        success: false,
        error: 'Storage not available'
      });
    }

    // Get Instagram accounts for this workspace
    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    const instagramAccounts = accounts.filter(acc => acc.platform === 'instagram');

    if (instagramAccounts.length === 0) {
      return res.json({
        success: true,
        message: 'No Instagram accounts found',
        accounts: [],
        totalAccounts: 0,
        connectedAccounts: 0,
        healthyAccounts: 0
      });
    }

    // Check each account's basic health
    const accountStatus = instagramAccounts.map(account => ({
      id: account.id,
      username: account.username,
      hasToken: !!account.accessToken,
      tokenFormat: account.accessToken?.includes('aes-256-gcm:') ? 'encrypted' : 'decrypted',
      isActive: account.isActive,
      lastSyncAt: account.lastSyncAt,
      needsReconnection: account.needsReconnection || false
    }));

    const connectedAccounts = accountStatus.filter(acc => acc.hasToken).length;
    const healthyAccounts = accountStatus.filter(acc => acc.hasToken && acc.tokenFormat === 'decrypted').length;

    res.json({
      success: true,
      accounts: accountStatus,
      totalAccounts: instagramAccounts.length,
      connectedAccounts,
      healthyAccounts,
      issues: accountStatus.filter(acc => !acc.hasToken || acc.tokenFormat === 'encrypted' || acc.needsReconnection)
    });
  } catch (error) {
    console.error('[TOKEN HEALTH API] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/instagram/token-health/fix/:accountId
 * Fix a specific Instagram account's token issues
 */
router.post('/fix/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    console.log(`[TOKEN HEALTH API] Fixing token for account: ${accountId}`);

    // Get storage instance
    const storage = req.app.locals.storage;
    if (!storage) {
      return res.status(500).json({
        success: false,
        error: 'Storage not available'
      });
    }

    // Get the specific account
    const account = await storage.getSocialAccount(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    if (account.platform !== 'instagram') {
      return res.status(400).json({
        success: false,
        error: 'Account is not an Instagram account'
      });
    }

    // Validate and fix this specific account
    const result = await instagramTokenValidator.validateSingleAccount(storage, account, true);

    res.json({
      success: true,
      account: result,
      fixed: result.fixed,
      isValid: result.isValid
    });
  } catch (error) {
    console.error('[TOKEN HEALTH API] Error fixing account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/instagram/token-health/stats
 * Get overall token health statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const validatorStats = instagramTokenValidator.getValidationStats();
    const healthCheckerStats = tokenHealthChecker.getHealthStats();

    res.json({
      success: true,
      validator: validatorStats,
      healthChecker: healthCheckerStats,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[TOKEN HEALTH API] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/instagram/token-health/clear-cache
 * Clear validation cache
 */
router.post('/clear-cache', async (req, res) => {
  try {
    const { accountId } = req.body;

    instagramTokenValidator.clearCache(accountId);

    res.json({
      success: true,
      message: accountId ? `Cache cleared for account ${accountId}` : 'All cache cleared'
    });
  } catch (error) {
    console.error('[TOKEN HEALTH API] Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;