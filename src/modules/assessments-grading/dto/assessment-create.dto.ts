import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS
} from '../../../common/constants/curriculum-hierarchy.constant';
import {
  ASSESSMENT_TYPES,
  QUESTION_TYPES,
  GRAPH_CALCULATORS
} from '../../../models/assessment.model';

export const questionItemDtoSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    order: z.coerce.number().optional(),
    question_type: z.enum(QUESTION_TYPES).or(z.string()).optional(),
    type: z.string().optional(),
    question_text: z.string().trim().optional(),
    textAr: z.string().trim().optional(),
    text: z.string().trim().optional(),
    question_image_url: z.string().trim().nullable().optional(),
    questionImageUrl: z.string().trim().nullable().optional(),
    question_image_size_kb: z.number().nullable().optional(),
    options: z.array(z.string().trim()).optional().default([]),
    correct_option_index: z.coerce.number().int().min(0).optional(),
    correctOptionIndex: z.coerce.number().int().min(0).optional(),
    points: z.coerce.number().positive().default(1),
    model_answer_text: z.string().trim().optional(),
    explanationAr: z.string().trim().optional(),
    youtube_solution_url: z.string().trim().nullable().optional(),
    youtubeSolutionUrl: z.string().trim().nullable().optional()
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const qType = (data.question_type || data.type || 'MCQ').toUpperCase();
    const qText = (data.question_text || data.textAr || data.text || '').trim();
    const qImg = data.question_image_url || data.questionImageUrl;

    if (!qText && !qImg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'يجب كتابة نص السؤال أو رفع صورة السؤال للمسألة الرياضية',
        path: ['question_text']
      });
    }

    if (qType === 'MCQ') {
      const options = (data.options || []).map((o) => (o || '').trim());
      if (options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'يجب أن يحتوي سؤال الاختيار من متعدد على خيارين على الأقل',
          path: ['options']
        });
      }

      // Check for empty options
      if (options.some((opt) => !opt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'لا يمكن ترك أحد خيارات الإجابة فارغاً، يرجى كتابة نص الإجابة لكل خيار',
          path: ['options']
        });
      }

      // Check for duplicate options (CRITICAL REQUIREMENT)
      const uniqueOptions = new Set(options);
      if (uniqueOptions.size < options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'تنبيه: لا يمكن تكرار نفس الإجابة في أكثر من خيار! يجب أن تكون جميع الاختيارات مختلفة تماماً',
          path: ['options']
        });
      }

      const correctIdx = data.correct_option_index ?? data.correctOptionIndex;
      if (correctIdx === undefined || correctIdx === null || correctIdx < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'يجب تحديد الإجابة الصحيحة للسؤال',
          path: ['correct_option_index']
        });
      } else if (options.length > 0 && correctIdx >= options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'خيار الإجابة الصحيحة المحدد خارج نطاق الخيارات المتاحة',
          path: ['correct_option_index']
        });
      }
    }
  })
  .transform((data) => {
    const rawType = (data.question_type || data.type || 'MCQ').toUpperCase();
    const qType = rawType === 'ESSAY' || rawType === 'ESSAY_PHOTO' ? 'ESSAY_PHOTO' : 'MCQ';
    const qText = (data.question_text || data.textAr || data.text || '').trim();
    const qImg = data.question_image_url || data.questionImageUrl || null;
    const correctIdx = data.correct_option_index ?? data.correctOptionIndex ?? 0;
    const modelAns = (data.model_answer_text || data.explanationAr || '').trim();

    return {
      _id: data._id || data.id,
      order: data.order,
      question_type: qType,
      question_text: qText,
      question_image_url: qImg,
      question_image_size_kb: data.question_image_size_kb || null,
      options: (data.options || []).map((o) => (o || '').trim()),
      correct_option_index: correctIdx,
      points: data.points || 1,
      model_answer_text: modelAns,
      youtube_solution_url: data.youtube_solution_url || data.youtubeSolutionUrl || null
    };
  });

export const createAssessmentBaseSchema = z.object({
  unit_package_id: z.string().optional().nullable(),
  unitPackageId: z.string().optional().nullable(),
  lecture_id: z.string().optional().nullable(),
  lectureId: z.string().optional().nullable(),
  is_placement_test: z.boolean().default(false),
  isPlacementTest: z.boolean().optional(),

  curriculum: z.enum(CURRICULUMS),
  grade_level: z.enum(ALL_GRADE_LEVELS).or(z.string()),
  gradeLevel: z.string().optional(),
  academic_term: z.enum(ACADEMIC_TERMS).or(z.string()).default('TERM_1'),
  term: z.string().optional(),

  title_ar: z.string().trim().min(1, 'Arabic title is required'),
  titleAr: z.string().optional(),
  title_en: z.string().trim().optional(),
  titleEn: z.string().optional(),
  assessment_type: z.enum(ASSESSMENT_TYPES).default('QUIZ'),
  assessmentType: z.string().optional(),
  time_limit_minutes: z.coerce.number().int().positive().default(30),
  duration_minutes: z.coerce.number().int().positive().optional(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  pass_percentage: z.coerce.number().min(0).max(100).default(60),
  passPercentage: z.coerce.number().min(0).max(100).optional(),
  min_expected_solve_sec: z.coerce.number().int().min(5).default(30),
  max_attempts: z.coerce.number().int().positive().default(1),
  maxAttempts: z.coerce.number().int().positive().optional(),

  available_from: z.string().nullable().optional(),
  availableFrom: z.string().nullable().optional(),
  available_until: z.string().nullable().optional(),
  availableUntil: z.string().nullable().optional(),

  // Strictly limited to NONE or DESMOS (GeoGebra completely excluded)
  graph_calculator: z.enum(GRAPH_CALCULATORS).or(z.string()).default('NONE'),
  calculator_mode: z.string().optional(),
  calculatorType: z.string().optional(),
  xp_reward: z.coerce.number().int().min(0).default(50),
  is_published: z.boolean().default(true),
  isPublished: z.boolean().optional(),

  questions: z.array(questionItemDtoSchema).default([])
}).passthrough();

export const createAssessmentDtoSchema = createAssessmentBaseSchema.transform((data) => {
  const curriculum = data.curriculum as any;
  const gradeLevel = (data.grade_level || data.gradeLevel) as any;
  const academicTerm = (data.academic_term || data.term || 'TERM_1') as any;
  const titleAr = (data.title_ar || data.titleAr || '').trim();
  const titleEn = (data.title_en || data.titleEn || titleAr).trim();
  const assessmentType = (data.assessment_type || data.assessmentType || 'QUIZ') as any;
  const timeLimit = data.time_limit_minutes || data.duration_minutes || data.durationMinutes || 30;
  const passPercentage = data.pass_percentage ?? data.passPercentage ?? 60;
  const maxAttempts = data.max_attempts ?? data.maxAttempts ?? 1;
  const availableFrom = data.available_from ?? data.availableFrom ?? null;
  const availableUntil = data.available_until ?? data.availableUntil ?? null;
  const calc = (data.graph_calculator === 'DESMOS' || data.calculator_mode === 'DESMOS' || data.calculatorType === 'DESMOS') ? 'DESMOS' : 'NONE';
  const isPlacement = data.is_placement_test ?? data.isPlacementTest ?? false;
  const isPublished = data.is_published ?? data.isPublished ?? true;
  const unitId = data.unit_package_id || data.unitPackageId || null;

  const questions = data.questions || [];
  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);
  const hasEssayQuestions = questions.some((q) => q.question_type === 'ESSAY_PHOTO');

  return {
    ...data,
    curriculum,
    grade_level: gradeLevel,
    academic_term: academicTerm,
    title_ar: titleAr,
    title_en: titleEn,
    assessment_type: assessmentType,
    time_limit_minutes: timeLimit,
    pass_percentage: passPercentage,
    max_attempts: maxAttempts,
    available_from: availableFrom,
    available_until: availableUntil,
    graph_calculator: calc,
    has_essay_questions: hasEssayQuestions,
    total_points: totalPoints,
    is_placement_test: isPlacement,
    is_published: isPublished,
    unit_package_id: unitId && /^[0-9a-fA-F]{24}$/.test(unitId) ? unitId : null,
    questions
  };
});

export type CreateAssessmentDto = z.infer<typeof createAssessmentDtoSchema>;

