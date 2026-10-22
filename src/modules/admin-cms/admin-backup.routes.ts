import { Router } from 'express';
import { BackupMaintenanceService } from './services/backup-maintenance.service';
import { BackupMaintenanceController } from './controllers/backup-maintenance.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { ROLES } from '../../common/constants/roles.constant';

const backupMaintenanceService = new BackupMaintenanceService();
export const backupMaintenanceController = new BackupMaintenanceController(backupMaintenanceService);

// 1. Admin Backup Router (/api/v1/admin/backup)
export const adminBackupRouter = Router();
adminBackupRouter.use(authenticateJwt, requireRoles(ROLES.SUPER_ADMIN));

adminBackupRouter.get('/export', backupMaintenanceController.exportBackup);

// 2. Admin Maintenance Router (/api/v1/admin/maintenance)
export const adminMaintenanceRouter = Router();
adminMaintenanceRouter.use(authenticateJwt, requireRoles(ROLES.SUPER_ADMIN));

adminMaintenanceRouter.post('/purge-term-homework', backupMaintenanceController.purgeTermHomework);
