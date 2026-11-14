import { z } from 'zod';

export const customMistakeCaseDtoSchema = z.object({
  question_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid question_id ObjectId').optional(),
  error_note: z.string().trim().min(1, 'Error note is required').max(1000, 'Error note must not exceed 1000 characters'),
  youtube_solution_url: z.string().trim().url('Must be a valid YouTube URL').nullable().optional()
});

export const essayAnswerDtoSchema = z.object({
  question_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid question_id ObjectId'),
  points_earned: z.coerce.number().min(0, 'Score cannot be negative').default(0),
  decision: z.enum(['FULL', 'HALF', 'ZERO']).optional(),
  teacher_note: z.string().trim().max(1000).optional().default('')
});

export const gradeSubmissionDtoSchema = z.object({
  essay_manual_score: z.coerce.number().min(0, 'Score cannot be negative').default(0),
  teacher_feedback_notes: z.string().trim().max(2000, 'Teacher feedback must not exceed 2000 characters').optional().default(''),
  custom_mistake_cases: z.array(customMistakeCaseDtoSchema).default([]),
  essay_answers: z.array(essayAnswerDtoSchema).optional().default([]),
  publish: z.boolean().optional()
});

export type CustomMistakeCaseDto = z.infer<typeof customMistakeCaseDtoSchema>;
export type EssayAnswerDto = z.infer<typeof essayAnswerDtoSchema>;
export type GradeSubmissionDto = z.infer<typeof gradeSubmissionDtoSchema>;
