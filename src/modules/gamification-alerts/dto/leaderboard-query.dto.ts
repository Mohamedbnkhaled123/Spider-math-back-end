import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum
} from '../../../common/constants/curriculum-hierarchy.constant';

export const leaderboardQueryDtoSchema = z
  .object({
    curriculum: z.enum(CURRICULUMS, {
      required_error: 'curriculum query parameter is required'
    }),
    gradeLevel: z.enum(ALL_GRADE_LEVELS, {
      required_error: 'gradeLevel query parameter is required'
    }),
    term: z.enum(ACADEMIC_TERMS).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .superRefine((data, ctx) => {
    if (!isValidGradeForCurriculum(data.curriculum, data.gradeLevel)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Grade level "${data.gradeLevel}" is invalid for curriculum "${data.curriculum}"`,
        path: ['gradeLevel']
      });
    }
  });

export type LeaderboardQueryDto = z.infer<typeof leaderboardQueryDtoSchema>;
