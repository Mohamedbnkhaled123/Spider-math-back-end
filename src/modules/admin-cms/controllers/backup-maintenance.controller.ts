import { Request, Response, NextFunction } from 'express';
import { BackupMaintenanceService } from '../services/backup-maintenance.service';

export class BackupMaintenanceController {
  constructor(private backupMaintenanceService: BackupMaintenanceService) {}

  /**
   * 1-Click MongoDB M0 Full JSON Backup Export
   * GET /api/v1/admin/backup/export
   */
  exportBackup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.backupMaintenanceService.generateFullBackup(req.user!.sub);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.status(200).send(JSON.stringify(result.payload, null, 2));
    } catch (error) {
      next(error);
    }
  };

  /**
   * Term End Storage Maintenance: Purge old student homework photos from Cloudinary
   * POST /api/v1/admin/maintenance/purge-term-homework
   */
  purgeTermHomework = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.backupMaintenanceService.purgeEphemeralHomeworkPhotos();
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };
}
