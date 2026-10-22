import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../common/constants/roles.constant';
import { AppError } from '../common/utils/app-error.util';
import { ERROR_CODES } from '../common/constants/error-codes.constant';

/**
 * Role-Based Access Control (RBAC) Guard
 * Strictly restricts route execution to users possessing one of the allowed roles.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.role) {
      return next(
        new AppError('Unauthorized: Authentication required', 401, ERROR_CODES.UNAUTHORIZED_401)
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden: Role '${req.user.role}' is not authorized to access this resource`,
          403,
          ERROR_CODES.ROLE_UNAUTHORIZED_403
        )
      );
    }

    next();
  };
}

export const authorizeRoles = requireRoles;

