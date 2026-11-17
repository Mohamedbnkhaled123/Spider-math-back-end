import { z } from 'zod';
import {
  CURRICULUMS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum,
  CurriculumType
} from '../../../common/constants/curriculum-hierarchy.constant';

export const submitPlacementDtoSchema = z
  .object({
    curriculum: z.enum(CURRICULUMS, {
      required_error: 'curriculum is required'
    }),
    gradeLevel: z.string({ required_error: 'gradeLevel is required' }).min(1, 'gradeLevel is required'),
    academicTerm: z.enum(ACADEMIC_TERMS).default('TERM_1'),
    answers: z
      .array(
        z.object({
          questionId: z.string({ required_error: 'questionId is required' }),
          selectedOption: z.number().int().min(-1).optional().nullable(),
          textAnswer: z.string().trim().max(500).optional().nullable(),
          uploadedImageUrls: z.array(z.string().trim()).max(5).optional().default([])
        })
      )
      .default([])
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
