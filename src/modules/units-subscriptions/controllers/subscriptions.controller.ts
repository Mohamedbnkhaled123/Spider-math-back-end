import { Request, Response, NextFunction } from 'express';
import { subscriptionsService } from '../services/subscriptions.service';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';

export class SubscriptionsController {
  /**
   * POST /api/v1/subscriptions/whatsapp-request-link
   */
  public async generateWhatsAppRequestLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.user!.sub;
      const { unitPackageId } = req.body;
      const result = await subscriptionsService.generateWhatsAppRequestLink(studentId, unitPackageId);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/subscriptions/activate
   */
  public async activateSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user!.sub;
      const subscription = await subscriptionsService.activateSubscription(adminId, req.body);
      res.status(200).json(createSuccessResponse(subscription));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/subscriptions/:id/status
   */
  public async updateSubscriptionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const subscriptionId = req.params.id!;
      const { status, freezeReason } = req.body;
      const updated = await subscriptionsService.updateSubscriptionStatus(subscriptionId, status, freezeReason);
      res.status(200).json(createSuccessResponse(updated));
    } catch (error) {
      next(error);
    }
  }
}

export const subscriptionsController = new SubscriptionsController();
