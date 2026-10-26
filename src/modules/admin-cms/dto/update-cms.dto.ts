import { z } from 'zod';


const qualificationSchema = z.object({
  title_ar: z.string().min(2),
  title_en: z.string().min(2),
  year: z.string().optional()
});

const scheduleItemSchema = z.object({
  curriculum: z.string().optional(),
  grade_level: z.string().optional(),
  gradeLevel: z.string().optional(),
  academic_term: z.string().optional(),
  term: z.string().optional(),
  days_ar: z.string().optional(),
  days_en: z.string().optional(),
  dayOfWeek: z.string().optional(),
  time_slot: z.string().optional(),
  timeSlot: z.string().optional(),
  lecture_subject: z.string().optional(),
  lectureSubject: z.string().optional(),
  is_active: z.boolean().optional().default(true)
}).passthrough();

const testimonialItemSchema = z.object({
  author_name: z.string().optional(),
  authorName: z.string().optional(),
  author_role: z.string().optional(),
  authorRole: z.string().optional(),
  curriculum: z.string().optional(),
  grade_level: z.string().optional(),
  gradeLevel: z.string().optional(),
  content: z.string().optional(),
  rating: z.number().optional().default(5),
  is_approved: z.boolean().optional().default(true)
}).passthrough();

const contactChannelsSchema = z.object({
  subscription_whatsapp: z.string().optional(),
  support_whatsapp: z.string().optional(),
  facebook_url: z.string().optional(),
  youtube_channel_url: z.string().optional(),
  telegram_url: z.string().optional()
}).passthrough();

export const updateCmsDtoSchema = z.object({
  hero_headline_ar: z.string().optional(),
  heroHeadlineAr: z.string().optional(),
  hero_headline_en: z.string().optional(),
  heroHeadlineEn: z.string().optional(),
  hero_subheadline_ar: z.string().optional(),
  heroSubheadlineAr: z.string().optional(),
  hero_subheadline_en: z.string().optional(),
  heroSubheadlineEn: z.string().optional(),
  announcement_banner_text: z.string().optional(),
  announcementBannerText: z.string().optional(),
  is_announcement_active: z.boolean().optional(),
  isAnnouncementActive: z.boolean().optional(),
  active_academic_year: z.string().optional(),
  activeAcademicYear: z.string().optional(),
  support_whatsapp: z.string().optional(),
  supportWhatsapp: z.string().optional(),
  teacher_profile: z
    .object({
      bio_ar: z.string().optional(),
      bio_en: z.string().optional(),
      qualifications: z.array(qualificationSchema).optional(),
      hero_video_youtube_id: z.string().nullable().optional()
    })
    .optional(),
  schedules_table: z.array(scheduleItemSchema).optional(),
  schedulesTable: z.array(scheduleItemSchema).optional(),
  active_grades: z.array(z.string()).optional(),
  activeGrades: z.array(z.string()).optional(),
  curricula_tracks: z.array(z.any()).optional(),
  curriculaTracks: z.array(z.any()).optional(),
  testimonials_items: z.array(testimonialItemSchema).optional(),
  contact_channels: contactChannelsSchema.optional()
}).passthrough();

export type UpdateCmsDto = z.infer<typeof updateCmsDtoSchema>;
