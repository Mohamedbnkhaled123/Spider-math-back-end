import { Request, Response, NextFunction } from 'express';
import { curriculumTreeService } from '../services/curriculum-tree.service';
import { cmsService } from '../../admin-cms/services/cms.service';
import { placementService } from '../../leads-placement/services/placement.service';
import { sitemapService } from '../services/sitemap.service';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { PlacementQueryDto } from '../../leads-placement/dto/placement-query.dto';

export class PublicController {
  /**
   * GET /api/v1/public/curriculum-tree
   * Returns complete 4-curriculum tree with dynamic availability flags computed from MongoDB.
   */
  public async getCurriculumTree(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tree = await curriculumTreeService.getDynamicCurriculumTree();
      res.status(200).json(createSuccessResponse(tree));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/landing-data
   * Serves public landing page CMS payload from LRUCache (10-minute TTL).
   */
  public async getLandingData(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const landingData = await cmsService.getPublicLandingData();
      res.status(200).json(createSuccessResponse(landingData));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/placement-test?curriculum=EGYPTIAN&gradeLevel=SEC_3&term=TERM_1
   * Fetches sanitized placement test questions with hidden answer keys.
   */
  public async getPlacementTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as PlacementQueryDto;
      const testData = await placementService.getSanitizedPlacementQuestions(query);
      res.status(200).json(createSuccessResponse(testData));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/placement-test/submit-anonymous
   * Evaluates answers and saves unclaimed attempt with 48h TTL. Returns attemptId.
   */
  public async submitPlacementTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await placementService.submitAnonymousPlacement(req.body);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/placement-test/:attemptId/unlock
   * Lead Gate: Unlocks placement report, creates Lead, and generates WhatsApp pre-filled link.
   */
  public async unlockPlacementTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const attemptId = req.params.attemptId!;
      const report = await placementService.unlockPlacementAttempt(attemptId, req.body);
      res.status(200).json(createSuccessResponse(report));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /sitemap.xml
   * Serves standard XML sitemap for SEO crawlers.
   */
  public async getSitemapXml(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const xml = await sitemapService.generateSitemapXml();
      res.header('Content-Type', 'application/xml');
      res.status(200).send(xml);
    } catch (error) {
      next(error);
    }
  }
}

export const publicController = new PublicController();
