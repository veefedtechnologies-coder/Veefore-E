/**
 * Auto Pilot — Media Pool routes.
 *
 * Defines the Media_Pool endpoints from the design's REST API table. These are
 * mounted under `/api/v1/autopilot` by the main Auto Pilot router (Task 18.1),
 * which composes this sub-router — keeping the media surface self-contained:
 *
 *   • POST   /missions/:id/media  → upload media to the pool (≤100MB, image/video)
 *   • GET    /missions/:id/media  → list the workspace's reusable pool
 *   • DELETE /media/:itemId       → remove a pool item
 *
 * Every route is protected by `requireAuth`; workspace/account ownership is
 * enforced inside the controller. Uploads use multer memory storage with a
 * 100MB ceiling (R6.5) so the buffer is handed straight to the controller for
 * validation and storage. A trailing error handler maps multer errors (e.g.
 * oversize files) to a 400 with a clear message.
 *
 * Satisfies Requirements: 6.1, 6.5, 6.6
 */

import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../../../middleware/require-auth'
import { mediaController } from '../controllers/media.controller'
import { MAX_MEDIA_SIZE_BYTES } from '../services/MediaPoolService'

// Memory storage: the controller validates the buffer then persists it via the
// shared StorageService. The 100MB limit mirrors the R6.5 pool bound so multer
// rejects grossly oversized uploads before they are buffered fully.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_SIZE_BYTES },
})

const mediaRouter = Router()

// Upload media to a mission workspace's pool (R6.1, R6.5).
mediaRouter.post(
  '/missions/:id/media',
  requireAuth,
  upload.single('file'),
  mediaController.uploadMedia.bind(mediaController),
)

// List the mission workspace's reusable pool (R6).
mediaRouter.get(
  '/missions/:id/media',
  requireAuth,
  mediaController.listMedia.bind(mediaController),
)

// Remove a pool item at the user's request (R6.6).
mediaRouter.delete(
  '/media/:itemId',
  requireAuth,
  mediaController.deleteMedia.bind(mediaController),
)

// Multer / upload error handler — keeps upload failures as clean 4xx responses.
mediaRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'File too large',
        message: 'The media exceeds the 100MB maximum. Please upload a smaller file.',
      })
      return
    }
    res.status(400).json({ error: 'Upload error', message: err.message })
    return
  }
  next(err as any)
})

export { mediaRouter }
export default mediaRouter
