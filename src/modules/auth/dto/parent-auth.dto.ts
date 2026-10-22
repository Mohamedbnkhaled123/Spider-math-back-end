import { z } from 'zod';

export const parentActivateLoginDtoSchema = z.object({
  parentPhone: z
    .string({ required_error: 'Parent phone number is required' })
    .min(8, 'Phone number must be at least 8 digits')
    .max(20),

  studentCode: z
    .string({ required_error: 'Student HA code is required' })
    .regex(/^HA\d+$/, 'studentCode must start with HA followed by digits only (e.g. HA1001)'),

  fullName: z.string().min(2).max(100).optional(),

  deviceUuid: z
    .string({ required_error: 'deviceUuid is required' })
    .min(16, 'deviceUuid must be at least 16 characters')
});

export type ParentActivateLoginDto = z.infer<typeof parentActivateLoginDtoSchema>;

export const parentLinkChildDtoSchema = z.object({
  studentCode: z
    .string({ required_error: 'Student HA code is required' })
    .regex(/^HA\d+$/, 'studentCode must start with HA followed by digits only (e.g. HA1001)')
});

export type ParentLinkChildDto = z.infer<typeof parentLinkChildDtoSchema>;
