import { Schema, model, Document } from 'mongoose';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../common/constants/curriculum-hierarchy.constant';

export interface IQualificationItem {
  title_ar: string;
  title_en: string;
  year?: string;
}

export interface ITeacherProfile {
  bio_ar: string;
  bio_en: string;
  qualifications: IQualificationItem[];
  hero_video_youtube_id?: string | null;
}

export interface IScheduleItem {
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  academic_term: AcademicTermType;
  days_ar: string;
  days_en?: string;
  dayOfWeek?: string;
  time_slot: string;
  lecture_subject?: string;
  is_active: boolean;
}

export interface ITestimonialItem {
  author_name: string;
  author_role: 'STUDENT' | 'PARENT';
  curriculum: CurriculumType;
  grade_level: GradeLevelType;
  content: string;
  rating: number; // 1 to 5
  is_approved: boolean;
}

export interface IContactChannels {
  subscription_whatsapp: string;
  support_whatsapp: string;
  facebook_url?: string;
  youtube_channel_url?: string;
  telegram_url?: string;
}

export interface IAnalyticsSnapshot {
  active_students_count: number;
  total_leads_count: number;
  avg_watch_completion_pct: number;
  last_computed_at: Date;
}

export interface IGradeItem {
  code: string;
  titleAr: string;
  titleEn?: string;
}

export interface ICurriculumTrackItem {
  code: CurriculumType;
  nameAr: string;
  grades: IGradeItem[];
}

export interface ICmsConfig {
  singleton_key: string; // Strictly 'MAIN_SITE_CONFIG'
  hero_headline_ar: string;
  hero_headline_en?: string;
  hero_subheadline_ar: string;
  hero_subheadline_en?: string;
  hero_video_url?: string;
  announcement_banner_text: string;
  is_announcement_active: boolean;
  active_academic_year: string;
  active_academic_term: AcademicTermType;
  teacher_profile: ITeacherProfile;
  schedules_table: IScheduleItem[];
  testimonials_items: ITestimonialItem[];
  contact_channels: IContactChannels;
  assessment_batch_trackers: Map<string, number>;
  analytics_snapshot: IAnalyticsSnapshot;
  active_grades: string[];
  curricula_tracks?: ICurriculumTrackItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ICmsConfigDocument extends ICmsConfig, Document<string> {}

const QualificationItemSchema = new Schema<IQualificationItem>(
  {
    title_ar: { type: String, required: true, trim: true },
    title_en: { type: String, required: true, trim: true },
    year: { type: String, trim: true }
  },
  { _id: false }
);

const ScheduleItemSchema = new Schema<IScheduleItem>(
  {
    curriculum: {
      type: String,
      enum: CURRICULUMS,
      required: true,
      default: 'EGYPTIAN'
    },
    grade_level: {
      type: String,
      required: true
    },
    academic_term: {
      type: String,
      required: true,
      default: 'TERM_1'
    },
    days_ar: { type: String, default: 'الأحد والثلاثاء', trim: true },
    days_en: { type: String, default: 'Sun & Tue', trim: true },
    dayOfWeek: { type: String, trim: true },
    time_slot: { type: String, required: true, trim: true },
    lecture_subject: { type: String, default: 'رياضيات متقدمة', trim: true },
    is_active: { type: Boolean, default: true }
  },
  { _id: true }
);

const TestimonialItemSchema = new Schema<ITestimonialItem>(
  {
    author_name: { type: String, required: true, trim: true },
    author_role: { type: String, enum: ['STUDENT', 'PARENT'], required: true },
    curriculum: {
      type: String,
      enum: CURRICULUMS,
      required: true,
      default: 'EGYPTIAN'
    },
    grade_level: {
      type: String,
      enum: ALL_GRADE_LEVELS,
      required: true
    },
    content: { type: String, required: true, trim: true, maxlength: 600 },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    is_approved: { type: Boolean, default: true }
  },
  { _id: true }
);

/**
 * Pure Landing Page CMS & Operational Configuration Schema
 * CRITICAL v2.2 RULE: ZERO SEO fields stored here.
 * All SEO tags (meta, title, sitemap, OpenGraph) are 100% code-managed in Angular SSR SeoMetaService.
 */
const CmsConfigSchema = new Schema<ICmsConfigDocument>(
  {
    singleton_key: {
      type: String,
      default: 'MAIN_SITE_CONFIG',
      unique: true,
      required: true,
      trim: true
    },
    hero_headline_ar: {
      type: String,
      default: 'تعلم الرياضيات بأعلى المعايير الهندسية مع المهندسة هبة عبد الوهاب',
      trim: true
    },
    hero_headline_en: {
      type: String,
      default: 'Master Mathematics with Engineering Standards — Eng. Heba Abdel-Wahab',
      trim: true
    },
    hero_subheadline_ar: {
      type: String,
      default: 'منصة تفاعلية مخصصة للثانوية العامة والأنظمة الدولية بنظام حماية متطور واستراتيجيات ديسموس البيانية.',
      trim: true
    },
    hero_subheadline_en: {
      type: String,
      default: 'Interactive learning for Egyptian, Gulf, International, and American Curriculums with Desmos graphing strategies.',
      trim: true
    },
    hero_video_url: {
      type: String,
      default: '',
      trim: true
    },
    announcement_banner_text: {
      type: String,
      default: '✦ خصم 20% لفترة محدودة على اشتراك باقات الترم الأول بمناسبة تدشين المنصة ✦',
      trim: true
    },
    is_announcement_active: {
      type: Boolean,
      default: true
    },
    active_academic_year: {
      type: String,
      default: '2026 / 2027',
      trim: true
    },
    active_academic_term: {
      type: String,
      enum: ACADEMIC_TERMS,
      default: 'TERM_1'
    },
    teacher_profile: {
      bio_ar: { type: String, default: '', trim: true },
      bio_en: { type: String, default: '', trim: true },
      qualifications: { type: [QualificationItemSchema], default: [] },
      hero_video_youtube_id: { type: String, default: null, trim: true }
    },
    schedules_table: {
      type: [ScheduleItemSchema],
      default: []
    },
    testimonials_items: {
      type: [TestimonialItemSchema],
      default: []
    },
    contact_channels: {
      subscription_whatsapp: { type: String, required: true, trim: true },
      support_whatsapp: { type: String, required: true, trim: true },
      facebook_url: { type: String, default: '', trim: true },
      youtube_channel_url: { type: String, default: '', trim: true },
      telegram_url: { type: String, default: '', trim: true }
    },
    assessment_batch_trackers: {
      type: Map,
      of: Number,
      default: () => new Map<string, number>()
    },
    analytics_snapshot: {
      active_students_count: { type: Number, default: 0, min: 0 },
      total_leads_count: { type: Number, default: 0, min: 0 },
      avg_watch_completion_pct: { type: Number, default: 0, min: 0, max: 100 },
      last_computed_at: { type: Date, default: Date.now }
    },
    active_grades: {
      type: [String],
      default: ['SEC_3']
    },
    curricula_tracks: {
      type: [
        {
          code: { type: String, required: true },
          nameAr: { type: String, required: true },
          grades: [
            {
              code: { type: String, required: true },
              titleAr: { type: String, required: true },
              titleEn: { type: String, default: '' },
              nameAr: { type: String }
            }
          ]
        }
      ],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const CmsConfigModel = model<ICmsConfigDocument>('CmsConfig', CmsConfigSchema);
