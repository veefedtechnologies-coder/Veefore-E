/**
 * P3: Privacy & GDPR API Routes
 * 
 * Comprehensive privacy API endpoints for GDPR compliance including
 * consent management, data export, deletion requests, and privacy controls
 */

import { Router, Request, Response } from 'express';
import { 
  DataPrivacyController, 
  DataExportService, 
  DataDeletionService 
} from '../security/gdpr-compliance';
import { 
  standardPrivacyMiddleware,
  highPrivacyMiddleware,
  cookieConsentMiddleware 
} from '../security/privacy-middleware';

const router = Router();

// Apply privacy middleware to all privacy routes
router.use(cookieConsentMiddleware());
router.use(standardPrivacyMiddleware);

/**
 * P3-API-1: Consent Management Endpoints
 */

// Grant consent for specific purposes
router.post('/consent', (req: Request, res: Response) => {
  try {
    const { consentType, purposes, granted } = req.body;
    const userId = req.user?.id;
    const workspaceId = req.workspace?.id || 'global';

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!consentType || typeof granted !== 'boolean') {
      return res.status(400).json({ 
        error: 'Missing required fields: consentType, granted' 
      });
    }

    const consentId = DataPrivacyController.recordConsent(
      userId,
      workspaceId,
      consentType,
      granted,
      purposes || [],
      req
    );

    res.json({
      success: true,
      consentId,
      message: `Consent ${granted ? 'granted' : 'denied'} for ${consentType}`
    });

  } catch (error) {
    console.error('Privacy consent error:', error);
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

// Get user's consent history
router.get('/consent/history', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const consentHistory = DataPrivacyController.getUserConsentHistory(userId);

    res.json({
      success: true,
      consents: consentHistory,
      totalConsents: consentHistory.length
    });

  } catch (error) {
    console.error('Consent history error:', error);
    res.status(500).json({ error: 'Failed to retrieve consent history' });
  }
});

// Check specific consent status
router.get('/consent/:consentType', (req: Request, res: Response) => {
  try {
    const { consentType } = req.params;
    const { purpose } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasConsent = DataPrivacyController.hasConsent(
      userId,
      consentType,
      purpose as string
    );

    res.json({
      success: true,
      consentType,
      purpose: purpose || 'general',
      hasConsent,
      required: true
    });

  } catch (error) {
    console.error('Consent check error:', error);
    res.status(500).json({ error: 'Failed to check consent status' });
  }
});

/**
 * P3-API-2: Data Export Endpoints (Right to Data Portability)
 */

// Request data export
router.post('/export', highPrivacyMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspace?.id || 'global';
    const { format = 'json' } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has consent for data processing
    const hasConsent = DataPrivacyController.hasConsent(userId, 'data_processing');
    if (!hasConsent) {
      return res.status(403).json({ 
        error: 'Data processing consent required for export' 
      });
    }

    const exportData = await DataExportService.exportUserData(
      userId,
      workspaceId,
      format
    );

    const exportId = `export_${userId}_${Date.now()}`;
    const downloadLink = DataExportService.generateExportLink(userId, exportId);

    res.json({
      success: true,
      exportId,
      downloadLink,
      expiresIn: '24 hours',
      format,
      dataTypes: Object.keys(exportData).filter(key => key !== 'exportMetadata'),
      exportMetadata: exportData.exportMetadata
    });

  } catch (error) {
    console.error('Data export error:', error);
    res.status(500).json({ error: 'Failed to generate data export' });
  }
});

// Download exported data
router.get('/export/:exportId', (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;
    const { token, expires } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate export request
    if (!token || !expires) {
      return res.status(400).json({ error: 'Invalid export link' });
    }

    const expirationTime = parseInt(expires as string);
    if (Date.now() > expirationTime) {
      return res.status(410).json({ error: 'Export link has expired' });
    }

    // In production, this would fetch the actual export data
    res.json({
      success: true,
      message: 'Export data would be downloaded here',
      exportId,
      downloadUrl: `/api/privacy/download/${exportId}`,
      note: 'This is a demo response - production would serve actual file'
    });

  } catch (error) {
    console.error('Export download error:', error);
    res.status(500).json({ error: 'Failed to download export' });
  }
});

/**
 * P3-API-3: Data Deletion Endpoints (Right to be Forgotten)
 */

// Request data deletion
router.post('/deletion/request', highPrivacyMiddleware, (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { 
      reason = 'user_request', 
      gracePeriodDays = 30,
      dataTypes = ['all']
    } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const deletionId = DataDeletionService.requestDataDeletion(
      userId,
      reason,
      gracePeriodDays,
      dataTypes
    );

    res.json({
      success: true,
      deletionId,
      scheduledFor: new Date(Date.now() + (gracePeriodDays * 24 * 60 * 60 * 1000)),
      gracePeriodDays,
      dataTypes,
      cancellationPossible: true,
      message: `Data deletion scheduled for ${gracePeriodDays} days from now`
    });

  } catch (error) {
    console.error('Data deletion request error:', error);
    res.status(500).json({ error: 'Failed to schedule data deletion' });
  }
});

// Cancel data deletion
router.post('/deletion/:deletionId/cancel', (req: Request, res: Response) => {
  try {
    const { deletionId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const cancelled = DataDeletionService.cancelDataDeletion(deletionId, userId);

    if (cancelled) {
      res.json({
        success: true,
        message: 'Data deletion cancelled successfully',
        deletionId
      });
    } else {
      res.status(400).json({
        error: 'Cannot cancel deletion - either not found, not yours, or grace period expired'
      });
    }

  } catch (error) {
    console.error('Deletion cancellation error:', error);
    res.status(500).json({ error: 'Failed to cancel deletion' });
  }
});

// Get deletion status
router.get('/deletion/:deletionId/status', (req: Request, res: Response) => {
  try {
    const { deletionId } = req.params;

    const status = DataDeletionService.getDeletionStatus(deletionId);

    if (!status) {
      return res.status(404).json({ error: 'Deletion request not found' });
    }

    res.json({
      success: true,
      deletion: status
    });

  } catch (error) {
    console.error('Deletion status error:', error);
    res.status(500).json({ error: 'Failed to get deletion status' });
  }
});

/**
 * P3-API-4: Data Processing Transparency
 */

// Get user's data processing history
router.get('/processing/history', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const processingHistory = DataPrivacyController.getUserDataProcessingHistory(userId);

    res.json({
      success: true,
      processing: processingHistory,
      totalActivities: processingHistory.length,
      dataTypes: [...new Set(processingHistory.map(p => p.dataType))],
      purposes: [...new Set(processingHistory.map(p => p.purpose))]
    });

  } catch (error) {
    console.error('Processing history error:', error);
    res.status(500).json({ error: 'Failed to retrieve processing history' });
  }
});

/**
 * P3-API-5: Privacy Settings
 */

// Get privacy settings
router.get('/settings', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // In production, fetch from database
    const privacySettings = {
      dataProcessing: DataPrivacyController.hasConsent(userId, 'data_processing'),
      marketing: DataPrivacyController.hasConsent(userId, 'marketing'),
      analytics: DataPrivacyController.hasConsent(userId, 'analytics'),
      cookies: DataPrivacyController.hasConsent(userId, 'cookies'),
      profileVisibility: 'public', // Would fetch from DB
      dataSharing: false, // Would fetch from DB
      emailNotifications: true // Would fetch from DB
    };

    res.json({
      success: true,
      settings: privacySettings,
      lastUpdated: new Date(),
      gdprCompliant: true
    });

  } catch (error) {
    console.error('Privacy settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve privacy settings' });
  }
});

// Update privacy settings
router.put('/settings', (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspace?.id || 'global';
    const settings = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Update consent records based on settings
    Object.entries(settings).forEach(([key, value]) => {
      if (['dataProcessing', 'marketing', 'analytics', 'cookies'].includes(key)) {
        let consentType: 'data_processing' | 'marketing' | 'analytics' | 'cookies';
        
        switch (key) {
          case 'dataProcessing':
            consentType = 'data_processing';
            break;
          case 'marketing':
            consentType = 'marketing';
            break;
          case 'analytics':
            consentType = 'analytics';
            break;
          case 'cookies':
            consentType = 'cookies';
            break;
          default:
            return; // Skip unknown keys
        }
        
        DataPrivacyController.recordConsent(
          userId,
          workspaceId,
          consentType,
          value as boolean,
          [],
          req
        );
      }
    });

    res.json({
      success: true,
      message: 'Privacy settings updated successfully',
      updatedAt: new Date()
    });

  } catch (error) {
    console.error('Privacy settings update error:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

/**
 * P3-API-6: Privacy Policy & Legal
 */

// Get privacy policy
router.get('/policy', (req: Request, res: Response) => {
  res.json({
    success: true,
    policy: {
      version: process.env.PRIVACY_POLICY_VERSION || '1.0',
      lastUpdated: '2025-09-03',
      gdprCompliant: true,
      dataController: 'VeeFore Social Media Management',
      contactEmail: 'privacy@veefore.com',
      retentionPeriods: {
        userData: '7 years',
        socialContent: '3 years',
        analytics: '2 years',
        logs: '3 months'
      },
      userRights: [
        'Right to access',
        'Right to rectification',
        'Right to erasure',
        'Right to restrict processing',
        'Right to data portability',
        'Right to object',
        'Rights related to automated decision making'
      ]
    }
  });
});

export default router;