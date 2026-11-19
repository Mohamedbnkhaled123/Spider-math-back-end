import { z } from 'zod';

export const bulkDeleteSubmissionsDtoSchema = z.object({
  submissionIds: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one submission must be selected'),
  mode: z.enum(['HIDE_FROM_TEACHER', 'PERMANENT_DELETE'], {
    errorMap: () => ({ message: 'Mode must be either HIDE_FROM_TEACHER or PERMANENT_DELETE' })
  })
});

export type BulkDeleteSubmissionsDto = z.infer<typeof bulkDeleteSubmissionsDtoSchema>;

export const restoreSubmissionsDtoSchema = z.object({
  submissionIds: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one submission must be selected')
});

export type RestoreSubmissionsDto = z.infer<typeof restoreSubmissionsDtoSchema>;
