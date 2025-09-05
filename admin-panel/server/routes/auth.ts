import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { validateLogin, validatePasswordChange } from '../middleware/validation';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/login', validateLogin, AuthController.login);
router.post('/logout', authenticate, AuthController.logout);

// Protected routes
router.get('/profile', authenticate, AuthController.getProfile);
router.post('/change-password', authenticate, validatePasswordChange, AuthController.changePassword);
router.post('/setup-2fa', authenticate, AuthController.setup2FA);
router.post('/verify-2fa', authenticate, AuthController.verify2FA);
router.post('/disable-2fa', authenticate, AuthController.disable2FA);
router.get('/sessions', authenticate, AuthController.getSessions);

export default router;
