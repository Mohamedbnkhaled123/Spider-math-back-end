import { z } from 'zod';

export const deviceDecisionDtoSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT'], {
    required_error: 'Decision action must be either APPROVE or REJECT'
  }),
  deviceUuid: z.string().min(16).optional()
});

export type DeviceDecisionDto = z.infer<typeof deviceDecisionDtoSchema>;
