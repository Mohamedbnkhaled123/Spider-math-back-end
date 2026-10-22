import { Router } from 'express';
import { lecturesController } from './controllers/lectures.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { deviceLockGuard } from '../../middlewares/device-lock.middleware';
import { requireActiveSubscription } from '../../middlewares/subscription.middleware';
import { validateBody } from '../../middlewares/validate.middleware';
import { watchHeartbeatDtoSchema } from './dto/watch-heartbeat.dto';

export const lecturesRouter = Router();

// All lecture DRM streaming endpoints require valid JWT authentication & device lock
lecturesRouter.use(authenticateJwt, deviceLockGuard);

/**
 * GET /api/v1/lectures/:id/secure-playback
 * Validates subscription/trial access, returns session playback token & dynamic watermark.
 */
lecturesRouter.get(
  '/:id/secure-playback',
  requireActiveSubscription,
  lecturesController.getSecurePlayback
);

/**
 * GET /api/v1/lectures/:id/pdf/:fileId/stream
 * Streams private Google Drive study handout with X-Print-Allowed header.
 */
lecturesRouter.get(
  '/:id/pdf/:fileId/stream',
  requireActiveSubscription,
  lecturesController.streamGoogleDrivePdf
);

/**
 * POST /api/v1/lectures/:id/watch-heartbeat
 * 5-second chunk verification bitmask, presence tracking, and atomic XP award.
 */
lecturesRouter.post(
  '/:id/watch-heartbeat',
  requireActiveSubscription,
  validateBody(watchHeartbeatDtoSchema),
  lecturesController.recordWatchHeartbeat
);
