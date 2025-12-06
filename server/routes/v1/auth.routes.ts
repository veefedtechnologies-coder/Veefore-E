import { Router } from 'express';
import { authController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { authRateLimiter } from '../../middleware/rate-limiting-working';
import { validateRequest } from '../../middleware/validation';
import { z } from 'zod';

const router = Router();

const SendVerificationSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
});

const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
});

const ResendVerificationSchema = z.object({
  email: z.string().email(),
});

const LinkFirebaseSchema = z.object({
  email: z.string().email(),
  firebaseUid: z.string().min(1),
  displayName: z.string().optional(),
});

router.get('/session', authController.getSession);

router.post('/link-firebase', 
  authRateLimiter, 
  validateRequest({ body: LinkFirebaseSchema }), 
  authController.linkFirebase
);

router.get('/user', requireAuth, authController.getCurrentUser);

router.post('/record-login', requireAuth, authController.recordLogin);

router.post('/associate-uid', authRateLimiter, authController.associateUid);

router.post('/send-verification', 
  authRateLimiter, 
  validateRequest({ body: SendVerificationSchema }), 
  authController.sendVerification
);

router.post('/send-verification-email', 
  authRateLimiter, 
  validateRequest({ body: SendVerificationSchema }), 
  authController.sendVerificationEmail
);

router.post('/verify-email', 
  authRateLimiter, 
  validateRequest({ body: VerifyEmailSchema }), 
  authController.verifyEmail
);

router.post('/resend-verification', 
  authRateLimiter, 
  validateRequest({ body: ResendVerificationSchema }), 
  authController.resendVerification
);

export default router;
