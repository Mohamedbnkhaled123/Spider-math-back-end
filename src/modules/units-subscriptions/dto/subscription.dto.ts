import { z } from 'zod';
import { SUBSCRIPTION_STATUSES } from '../../../models/subscription.model';

export const activateSubscriptionDtoSchema = z.object({
  studentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid studentId ObjectId').optional(),
  studentCode: z.string().regex(/^HA\d+$/, 'Invalid studentCode format (e.g. HA1001)').optional(),
  unitPackageId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid unitPackageId ObjectId'),
  pricePaidEgp: z.number().min(0).optional(),
  validityDays: z.number().int().min(1).max(365).optional()
}).superRefine((data, ctx) => {
  if (!data.studentId && !data.studentCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['studentId'],
      message: 'Either studentId or studentCode must be provided to activate a subscription'
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
