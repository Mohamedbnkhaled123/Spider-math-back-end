import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/utils/app-error.util';
import { ERROR_CODES } from '../common/constants/error-codes.constant';
import { ROLES } from '../common/constants/roles.constant';
import { deviceWhitelistCache } from '../config/cache.config';
import { UserModel } from '../models/user.model';

/**
 * Additive Device Lock Guard Middleware
 * Validates X-Device-UUID header against student's approved_devices[] via LRUCache (5-minute TTL).
 * If unrecognized, returns HTTP 423 Locked (DEVICE_PENDING_APPROVAL_423) with { existingDevicesActive: true }.
 * Preserves active sessions on existing devices without eviction.
 */
export async function deviceLockGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const deviceUuid = req.header('X-Device-UUID')?.trim();
    if (!deviceUuid || deviceUuid.length < 16) {
      return next(
        new AppError('Missing or malformed X-Device-UUID header', 400, ERROR_CODES.INVALID_DEVICE_HEADER_400)
      );
    }

    req.deviceUuid = deviceUuid;

    // Super Admin and Parent roles bypass student device lock
    if (req.user && req.user.role !== ROLES.STUDENT) {
      return next();
    }

    const studentId = req.user?.sub;
    if (!studentId) {
      return next(
        new AppError('Unauthorized: Missing user authentication context', 401, ERROR_CODES.UNAUTHORIZED_401)
      );
    }

    const cacheKey = `device_whitelist:${studentId}`;
    let whitelistSet = deviceWhitelistCache.get(cacheKey);

    if (!whitelistSet) {
      const student = await UserModel.findById(studentId)
        .select('approved_devices.device_uuid account_lock_status')
        .lean();

      if (!student) {
        return next(new AppError('Student account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404));
      }

      if (student.account_lock_status === 'SUSPENDED') {
        return next(
          new AppError('Account is suspended. Contact Eng. Heba Abdel-Wahab.', 423, ERROR_CODES.ACCOUNT_SUSPENDED_423)
        );
      }

      whitelistSet = new Set<string>(student.approved_devices.map((d: { device_uuid: string }) => d.device_uuid));
      deviceWhitelistCache.set(cacheKey, whitelistSet, 5 * 60 * 1000);
    }

    if (whitelistSet.has(deviceUuid)) {
      return next();
    }

    // Device not found in student's approved list -> Return HTTP 423 Locked
    return next(
      new AppError(
        'Waiting for Eng. Heba Abdel-Wahab approval for this device',
        423,
        ERROR_CODES.DEVICE_PENDING_APPROVAL_423,
        {
          existingDevicesActive: true,
          deviceUuid,
          studentId
        }
      )
    );
  } catch (error) {
    return next(error);
  }
}
