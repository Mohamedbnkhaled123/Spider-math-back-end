import { Request, Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';
import { AppError } from '../common/utils/app-error.util';
import { ERROR_CODES } from '../common/constants/error-codes.constant';

interface RateLimitRecord {
  count: number;
  resetTimeMs: number;
}

/**
 * Creates an in-memory sliding-window rate limiter using LRUCache.
 * Eliminates external Redis dependency on zero-cost infrastructure.
 */
function createInMemoryRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  errorMessage: string;
  errorCode: string;
}) {
  const cache = new LRUCache<string, RateLimitRecord>({
    max: 10000,
    ttl: options.windowMs
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    // Determine client identifier: prefers forwarded-for behind proxies/Vercel
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const now = Date.now();
    const existing = cache.get(clientIp);

    if (!existing || now > existing.resetTimeMs) {
      cache.set(clientIp, {
        count: 1,
        resetTimeMs: now + options.windowMs
      });

      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', options.maxRequests - 1);
      return next();
    }

    if (existing.count >= options.maxRequests) {
      const retryAfterSec = Math.ceil((existing.resetTimeMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);

      return next(
        new AppError(
          options.errorMessage,
          429,
          options.errorCode as typeof ERROR_CODES.TOO_MANY_REQUESTS_429,
          { retryAfterSeconds: retryAfterSec }
        )
      );
    }

    existing.count += 1;
    cache.set(clientIp, existing);

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - existing.count));

    return next();
  };
}

/**
 * 1. General API Rate Limiter
 * 300 requests per 15-minute window for standard browsing and API interactions.
 */
export const generalRateLimiter = createInMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 300,
  errorMessage: 'Too many requests from this IP, please try again after 15 minutes.',
  errorCode: ERROR_CODES.TOO_MANY_REQUESTS_429
});

/**
 * 2. Strict Auth & Device Security Limiter
 * 15 requests per 15-minute window to prevent brute force attacks on authentication endpoints.
 */
export const authRateLimiter = createInMemoryRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
  errorMessage: 'Too many authentication attempts. Please try again after 15 minutes.',
  errorCode: ERROR_CODES.TOO_MANY_REQUESTS_429
});

/**
 * 3. High-Concurrency Exam Sync Burst Limiter
 * Designed specifically for 500-student synchronized submission spikes.
 * Allows 600 requests per 1-minute window so no student's submission is dropped during end-of-exam traffic.
 */
export const examSyncBurstLimiter = createInMemoryRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 600,     // Allows burst of 600 req/min
  errorMessage: 'Assessment synchronization queue overloaded. Client jitter will auto-retry.',
  errorCode: ERROR_CODES.EXAM_SUBMISSION_BURST_EXCEEDED_429
});
