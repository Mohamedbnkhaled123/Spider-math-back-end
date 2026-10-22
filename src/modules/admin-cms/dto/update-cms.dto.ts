import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS
} from '../../../common/constants/curriculum-hierarchy.constant';

const qualificationSchema = z.object({
  title_ar: z.string().min(2),
  title_en: z.string().min(2),
  year: z.string().optional()
});

const scheduleItemSchema = z.object({
  curriculum: z.enum(CURRICULUMS),
  grade_level: z.enum(ALL_GRADE_LEVELS),
  academic_term: z.enum(ACADEMIC_TERMS),
  days_ar: z.string().min(2),
  days_en: z.string().min(2),
  time_slot: z.string().min(2),
  is_active: z.boolean().default(true)
});

const testimonialItemSchema = z.object({
  author_name: z.string().min(2),
  author_role: z.enum(['STUDENT', 'PARENT']),
  curriculum: z.enum(CURRICULUMS),
  grade_level: z.enum(ALL_GRADE_LEVELS),
  content: z.string().min(5).max(600),
  rating: z.number().int().min(1).max(5).default(5),
  is_approved: z.boolean().default(true)
});

const contactChannelsSchema = z.object({
  subscription_whatsapp: z.string().min(8),
  support_whatsapp: z.string().min(8),
  facebook_url: z.string().optional(),
  youtube_channel_url: z.string().optional(),
  telegram_url: z.string().optional()
});

export const updateCmsDtoSchema = z.object({
  teacher_profile: z
    .object({
      bio_ar: z.string().optional(),
      bio_en: z.string().optional(),
      qualifications: z.array(qualificationSchema).optional(),
      hero_video_youtube_id: z.string().nullable().optional()
    })
    .optional(),
  schedules_table: z.array(scheduleItemSchema).optional(),
  testimonials_items: z.array(testimonialItemSchema).optional(),
  contact_channels: contactChannelsSchema.optional()
});

export type UpdateCmsDto = z.infer<typeof updateCmsDtoSchema>;
