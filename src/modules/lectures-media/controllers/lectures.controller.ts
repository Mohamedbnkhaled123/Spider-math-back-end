import { Request, Response, NextFunction } from 'express';
import { lecturesService } from '../services/lectures.service';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';

export class LecturesController {
  /**
   * GET /api/v1/lectures/:id/secure-playback
   * Returns session DRM token and dynamic student anti-tamper watermark.
   */
  public async getSecurePlayback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lectureId = req.params.id!;
      const studentId = req.user!.sub;
      const deviceUuid = req.deviceUuid || req.user!.deviceUuid;
      const playbackData = await lecturesService.getSecurePlayback({
        lectureId,
        studentId,
        deviceUuid,
        ipAddress: req.ip
      });
      res.status(200).json(createSuccessResponse(playbackData));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/lectures/:id/pdf/:fileId/stream
   * Streams private Google Drive PDF study handouts with X-Print-Allowed header.
   */
  public async streamGoogleDrivePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lectureId = req.params.id!;
      const fileId = req.params.fileId!;
      await lecturesService.streamGoogleDrivePdf({ lectureId, fileId, res });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/lectures/:id/watch-heartbeat
   * Verifies 5-second chunk bitmask, updates presence cache, and atomically awards XP.
   */
  public async recordWatchHeartbeat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lectureId = req.params.id!;
      const studentId = req.user!.sub;
      const result = await lecturesService.recordWatchHeartbeat({
        lectureId,
        studentId,
        dto: req.body
      });
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }
}

export const lecturesController = new LecturesController();
