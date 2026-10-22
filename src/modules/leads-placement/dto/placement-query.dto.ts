import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum,
  CurriculumType
} from '../../../common/constants/curriculum-hierarchy.constant';

export const placementQueryDtoSchema = z
  .object({
    curriculum: z.enum(CURRICULUMS, {
      required_error: 'curriculum query parameter is required'
    }),
    gradeLevel: z.enum(ALL_GRADE_LEVELS, {
      required_error: 'gradeLevel query parameter is required'
    }),
    term: z.enum(ACADEMIC_TERMS).default('TERM_1')
  })
  .superRefine((data, ctx) => {
    if (!isValidGradeForCurriculum(data.curriculum as CurriculumType, data.gradeLevel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gradeLevel'],
        message: `gradeLevel '${data.gradeLevel}' does not belong to curriculum '${data.curriculum}'`
      });
    }
  });

export type PlacementQueryDto = z.infer<typeof placementQueryDtoSchema>;
