import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum,
  CurriculumType
} from '../../../common/constants/curriculum-hierarchy.constant';

export const submitPlacementDtoSchema = z
  .object({
    curriculum: z.enum(CURRICULUMS, {
      required_error: 'curriculum is required'
    }),
    gradeLevel: z.enum(ALL_GRADE_LEVELS, {
      required_error: 'gradeLevel is required'
    }),
    academicTerm: z.enum(ACADEMIC_TERMS).default('TERM_1'),
    answers: z
      .array(
        z.object({
          questionId: z.string({ required_error: 'questionId is required' }),
          selectedOption: z.number({ required_error: 'selectedOption index is required' }).int().min(0)
        })
      )
      .min(1, 'At least one answer must be provided')
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

export type SubmitPlacementDto = z.infer<typeof submitPlacementDtoSchema>;
