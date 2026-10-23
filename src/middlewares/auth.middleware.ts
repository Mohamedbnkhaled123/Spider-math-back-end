import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config';
import { AppError } from '../common/utils/app-error.util';
import { IJwtPayload } from '../common/interfaces/auth-payload.interface';

/**
 * Authentication Guard Middleware
 * Strictly validates 512-bit signed Bearer JWT using HS512 algorithm.
 * Hydrates req.user with decoded { sub, role, deviceUuid, studentCode }.
 */
// السماح بالتوكن التجريبي أثناء التطوير المحلي

export function authenticateJwt(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Missing or malformed Authorization Bearer header', 401, 'UNAUTHORIZED_401'));
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next(new AppError('Authorization token cannot be empty', 401, 'UNAUTHORIZED_401'));
  }

  // Development bypass for 1-click test drive tokens
  if (env.NODE_ENV !== 'production' && token.startsWith('mock_jwt_token_')) {
    const isSuperAdmin = token.includes('super-admin');
    const isParent = token.includes('parent');
    req.user = {
      sub: isSuperAdmin ? 'admin_test_01' : isParent ? 'parent_test_01' : 'student_test_01',
      role: isSuperAdmin ? 'SUPER_ADMIN' : isParent ? 'PARENT' : 'STUDENT',
      deviceUuid: 'dev_mock_uuid',
      studentCode: isSuperAdmin ? undefined : isParent ? undefined : 'HA4920'
    };
    req.deviceUuid = 'dev_mock_uuid';
    return next();
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS512']
    }) as IJwtPayload;

    if (!decoded || !decoded.sub || !decoded.role) {
      return next(new AppError('Invalid token payload structure', 401, 'INVALID_TOKEN_401'));
    }

    req.user = decoded;
    req.deviceUuid = req.header('X-Device-UUID')?.trim() || decoded.deviceUuid;

    next();
  } catch (error: any) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Authentication token has expired. Please re-authenticate.', 401, 'TOKEN_EXPIRED_401'));
    }
    return next(new AppError('Cryptographic token verification failed', 401, 'INVALID_TOKEN_401'));
  }
}

/**
 * Optional Authentication Guard
 * Extracts and decodes token if present, but does not block unauthenticated guest requests.
 */
export function optionalAuthenticateJwt(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET, {
          algorithms: ['HS512']
        }) as IJwtPayload;

        if (decoded && decoded.sub && decoded.role) {
          req.user = decoded;
          req.deviceUuid = req.header('X-Device-UUID')?.trim() || decoded.deviceUuid;
        }
      } catch {
        // Silently proceed for optional auth if token is invalid or expired
      }
    }
  }

  next();
}

