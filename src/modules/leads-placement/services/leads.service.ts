import { Types } from 'mongoose';
import { LeadModel, LeadStatus } from '../../../models/lead.model';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { LeadsFilterDto } from '../dto/leads-filter.dto';

/**
 * State Transition Guard for Spider Math Leads CRM
 * Strictly enforces allowed transitions per RULES.md Section 4.3:
 * NEW -> CONTACTED_WHATSAPP -> CONVERTED_SUBSCRIBER
 * ANY -> ARCHIVED
 * FORBIDDEN: CONVERTED_SUBSCRIBER -> NEW
 */
export function assertValidLeadStatusTransition(currentStatus: LeadStatus, nextStatus: LeadStatus): void {
  if (currentStatus === nextStatus) return;

  // Any state can transition to ARCHIVED
  if (nextStatus === 'ARCHIVED') return;

  if (currentStatus === 'NEW' && (nextStatus === 'CONTACTED_WHATSAPP' || nextStatus === 'CONVERTED_SUBSCRIBER')) {
    return;
  }

  if (currentStatus === 'CONTACTED_WHATSAPP' && nextStatus === 'CONVERTED_SUBSCRIBER') {
    return;
  }

  throw new AppError(
    `Invalid lead status transition from '${currentStatus}' to '${nextStatus}'`,
    400,
    ERROR_CODES.INVALID_STATE_TRANSITION_400
  );
}

export class LeadsService {
  /**
   * Retrieves paginated leads filtered by curriculum, grade level, and status.
   */
  public async getLeads(filters: LeadsFilterDto) {
    const query: Record<string, unknown> = {};

    if (filters.curriculum) {
      query.curriculum = filters.curriculum;
    }
    if (filters.gradeLevel) {
      query.grade_level = filters.gradeLevel;
    }
    if (filters.status) {
      query.lead_status = filters.status;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [leads, totalCount] = await Promise.all([
      LeadModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('placement_test_attempt_id', 'score_percentage academic_level_badge')
        .lean(),
      LeadModel.countDocuments(query)
    ]);

    return {
      leads,
      pagination: {
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * Updates lead status enforcing state machine rules.
   */
  public async updateLeadStatus(leadId: string, nextStatus: LeadStatus, adminNotes?: string) {
    if (!Types.ObjectId.isValid(leadId)) {
      throw new AppError('Invalid leadId identifier format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const lead = await LeadModel.findById(leadId);
    if (!lead) {
      throw new AppError('Lead not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    assertValidLeadStatusTransition(lead.lead_status, nextStatus);

    lead.lead_status = nextStatus;
    if (adminNotes !== undefined) {
      lead.admin_notes = adminNotes;
    }

    await lead.save();

    return lead;
  }
}

export const leadsService = new LeadsService();
