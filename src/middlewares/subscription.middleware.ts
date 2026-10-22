import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../common/utils/app-error.util';
import { ERROR_CODES } from '../common/constants/error-codes.constant';
import { ROLES } from '../common/constants/roles.constant';
import { SubscriptionModel } from '../models/subscription.model';
import { LectureMaterialModel } from '../models/lecture-material.model';

/**
 * Subscription Verification Middleware
 * Verifies that the authenticated student holds an active, unexpired subscription to the target unit package.
 * Bypasses immediately if:
 * 1. User has SUPER_ADMIN role.
 * 2. The targeted lecture has `is_free_trial === true`.
 */
export async function requireActiveSubscription(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || !req.user.sub) {
      return next(
        new AppError('Unauthorized: Authentication required', 401, ERROR_CODES.UNAUTHORIZED_401)
      );
    }

    // Super Admin has unrestricted access to all educational content
    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    // Extract target identifier from route parameters, query, or body
    const rawId = req.params.lectureId || req.params.unitId || req.params.id || req.body?.unit_package_id || req.query?.unitId;
    if (!rawId || typeof rawId !== 'string' || !Types.ObjectId.isValid(rawId)) {
      return next(
        new AppError('Target unit or lecture identifier is missing or malformed', 400, ERROR_CODES.BAD_REQUEST_400)
      );
    }

    let targetUnitId: string | Types.ObjectId = rawId;

    // Check if the targeted resource is a Lecture (to check is_free_trial bypass)
    const isLectureRoute = req.baseUrl.includes('lectures') || req.path.includes('lecture');
    if (isLectureRoute) {
      const lecture = await LectureMaterialModel.findById(rawId)
        .select('unit_package_id is_free_trial')
        .lean();

      if (!lecture) {
        return next(
          new AppError('Target lecture material not found', 404, ERROR_CODES.LECTURE_NOT_FOUND_404)
        );
      }

      // Free trial lectures are accessible to all authenticated students without a subscription
      if (lecture.is_free_trial) {
        return next();
      }

      targetUnitId = lecture.unit_package_id;
    }

    // Verify active subscription in database
    const subscription = await SubscriptionModel.findOne({
      student_id: req.user.sub,
      unit_package_id: targetUnitId,
      subscription_status: 'ACTIVE',
      expires_at: { $gt: new Date() }
    }).lean();

    if (subscription) {
      return next();
    }

    // Check if subscription exists but is frozen
    const frozenSub = await SubscriptionModel.findOne({
      student_id: req.user.sub,
      unit_package_id: targetUnitId,
      subscription_status: 'FROZEN'
    }).lean();

    if (frozenSub) {
      return next(
        new AppError(
          'Your subscription to this unit is currently frozen. Please unfreeze it to access contents.',
          403,
          ERROR_CODES.SUBSCRIPTION_FROZEN_403
        )
      );
    }

    return next(
      new AppError(
        'Active subscription required to access this educational content',
        403,
        ERROR_CODES.NO_ACTIVE_SUBSCRIPTION_403
      )
    );
  } catch (error) {
    return next(error);
  }
}
