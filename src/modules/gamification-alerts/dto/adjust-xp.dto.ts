import { z } from 'zod';

export const adjustXpDtoSchema = z.object({
  student_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid student_id ObjectId'),
  xp_delta: z.coerce.number().int().default(0),
  action_type: z.enum(['TEACHER_BONUS', 'TEACHER_PENALTY']).default('TEACHER_BONUS').optional(),
  reason_note: z.string().trim().max(200).optional(),
  reason: z.string().trim().max(200).optional(),
  is_leaderboard_hidden: z.boolean().optional()
}).transform((data) => ({
  student_id: data.student_id,
  xp_delta: data.xp_delta,
  action_type: data.action_type || (data.xp_delta >= 0 ? 'TEACHER_BONUS' : 'TEACHER_PENALTY'),
  reason_note: (data.reason_note || data.reason || (data.xp_delta >= 0 ? 'مكافأة المعلمة' : 'خصم المعلمة')).trim(),
  is_leaderboard_hidden: data.is_leaderboard_hidden
}));

export type AdjustXpDto = z.infer<typeof adjustXpDtoSchema>;
