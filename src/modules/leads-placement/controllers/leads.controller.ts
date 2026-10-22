import { Request, Response, NextFunction } from 'express';
import { leadsService } from '../services/leads.service';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { LeadsFilterDto } from '../dto/leads-filter.dto';

export class LeadsController {
  /**
   * GET /api/v1/admin/leads
   * Paginated and filterable Leads CRM list for Super Admin.
   */
  public async getLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = req.query as unknown as LeadsFilterDto;
      const result = await leadsService.getLeads(filters);
      res.status(200).json(createSuccessResponse(result.leads, result.pagination));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/leads/:id/status
   * Updates lead status enforcing state machine rules (NEW -> CONTACTED_WHATSAPP -> CONVERTED_SUBSCRIBER).
   */
  public async updateLeadStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const leadId = req.params.id!;
      const { status, adminNotes } = req.body;
      const updatedLead = await leadsService.updateLeadStatus(leadId, status, adminNotes);
      res.status(200).json(createSuccessResponse(updatedLead));
    } catch (error) {
      next(error);
    }
  }
}

export const leadsController = new LeadsController();
