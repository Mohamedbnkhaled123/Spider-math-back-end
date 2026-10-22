import { z } from 'zod';

export const unlockPlacementDtoSchema = z.object({
  fullName: z
    .string({ required_error: 'Full name is required to unlock placement results' })
    .min(3, 'Full name must be at least 3 characters')
    .max(100),
  phone: z
    .string({ required_error: 'Phone number is required to unlock placement results' })
    .min(8, 'Phone number must be at least 8 digits')
    .max(20),
  email: z.string().email('Invalid email address').optional(),
  googleId: z.string().optional()
});

export type UnlockPlacementDto = z.infer<typeof unlockPlacementDtoSchema>;
