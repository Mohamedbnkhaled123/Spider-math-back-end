import { z } from 'zod';

export const adminLoginDtoSchema = z.object({
  accessCode: z
    .string({ required_error: 'يرجى إدخال كود الدخول السري' })
    .trim()
    .min(4, 'كود الدخول يجب أن لا يقل عن 4 أحرف')
    .max(128),
  mode: z.enum(['teacher', 'dev']).default('teacher'),
  deviceUuid: z.string().trim().max(200).optional(),
  deviceType: z.string().trim().max(120).optional(),
  browserInfo: z.string().trim().max(160).optional()
});

export type AdminLoginDto = z.infer<typeof adminLoginDtoSchema>;

export const setupAccessCodeDtoSchema = z.object({
  accessCode: z
    .string({ required_error: 'يرجى إدخال الكود المطلوب تسجيله' })
    .trim()
    .min(4, 'الكود يجب أن لا يقل عن 4 أحرف')
    .max(128),
  deviceUuid: z.string().trim().max(200).optional(),
  deviceType: z.string().trim().max(120).optional(),
  browserInfo: z.string().trim().max(160).optional()
});

export type SetupAccessCodeDto = z.infer<typeof setupAccessCodeDtoSchema>;

export const devDeviceLoginDtoSchema = z.object({
  deviceUuid: z.string({ required_error: 'Device UUID is required' }).trim().min(4).max(200),
  deviceTrustToken: z.string({ required_error: 'Device trust token is required' }).trim().min(32).max(256)
});

export type DevDeviceLoginDto = z.infer<typeof devDeviceLoginDtoSchema>;

export const teacherGoogleLoginDtoSchema = z.object({
  idToken: z
    .string({ required_error: 'Google OAuth token is required' })
    .min(10, 'Invalid Google OAuth token'),
  email: z.string().email().optional(),
  fullName: z.string().optional()
});

export type TeacherGoogleLoginDto = z.infer<typeof teacherGoogleLoginDtoSchema>;

export const updateAdminSecurityDtoSchema = z.object({
  teacherGoogleEmail: z.union([z.string().trim().email(), z.literal(''), z.null()]).optional(),
  newTeacherCode: z.string().trim().min(4, 'كود المعلمة يجب أن لا يقل عن 4 أحرف').max(128).optional(),
  newDevCode: z.string().trim().min(4, 'كود المطور يجب أن لا يقل عن 4 أحرف').max(128).optional(),
  currentDevCode: z.string().trim().optional(),
  revokeDevDevices: z.boolean().optional()
});

export type UpdateAdminSecurityDto = z.infer<typeof updateAdminSecurityDtoSchema>;
