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

const contactChannelsSchema = z.object({
  subscription_whatsapp: z.string().optional(),
  support_whatsapp: z.string().optional(),
  facebook_url: z.string().optional(),
  youtube_channel_url: z.string().optional(),
  telegram_url: z.string().optional()
}).passthrough();

const honorBoardItemSchema = z.object({
  id: z.string().optional(),
  rank: z.union([z.number(), z.string()]).optional(),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  systemAr: z.string().optional(),
  systemEn: z.string().optional(),
  achievementAr: z.string().optional(),
  achievementEn: z.string().optional(),
  locationAr: z.string().optional(),
  locationEn: z.string().optional(),
  xp: z.union([z.number(), z.string()]).optional(),
  accuracy: z.union([z.number(), z.string()]).optional(),
  badgeAr: z.string().optional(),
  badgeEn: z.string().optional(),
  avatarUrl: z.string().optional(),
  is_active: z.boolean().optional()
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
  hero_video_url: z.string().optional(),
  heroVideoUrl: z.string().optional(),
  announcement_banner_text: z.string().optional(),
  announcementBannerText: z.string().optional(),
  is_announcement_active: z.boolean().optional(),
  isAnnouncementActive: z.boolean().optional(),
  active_academic_year: z.string().optional(),
  activeAcademicYear: z.string().optional(),
  active_academic_term: z.enum(['TERM_1', 'TERM_2']).optional(),
  activeAcademicTerm: z.enum(['TERM_1', 'TERM_2']).optional(),
  support_whatsapp: z.string().optional(),
  supportWhatsapp: z.string().optional(),
  support_telegram: z.string().optional(),
  supportTelegram: z.string().optional(),
  telegram_url: z.string().optional(),
  telegramUrl: z.string().optional(),
  facebook_url: z.string().optional(),
  facebookUrl: z.string().optional(),
  youtube_channel_url: z.string().optional(),
  youtubeUrl: z.string().optional(),
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
  contact_channels: contactChannelsSchema.optional(),
  hall_of_fame_badge_ar: z.string().optional(),
  hallOfFameBadgeAr: z.string().optional(),
  hall_of_fame_badge_en: z.string().optional(),
  hallOfFameBadgeEn: z.string().optional(),
  hall_of_fame_title_ar: z.string().optional(),
  hallOfFameTitleAr: z.string().optional(),
  hall_of_fame_title_en: z.string().optional(),
  hallOfFameTitleEn: z.string().optional(),
  hall_of_fame_subtitle_ar: z.string().optional(),
  hallOfFameSubtitleAr: z.string().optional(),
  hall_of_fame_subtitle_en: z.string().optional(),
  hallOfFameSubtitleEn: z.string().optional(),
  honor_board_list: z.array(honorBoardItemSchema).optional(),
  honorBoardList: z.array(honorBoardItemSchema).optional()
}).passthrough();

export type UpdateCmsDto = z.infer<typeof updateCmsDtoSchema>;
