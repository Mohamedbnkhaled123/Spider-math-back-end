import { z } from 'zod';
import { isValidGradeForCurriculum } from '../../../common/constants/curriculum-hierarchy.constant';
import { createAssessmentBaseSchema } from './assessment-create.dto';

export const updateAssessmentDtoSchema = createAssessmentBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.curriculum && data.grade_level) {
      if (!isValidGradeForCurriculum(data.curriculum, data.grade_level)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Grade level "${data.grade_level}" is invalid for curriculum "${data.curriculum}"`,
          path: ['grade_level']
        });
      }
    }
  });

export type UpdateAssessmentDto = z.infer<typeof updateAssessmentDtoSchema>;

