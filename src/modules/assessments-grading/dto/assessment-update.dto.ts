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
    const isFree = data.is_free ?? data.isFree;
    const passPercentage = data.pass_percentage ?? data.passPercentage;
    const maxAttempts = data.max_attempts ?? data.maxAttempts;
    const availableFrom = data.available_from !== undefined ? data.available_from : data.availableFrom;
    const availableUntil = data.available_until !== undefined ? data.available_until : data.availableUntil;
    const isPublished = data.is_published ?? data.isPublished;
    const assessmentType = data.assessment_type || data.assessmentType;
    const refSheet = data.reference_sheet_url !== undefined ? data.reference_sheet_url : data.referenceSheetUrl;
    const rawRequiresReview = (data as any).requires_teacher_review !== undefined
      ? (data as any).requires_teacher_review
      : ((data as any).requiresTeacherReview !== undefined
      ? (data as any).requiresTeacherReview
      : ((data as any).requires_review !== undefined ? (data as any).requires_review : (data as any).requiresReview));

    const questionsUpdated = Array.isArray(data.questions);
    const hasEssayInQuestions = questionsUpdated ? data.questions!.some((q) => q.question_type === 'ESSAY_PHOTO') : false;

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
      ...(isFree !== undefined ? { is_free: isFree } : {}),
      ...(refSheet !== undefined ? { reference_sheet_url: refSheet } : {}),
      ...(rawRequiresReview !== undefined || hasEssayInQuestions ? {
        requires_teacher_review: hasEssayInQuestions ? true : !!rawRequiresReview
      } : {}),
      ...(data.questions ? {
        questions: data.questions,
        total_points: data.questions.reduce((sum, q) => sum + (q.points || 1), 0),
        has_essay_questions: hasEssayInQuestions
      } : {})
    };
  });

export type UpdateAssessmentDto = z.infer<typeof updateAssessmentDtoSchema>;


