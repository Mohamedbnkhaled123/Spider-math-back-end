import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import mongoose from 'mongoose';
import { env } from './config/env.config';
import { errorHandler } from './middlewares/error-handler.middleware';
import { generalRateLimiter } from './middlewares/rate-limiter.middleware';
import { createSuccessResponse } from './common/interfaces/api-response.interface';
import { AppError } from './common/utils/app-error.util';
import { ERROR_CODES } from './common/constants/error-codes.constant';
import {
  deviceWhitelistCache,
  studentPresenceCache,
  publicCmsCache,
  assessmentAnswerKeyCache
} from './config/cache.config';
import { authRouter, adminDeviceRouter, adminUsersRouter } from './modules/auth/auth.routes';
import { publicRouter } from './modules/public-discovery/public.routes';
import { publicController } from './modules/public-discovery/controllers/public.controller';
import { leadsRouter } from './modules/leads-placement/leads.routes';
import { cmsRouter } from './modules/admin-cms/cms.routes';
import { unitsRouter, adminUnitsRouter } from './modules/units-subscriptions/units.routes';
import { subscriptionsRouter, adminSubscriptionsRouter } from './modules/units-subscriptions/subscriptions.routes';
import { lecturesRouter } from './modules/lectures-media/lectures.routes';
import {
  assessmentsRouter,
  adminAssessmentsRouter,
  adminSubmissionsRouter
} from './modules/assessments-grading/assessments.routes';
import {
  gamificationRouter,
  adminGamificationRouter
} from './modules/gamification-alerts/gamification.routes';
import { notificationsRouter } from './modules/gamification-alerts/notifications.routes';
import { parentRouter } from './modules/parent-portal/parent.routes';
import {
  adminBackupRouter,
  adminMaintenanceRouter
} from './modules/admin-cms/admin-backup.routes';

/**
 * Express Application Bootstrap
 * Configured with security headers, CORS, compression, and unified error handling.
 */
export function createApp(): Application {
  const app: Application = express();

  // 1. Trust proxy when deployed behind Vercel or reverse proxies
  app.set('trust proxy', 1);

  // 2. HTTP Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Managed by Angular SSR / Meta tags
      crossOriginEmbedderPolicy: false
    })
  );

  // 3. Cross-Origin Resource Sharing (CORS)
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Device-UUID',
        'X-Idempotency-Key',
        'X-Request-ID'
      ],
      exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining']
    })
  );

  // 4. Gzip / Deflate Response Compression
  app.use(compression());

  // 5. Body Parsers (Strictly capped at 1MB — Homework photos bypass Express via direct Cloudinary upload)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 6. Global Rate Limiter
  app.use('/api', generalRateLimiter);

  // 7. System Health Check Endpoint
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    const dbState = mongoose.connection.readyState;
    const dbStatusMap: Record<number, string> = {
      0: 'DISCONNECTED',
      1: 'CONNECTED',
      2: 'CONNECTING',
      3: 'DISCONNECTING'
    };

    const healthData = {
      status: dbState === 1 ? 'HEALTHY' : 'DEGRADED',
      environment: env.NODE_ENV,
      database: {
        status: dbStatusMap[dbState] || 'UNKNOWN',
        readyState: dbState
      },
      cache: {
        deviceWhitelistEntries: deviceWhitelistCache.size(),
        activeStudentPresences: studentPresenceCache.size(),
        cachedCmsSnapshots: publicCmsCache.size(),
        cachedAssessmentKeys: assessmentAnswerKeyCache.size()
      },
      process: {
        uptimeSec: Math.floor(process.uptime()),
        memoryUsageMb: {
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        }
      }
    };

    res.status(dbState === 1 ? 200 : 503).json(createSuccessResponse(healthData));
  });

  // 8. Root Level SEO Sitemap
  app.get('/sitemap.xml', publicController.getSitemapXml);

  // 9. Domain REST API Routers
  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/units', unitsRouter);
  app.use('/api/v1/subscriptions', subscriptionsRouter);
  app.use('/api/v1/lectures', lecturesRouter);
  app.use('/api/v1/assessments', assessmentsRouter);
  app.use('/api/v1/gamification', gamificationRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/parent', parentRouter);
  app.use('/api/v1/admin/device-requests', adminDeviceRouter);
  app.use('/api/v1/admin/users', adminUsersRouter);
  app.use('/api/v1/admin/leads', leadsRouter);
  app.use('/api/v1/admin/cms-config', cmsRouter);
  app.use('/api/v1/admin/units', adminUnitsRouter);
  app.use('/api/v1/admin/subscriptions', adminSubscriptionsRouter);
  app.use('/api/v1/admin/assessments', adminAssessmentsRouter);
  app.use('/api/v1/admin/submissions', adminSubmissionsRouter);
  app.use('/api/v1/admin/gamification', adminGamificationRouter);
  app.use('/api/v1/admin/backup', adminBackupRouter);
  app.use('/api/v1/admin/maintenance', adminMaintenanceRouter);

  // 10. 404 Handler for Unmatched API Endpoints
  app.use('/api/*', (req: Request, _res: Response, next: NextFunction) => {
    next(
      new AppError(
        `Cannot ${req.method} ${req.originalUrl} — Endpoint not found`,
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND_404
      )
    );
  });

  // 9. Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
