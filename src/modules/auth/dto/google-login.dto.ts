import { z } from 'zod';
// السماح بالتوكن التجريبي أثناء التطوير المحلي

export const googleLoginDtoSchema = z.object({
  idToken: z.string({
    required_error: 'Google OAuth idToken is required'
  }).min(10, 'Google idToken is malformed or too short'),

  deviceUuid: z.string({
    required_error: 'deviceUuid is required'
  }).min(16, 'deviceUuid must be at least 16 characters for cryptographic fingerprinting'),

  deviceType: z.string({
    required_error: 'deviceType is required'
  }).min(2, 'deviceType cannot be empty').max(100),

  browserInfo: z.string({
    required_error: 'browserInfo is required'
  }).min(2, 'browserInfo cannot be empty').max(150),

  placementAttemptId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid placementAttemptId ObjectId').optional(),
  phone: z.string().trim().optional()
});

export type GoogleLoginDto = z.infer<typeof googleLoginDtoSchema>;
