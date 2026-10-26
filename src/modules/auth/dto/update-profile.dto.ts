import { z } from 'zod';

export const updateProfileDtoSchema = z.object({
  fullName: z.string().min(3, 'يجب أن يتكون الاسم من 3 أحرف على الأقل').optional(),
  phone: z.string().min(8, 'رقم الهاتف قصير جداً').optional(),
  parentPhone: z.string().min(8, 'رقم هاتف ولي الأمر قصير جداً').optional(),
  avatarUrl: z.string().optional().nullable(),
  governorate: z.string().optional().nullable()
});

export type UpdateProfileDto = z.infer<typeof updateProfileDtoSchema>;
