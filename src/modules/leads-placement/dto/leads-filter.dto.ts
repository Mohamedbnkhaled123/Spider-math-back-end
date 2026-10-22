import { z } from 'zod';
import { CURRICULUMS, ALL_GRADE_LEVELS } from '../../../common/constants/curriculum-hierarchy.constant';
import { LEAD_STATUSES } from '../../../models/lead.model';

export const leadsFilterDtoSchema = z.object({
  curriculum: z.enum(CURRICULUMS).optional(),
  gradeLevel: z.enum(ALL_GRADE_LEVELS).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export type LeadsFilterDto = z.infer<typeof leadsFilterDtoSchema>;
