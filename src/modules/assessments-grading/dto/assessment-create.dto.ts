import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum
} from '../../../common/constants/curriculum-hierarchy.constant';
import {
  ASSESSMENT_TYPES,
  QUESTION_TYPES,
  GRAPH_CALCULATORS
} from '../../../models/assessment.model';

export const questionItemDtoSchema = z
  .object({
    question_type: z.enum(QUESTION_TYPES),
    question_text: z.string().trim().min(1, 'Question text cannot be empty'),
    question_image_url: z.string().trim().url().nullable().optional(),
    question_image_size_kb: z.number().positive().max(150, 'Question image must not exceed 150KB WebP').nullable().optional(),
    options: z.array(z.string().trim()).optional().default([]),
    correct_option_index: z.number().int().min(0).optional(),
    points: z.number().positive().default(1),
    model_answer_text: z.string().trim().optional(),
    youtube_solution_url: z.string().trim().nullable().optional()
  })
  .superRefine((data, ctx) => {
    if (data.question_type === 'MCQ') {
      if (!data.options || data.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MCQ questions must have at least 2 options',
          path: ['options']
        });
      }
      if (data.correct_option_index === undefined || data.correct_option_index === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MCQ questions must specify a valid correct_option_index',
          path: ['correct_option_index']
        });
      } else if (data.options && data.correct_option_index >= data.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'correct_option_index is out of range for provided options',
          path: ['correct_option_index']
        });
      }
    }
  });

export const createAssessmentBaseSchema = z.object({
  unit_package_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unit_package_id ObjectId').optional().nullable(),
  lecture_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid lecture_id ObjectId').optional().nullable(),
  is_placement_test: z.boolean().default(false),

  curriculum: z.enum(CURRICULUMS),
  grade_level: z.enum(ALL_GRADE_LEVELS),
  academic_term: z.enum(ACADEMIC_TERMS),

  title_ar: z.string().trim().min(2, 'Arabic title must be at least 2 characters'),
  title_en: z.string().trim().min(2, 'English title must be at least 2 characters'),
  assessment_type: z.enum(ASSESSMENT_TYPES),
  time_limit_minutes: z.coerce.number().int().positive().default(30),
  min_expected_solve_sec: z.coerce.number().int().min(5).default(30),
  max_attempts: z.coerce.number().int().positive().default(3),

  available_from: z.string().datetime().nullable().optional(),
  available_until: z.string().datetime().nullable().optional(),

  // Strictly limited to NONE or DESMOS (GeoGebra completely excluded)
  graph_calculator: z.enum(GRAPH_CALCULATORS).default('NONE'),
  xp_reward: z.coerce.number().int().min(0).default(50),
  is_published: z.boolean().default(false),

  questions: z.array(questionItemDtoSchema).min(1, 'Assessment must contain at least 1 question')
});

export const createAssessmentDtoSchema = createAssessmentBaseSchema.superRefine((data, ctx) => {
  if (!isValidGradeForCurriculum(data.curriculum, data.grade_level)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Grade level "${data.grade_level}" is invalid for curriculum "${data.curriculum}"`,
      path: ['grade_level']
    });
  }

  if (!data.is_placement_test && !data.unit_package_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'unit_package_id is required for curriculum quizzes and exams',
      path: ['unit_package_id']
    });
  }
});

export type CreateAssessmentDto = z.infer<typeof createAssessmentDtoSchema>;

