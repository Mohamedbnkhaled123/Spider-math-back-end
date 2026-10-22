import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS
} from '../../../common/constants/curriculum-hierarchy.constant';
import { PACKAGE_TYPES } from '../../../models/unit-package.model';

export const unitsQueryDtoSchema = z.object({
  curriculum: z.enum(CURRICULUMS).optional(),
  gradeLevel: z.enum(ALL_GRADE_LEVELS).optional(),
  term: z.enum(ACADEMIC_TERMS).optional(),
  type: z.enum(PACKAGE_TYPES).optional()
});

export type UnitsQueryDto = z.infer<typeof unitsQueryDtoSchema>;
