import { z } from 'zod';

export const promoteStudentsDtoSchema = z.object({
  mode: z.enum(['TERM', 'GRADE'], {
    errorMap: () => ({ message: 'Promotion mode must be either TERM or GRADE' })
  }),
  studentIds: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one student must be selected for promotion'),
  excludedStudentIds: z.array(z.string().trim().min(1)).optional().default([]),
  graduationDecisions: z
    .record(z.string(), z.enum(['ARCHIVE', 'DELETE', 'SKIP']))
    .optional()
    .default({}),
  defaultGraduationAction: z.enum(['ARCHIVE', 'DELETE', 'SKIP']).optional()
});

export type PromoteStudentsDto = z.infer<typeof promoteStudentsDtoSchema>;

export const archiveStudentDtoSchema = z.object({
  archived: z.boolean()
});

export type ArchiveStudentDto = z.infer<typeof archiveStudentDtoSchema>;
