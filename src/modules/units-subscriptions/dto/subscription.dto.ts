import { z } from 'zod';
import { SUBSCRIPTION_STATUSES } from '../../../models/subscription.model';

export const activateSubscriptionDtoSchema = z.object({
  studentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid studentId ObjectId').optional(),
  student_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid student_id ObjectId').optional(),
  studentCode: z.string().regex(/^HA\d+$/, 'Invalid studentCode format (e.g. HA1001)').optional(),
  student_code: z.string().regex(/^HA\d+$/, 'Invalid student_code format (e.g. HA1001)').optional(),
  unitPackageId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unitPackageId ObjectId').optional(),
  unit_package_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unit_package_id ObjectId').optional(),
  unitId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unitId ObjectId').optional(),
  unit_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unit_id ObjectId').optional(),
  pricePaidEgp: z.number().min(0).optional(),
  price_paid_egp: z.number().min(0).optional(),
  validityDays: z.number().int().min(1).max(365).optional()
}).superRefine((data, ctx) => {
  const resolvedStudent = data.studentId || data.student_id || data.studentCode || data.student_code;
  if (!resolvedStudent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['studentId'],
      message: 'Either studentId or studentCode must be provided to activate a subscription'
    });
  }
  const resolvedUnit = data.unitPackageId || data.unit_package_id || data.unitId || data.unit_id;
  if (!resolvedUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['unitPackageId'],
      message: 'unitPackageId must be provided to activate a subscription'
    });
  }
});

export type ActivateSubscriptionDto = z.infer<typeof activateSubscriptionDtoSchema>;

export const updateSubscriptionStatusDtoSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES, {
    required_error: 'Subscription status is required'
  }),
  freezeReason: z.string().max(200).optional()
});

export type UpdateSubscriptionStatusDto = z.infer<typeof updateSubscriptionStatusDtoSchema>;

export const whatsappSubRequestDtoSchema = z.object({
  unitPackageId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unitPackageId ObjectId')
});

export type WhatsappSubRequestDto = z.infer<typeof whatsappSubRequestDtoSchema>;
