import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.config';
import { AppError } from '../common/utils/app-error.util';
import { IJwtPayload } from '../common/interfaces/auth-payload.interface';
import { UserModel } from '../models/user.model';

export const lastSeenWriteThrottle = new Map<string, number>();
export const THROTTLE_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Primes the write throttle map to avoid duplicate writes immediately after login
 */
export function primeStudentLastSeenThrottle(studentId: string, timestamp: number = Date.now()): void {
  lastSeenWriteThrottle.set(studentId, timestamp);
}

/**
 * Zero Extra Requests: Throttled Student Piggyback Presence Update (2-minute throttle)
 */
export function recordStudentLastSeen(studentId: string): void {
  if (!Types.ObjectId.isValid(studentId)) return;
  const now = Date.now();
  const lastUpdate = lastSeenWriteThrottle.get(studentId) || 0;
  if (now - lastUpdate >= THROTTLE_MS) {
    lastSeenWriteThrottle.set(studentId, now);
    if (lastSeenWriteThrottle.size > 5000) {
      const cutoff = now - THROTTLE_MS * 2;
      for (const [id, time] of lastSeenWriteThrottle.entries()) {
        if (time < cutoff) lastSeenWriteThrottle.delete(id);
      }
    }
    UserModel.updateOne({ _id: studentId }, { $set: { last_seen_at: new Date() } }).catch(() => {});
  }
}

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

    // Zero Extra Requests: Throttled Student Piggyback Presence Update (2-minute throttle)
    if (decoded.role === 'STUDENT') {
      recordStudentLastSeen(decoded.sub);
    }

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

          if (decoded.role === 'STUDENT') {
            recordStudentLastSeen(decoded.sub);
          }
        }
      } catch {
        // Silently proceed for optional auth if token is invalid or expired
      }
    }
  }

  next();
}

