import { z } from 'zod';

export const aiExtractQuestionsDtoSchema = z.object({
  imageBase64: z
    .string({
      required_error: 'imageBase64 is required for AI question extraction'
    })
    .min(10, 'imageBase64 must not be empty'),

  mimeType: z
    .enum(['image/webp', 'image/jpeg', 'image/png'])
    .default('image/webp'),

  mode: z
    .enum(['TEXT_LATEX_ONLY', 'FULL_IMAGE_CROP', 'SMART_HYBRID'])
    .default('SMART_HYBRID'),

  providerId: z.string().optional(),
  curriculum: z.string().optional(),
  gradeLevel: z.string().optional()
});

export type AiExtractQuestionsDto = z.infer<typeof aiExtractQuestionsDtoSchema>;
