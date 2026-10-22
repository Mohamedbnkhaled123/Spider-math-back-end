import { Request, Response, NextFunction } from 'express';
import { cmsService } from '../services/cms.service';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';

export class CmsController {
  /**
   * GET /api/v1/admin/cms-config
   * Fetches full CMS configuration.
   */
  public async getCmsConfig(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await cmsService.getPublicLandingData();
      res.status(200).json(createSuccessResponse(config));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/admin/cms-config
   * Updates CMS configuration and invalidates RAM cache immediately.
   */
  public async updateCmsConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await cmsService.updateCmsConfig(req.body);
      res.status(200).json(createSuccessResponse(updated, { message: 'Landing page CMS updated and cache invalidated' }));
    } catch (error) {
      next(error);
    }
  }
}

export const cmsController = new CmsController();
