import { Router } from 'express';
import { authController } from '../../controllers';

const router = Router();

router.get('/session', authController.getSession);
router.post('/link-firebase', authController.linkFirebase);
router.get('/user', authController.getCurrentUser);
router.post('/record-login', authController.recordLogin);

export default router;
