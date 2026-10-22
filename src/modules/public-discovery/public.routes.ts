import { Router } from 'express';
import { publicController } from './controllers/public.controller';
import { validateRequest, validateBody } from '../../middlewares/validate.middleware';
import { placementQueryDtoSchema } from '../leads-placement/dto/placement-query.dto';
import { submitPlacementDtoSchema } from '../leads-placement/dto/submit-placement.dto';
import { unlockPlacementDtoSchema } from '../leads-placement/dto/unlock-placement.dto';

export const publicRouter = Router();

/**
 * GET /api/v1/public/curriculum-tree
 * Dynamic 5-level taxonomy with availability flags
 */
publicRouter.get('/curriculum-tree', publicController.getCurriculumTree);

/**
 * GET /api/v1/public/landing-data
 * Cached landing page configuration (10m TTL)
 */
publicRouter.get('/landing-data', publicController.getLandingData);

/**
 * GET /api/v1/public/placement-test
 * Sanitized questions for placement assessment
 */
publicRouter.get(
  '/placement-test',
  validateRequest({ query: placementQueryDtoSchema }),
  publicController.getPlacementTest
);

/**
 * POST /api/v1/public/placement-test/submit-anonymous
 * Submit answers and generate unclaimed attempt
 */
publicRouter.post(
  '/placement-test/submit-anonymous',
  validateBody(submitPlacementDtoSchema),
  publicController.submitPlacementTest
);

/**
 * POST /api/v1/public/placement-test/:attemptId/unlock
 * Lead Gate unlock with WhatsApp pre-filled alert link
 */
publicRouter.post(
  '/placement-test/:attemptId/unlock',
  validateBody(unlockPlacementDtoSchema),
  publicController.unlockPlacementTest
);

/**
 * GET /api/v1/public/sitemap.xml
 */
publicRouter.get('/sitemap.xml', publicController.getSitemapXml);
