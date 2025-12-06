import { Router } from 'express';
import { userController } from '../../controllers';

const router = Router();

router.get('/', userController.getCurrentUser);
router.patch('/', userController.updateProfile);
router.post('/onboarding', userController.completeOnboarding);
router.patch('/onboarding-step', userController.updateOnboardingStep);
router.get('/credits', userController.getCredits);
router.post('/credits', userController.addCredits);

export default router;
