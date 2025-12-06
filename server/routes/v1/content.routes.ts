import { Router } from 'express';
import { contentController } from '../../controllers';

const router = Router();

router.get('/drafts', contentController.getDrafts);
router.get('/scheduled', contentController.getScheduled);
router.get('/:contentId', contentController.getContent);
router.get('/', contentController.getByWorkspace);
router.post('/', contentController.createContent);
router.put('/:contentId', contentController.updateContent);
router.post('/:contentId/schedule', contentController.scheduleContent);
router.put('/:contentId/reschedule', contentController.rescheduleContent);
router.post('/:contentId/cancel-schedule', contentController.cancelSchedule);
router.post('/:contentId/archive', contentController.archiveContent);
router.delete('/:contentId', contentController.deleteContent);

export default router;
