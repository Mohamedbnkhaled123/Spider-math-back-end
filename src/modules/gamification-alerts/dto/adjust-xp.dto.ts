import { z } from 'zod';

export const adjustXpDtoSchema = z.object({
  student_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid student_id ObjectId'),
  xp_delta: z.coerce.number().int().default(0),
  action_type: z.enum(['TEACHER_BONUS', 'TEACHER_PENALTY']).default('TEACHER_BONUS'),
  reason_note: z.string().trim().min(1, 'Reason note is required').max(200, 'Reason note cannot exceed 200 characters'),
  is_leaderboard_hidden: z.boolean().optional()
});

export type AdjustXpDto = z.infer<typeof adjustXpDtoSchema>;
