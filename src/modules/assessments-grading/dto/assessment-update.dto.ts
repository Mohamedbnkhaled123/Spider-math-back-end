import { z } from 'zod';
import { isValidGradeForCurriculum } from '../../../common/constants/curriculum-hierarchy.constant';
import { createAssessmentBaseSchema } from './assessment-create.dto';

export const updateAssessmentDtoSchema = createAssessmentBaseSchema
  .partial()
  .superRefine((data, ctx) => {
    const curr = data.curriculum;
    const grade = data.grade_level || data.gradeLevel;
    if (curr && grade) {
      if (!isValidGradeForCurriculum(curr, grade)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Grade level "${grade}" is invalid for curriculum "${curr}"`,
          path: ['grade_level']
        });
      }
    }
  })
  .transform((data) => {
    const calc = data.graph_calculator || data.calculator_mode || data.calculatorType;
    const timeLimit = data.time_limit_minutes || data.duration_minutes || data.durationMinutes;
    const titleAr = data.title_ar || data.titleAr;
    const titleEn = data.title_en || data.titleEn;
    const curr = data.curriculum;
    const grade = data.grade_level || data.gradeLevel;
    const term = data.academic_term || data.term;
    const isPlacement = data.is_placement_test ?? data.isPlacementTest;
    const passPercentage = data.pass_percentage ?? data.passPercentage;
    const maxAttempts = data.max_attempts ?? data.maxAttempts;
    const availableFrom = data.available_from !== undefined ? data.available_from : data.availableFrom;
    const availableUntil = data.available_until !== undefined ? data.available_until : data.availableUntil;
    const isPublished = data.is_published ?? data.isPublished;
    const assessmentType = data.assessment_type || data.assessmentType;

    return {
      ...data,
      ...(calc ? { graph_calculator: (calc === 'DESMOS' ? 'DESMOS' : 'NONE') as any } : {}),
      ...(timeLimit ? { time_limit_minutes: timeLimit } : {}),
      ...(titleAr ? { title_ar: titleAr.trim() } : {}),
      ...(titleEn ? { title_en: titleEn.trim() } : {}),
      ...(curr ? { curriculum: curr as any } : {}),
      ...(grade ? { grade_level: grade as any } : {}),
      ...(term ? { academic_term: term as any } : {}),
      ...(passPercentage !== undefined ? { pass_percentage: passPercentage } : {}),
      ...(maxAttempts !== undefined ? { max_attempts: maxAttempts } : {}),
      ...(availableFrom !== undefined ? { available_from: availableFrom } : {}),
      ...(availableUntil !== undefined ? { available_until: availableUntil } : {}),
      ...(isPublished !== undefined ? { is_published: isPublished } : {}),
      ...(assessmentType ? { assessment_type: assessmentType as any } : {}),
      ...(isPlacement !== undefined ? { is_placement_test: isPlacement } : {}),
      ...(data.questions ? {
        questions: data.questions,
        total_points: data.questions.reduce((sum, q) => sum + (q.points || 1), 0),
        has_essay_questions: data.questions.some((q) => q.question_type === 'ESSAY_PHOTO')
      } : {})
    };
  });

export type UpdateAssessmentDto = z.infer<typeof updateAssessmentDtoSchema>;


