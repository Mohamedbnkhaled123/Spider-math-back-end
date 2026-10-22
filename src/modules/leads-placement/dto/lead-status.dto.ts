import { z } from 'zod';
import { LEAD_STATUSES } from '../../../models/lead.model';

export const leadStatusDtoSchema = z.object({
  status: z.enum(LEAD_STATUSES, {
    required_error: 'Lead status is required'
  }),
  adminNotes: z.string().max(500).optional()
});

export type LeadStatusDto = z.infer<typeof leadStatusDtoSchema>;
