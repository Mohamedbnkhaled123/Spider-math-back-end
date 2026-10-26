import { z } from 'zod';

export const mcqAnswerItemDtoSchema = z.object({
  question_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid question_id ObjectId'),
  selected_option_index: z.coerce.number().int().min(0)
});

export const uploadedSolutionImgDtoSchema = z.object({
  question_id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid question_id ObjectId').optional(),
  image_url: z.string().trim().url('Must be a valid Cloudinary HTTPS image URL'),
  size_kb: z.coerce.number().positive().max(150, 'Homework image must not exceed 150KB WebP').optional(),
  rotation_deg: z.coerce.number().optional().default(0)
});

export const submissionSyncDtoSchema = z.object({
  idempotency_key: z
    .string()
    .uuid('idempotency_key must be a valid UUIDv4 string')
    .or(z.string().min(10, 'idempotency_key is required')),

  mcq_answers: z.array(mcqAnswerItemDtoSchema).optional().default([]),

  // Allow homework and question-level photo answers (WebP <= 150KB per photo)
  uploaded_solution_imgs: z
    .array(uploadedSolutionImgDtoSchema)
    .max(50, 'Maximum 50 photos allowed per submission')
    .optional()
    .default([]),

  client_started_at: z.string().datetime(),
  client_submitted_at: z.string().datetime().default(() => new Date().toISOString()),
  elapsed_time_sec: z.coerce.number().min(0, 'elapsed_time_sec cannot be negative'),

  is_offline_cached: z.boolean().default(false),
  offline_disconnect_count: z.coerce.number().int().min(0).default(0)
});

export type SubmissionSyncDto = z.infer<typeof submissionSyncDtoSchema>;

