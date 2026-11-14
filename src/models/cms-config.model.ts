import { Schema, model, Document } from 'mongoose';
import {
  CURRICULUMS,
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
  nameEn?: string;
  grades: IGradeItem[];
}

export interface IHonorBoardItem {
  id?: string;
  rank: number;
  nameAr: string;
  nameEn?: string;
  systemAr: string;
  systemEn?: string;
  achievementAr: string;
  achievementEn?: string;
  locationAr?: string;
  locationEn?: string;
  xp?: number;
  accuracy?: number;
  badgeAr?: string;
  badgeEn?: string;
  avatarUrl?: string;
  is_active: boolean;
}

export const DEFAULT_HONOR_BOARD_LIST: IHonorBoardItem[] = [
  {
    id: 'honor_1',
    rank: 1,
    nameAr: 'سارة أحمد محمود',
    nameEn: 'Sarah Ahmed Mahmoud',
    systemAr: 'ثانوية عامة (علمي رياضة)',
    systemEn: 'Egyptian Curriculum (Thanaweya)',
    achievementAr: '100% الدرجة النهائية في التفاضل والتكامل',
    achievementEn: '100% Final Score in Calculus & Analysis',
    locationAr: 'القاهرة — مدرسة المتفوقين STEM',
    locationEn: 'Cairo — STEM High School',
    xp: 14850,
    accuracy: 99.8,
    badgeAr: 'المركز الأول على مستوى المنصة',
    badgeEn: 'Rank #1 Platform Champion',
    is_active: true
  },
  {
    id: 'honor_2',
    rank: 2,
    nameAr: 'عمر خالد الشناوي',
    nameEn: 'Omar Khaled El-Shenawy',
    systemAr: 'الدبلومة الأمريكية (Digital SAT)',
    systemEn: 'American Diploma (Digital SAT Math)',
    achievementAr: '800 / 800 الدرجة الكاملة في الرياضيات',
    achievementEn: '800 / 800 Perfect Math Score',
    locationAr: 'الجيزة — مدرسة الألسن الدولية',
    locationEn: 'Giza — Al-Alson Int. School',
    xp: 13420,
    accuracy: 98.5,
    badgeAr: 'الدرجة الكاملة SAT',
    badgeEn: 'Perfect SAT Score',
    is_active: true
  },
  {
    id: 'honor_3',
    rank: 3,
    nameAr: 'مريم يوسف عبد الرحمن',
    nameEn: 'Mariam Youssef Abdel-Rahman',
    systemAr: 'المنهج الخليجي (الصف 12 متقدم)',
    systemEn: 'Gulf Curriculum (Grade 12 Advanced)',
    achievementAr: '99.8% في الرياضيات المتقدمة',
    achievementEn: '99.8% in Advanced Mathematics',
    locationAr: 'الرياض — مدارس الرواد',
    locationEn: 'Riyadh — Al-Rowad Schools',
    xp: 12910,
    accuracy: 97.2,
    badgeAr: 'تفوق استثنائي',
    badgeEn: 'Exceptional Mastery',
    is_active: true
  },
  {
    id: 'honor_4',
    rank: 4,
    nameAr: 'زياد طارق إبراهيم',
    nameEn: 'Ziad Tarek Ibrahim',
    systemAr: 'ثانوية عامة (الجبر والهندسة الفراغية)',
    systemEn: 'Egyptian Curriculum (Algebra & Solid Geom)',
    achievementAr: '100% الدرجة النهائية',
    achievementEn: '100% Final Score',
    locationAr: 'الإسكندرية',
    locationEn: 'Alexandria',
    xp: 11450,
    accuracy: 96.5,
    badgeAr: 'عبقري الجبر',
    badgeEn: 'Algebra Master',
    is_active: true
  },
  {
    id: 'honor_5',
    rank: 5,
    nameAr: 'ياسمين حازم المهدي',
    nameEn: 'Yasmine Hazem El-Mahdy',
    systemAr: 'البريطاني الدولي (IGCSE Cambridge)',
    systemEn: 'British Curriculum (IGCSE Cambridge)',
    achievementAr: 'Grade A* في الرياضيات البحتة المتقدمة',
    achievementEn: 'Grade A* in Further Pure Math',
    locationAr: 'القاهرة',
    locationEn: 'Cairo',
    xp: 10890,
    accuracy: 95.8,
    badgeAr: 'امتياز كامبريدج',
    badgeEn: 'Cambridge Distinction',
    is_active: true
  },
  {
    id: 'honor_6',
    rank: 6,
    nameAr: 'أحمد حسام الدين',
    nameEn: 'Ahmed Hossam El-Din',
    systemAr: 'الدبلومة الأمريكية (EST Math)',
    systemEn: 'American Diploma (EST Math)',
    achievementAr: 'المركز الأول في اختبارات EST التجريبية',
    achievementEn: 'Rank #1 in EST Diagnostic Exams',
    locationAr: 'طنطا',
    locationEn: 'Tanta',
    xp: 9940,
    accuracy: 95.0,
    badgeAr: 'نجم EST',
    badgeEn: 'EST Star',
    is_active: true
  },
  {
    id: 'honor_7',
    rank: 7,
    nameAr: 'نور الهدى كريم',
    nameEn: 'Nour El-Hoda Karim',
    systemAr: 'المنهج الخليجي (الصف 11)',
    systemEn: 'Gulf Curriculum (Grade 11)',
    achievementAr: 'الدرجة النهائية في حساب المثلثات',
    achievementEn: 'Perfect Score in Trigonometry',
    locationAr: 'جدة',
    locationEn: 'Jeddah',
    xp: 9420,
    accuracy: 94.5,
    badgeAr: 'بطلة المثلثات',
    badgeEn: 'Trig Champion',
    is_active: true
  }
];

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
  announcement_banner_text_en?: string;

  // Hero Section Bilingual Elements
  hero_badge_ar?: string;
  hero_badge_en?: string;
  hero_cta_primary_ar?: string;
  hero_cta_primary_en?: string;
  hero_cta_secondary_ar?: string;
  hero_cta_secondary_en?: string;

  // Teacher Profile Top-Level Bilingual
  teacher_name_ar?: string;
  teacher_name_en?: string;
  teacher_title_ar?: string;
  teacher_title_en?: string;
  teacher_bio_ar?: string;
  teacher_bio_en?: string;
  teacher_qualifications_ar?: string[];
  teacher_qualifications_en?: string[];
  teacher_whatsapp_cta_ar?: string;
  teacher_whatsapp_cta_en?: string;

  // Curriculum Section
  curriculum_badge_ar?: string;
  curriculum_badge_en?: string;
  curriculum_title_ar?: string;
  curriculum_title_en?: string;
  curriculum_subtitle_ar?: string;
  curriculum_subtitle_en?: string;

  // Placement Test Section
  placement_badge_ar?: string;
  placement_badge_en?: string;
  placement_headline_ar?: string;
  placement_headline_en?: string;
  placement_subtitle_ar?: string;
  placement_subtitle_en?: string;
  placement_feature_1_ar?: string;
  placement_feature_1_en?: string;
  placement_feature_2_ar?: string;
  placement_feature_2_en?: string;
  placement_feature_3_ar?: string;
  placement_feature_3_en?: string;
  placement_cta_ar?: string;
  placement_cta_en?: string;

  // Schedules Section
  schedule_badge_ar?: string;
  schedule_badge_en?: string;
  schedule_title_ar?: string;
  schedule_title_en?: string;
  schedule_subtitle_ar?: string;
  schedule_subtitle_en?: string;

  // Pricing Section
  pricing_badge_ar?: string;
  pricing_badge_en?: string;
  pricing_title_ar?: string;
  pricing_title_en?: string;
  pricing_subtitle_ar?: string;
  pricing_subtitle_en?: string;

  // Hall of Fame / Honor Board Section
  hall_of_fame_badge_ar?: string;
  hall_of_fame_badge_en?: string;
  hall_of_fame_title_ar?: string;
  hall_of_fame_title_en?: string;
  hall_of_fame_subtitle_ar?: string;
  hall_of_fame_subtitle_en?: string;
  honor_board_list?: IHonorBoardItem[];

  teacher_profile: ITeacherProfile;
  schedules_table: IScheduleItem[];
  contact_channels: IContactChannels;
  assessment_batch_trackers: Map<string, number>;
  analytics_snapshot: IAnalyticsSnapshot;
  active_grades: string[];
  landing_unit_ids?: string[];
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

const HonorBoardItemSchema = new Schema<IHonorBoardItem>(
  {
    id: { type: String },
    rank: { type: Number, required: true },
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, default: '', trim: true },
    systemAr: { type: String, required: true, trim: true },
    systemEn: { type: String, default: '', trim: true },
    achievementAr: { type: String, required: true, trim: true },
    achievementEn: { type: String, default: '', trim: true },
    locationAr: { type: String, default: '', trim: true },
    locationEn: { type: String, default: '', trim: true },
    xp: { type: Number, default: 0 },
    accuracy: { type: Number, default: 100 },
    badgeAr: { type: String, default: '', trim: true },
    badgeEn: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '', trim: true },
    is_active: { type: Boolean, default: true }
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
      default: 'التميز الرياضي المتقدم',
      trim: true
    },
    hero_headline_en: {
      type: String,
      default: 'Advanced Mathematics Mastery',
      trim: true
    },
    hero_subheadline_ar: {
      type: String,
      default: 'إعداد جامعي وتميز لطلاب الثانوية العامة والأنظمة الدولية (الثانوية العامة • IGCSE • SAT)',
      trim: true
    },
    hero_subheadline_en: {
      type: String,
      default: 'University-Prep & High School Excellence (Thanweya Amma • IGCSE • SAT)',
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
    announcement_banner_text_en: {
      type: String,
      default: '✦ 20% Limited Discount on Term 1 Master Packages for Platform Launch ✦',
      trim: true
    },
    hero_badge_ar: {
      type: String,
      default: 'Spider Math✦ المنظومة الهندسية الرائدة',
      trim: true
    },
    hero_badge_en: {
      type: String,
      default: 'Spider Math✦ Engineering Excellence',
      trim: true
    },
    hero_cta_primary_ar: {
      type: String,
      default: 'استكشف المناهج',
      trim: true
    },
    hero_cta_primary_en: {
      type: String,
      default: 'Explore Curricula',
      trim: true
    },
    hero_cta_secondary_ar: {
      type: String,
      default: 'تواصل مع المساعد الذكي',
      trim: true
    },
    hero_cta_secondary_en: {
      type: String,
      default: 'Speak to AI Tutor',
      trim: true
    },
    teacher_name_ar: {
      type: String,
      default: 'المهندسة / هبة عبدالوهاب',
      trim: true
    },
    teacher_name_en: {
      type: String,
      default: 'Eng. Heba Abdel-Wahab',
      trim: true
    },
    teacher_title_ar: {
      type: String,
      default: 'كبير محاضري الرياضيات للشهادات العامة والدولية وخبير الدبلومة الأمريكية و Desmos',
      trim: true
    },
    teacher_title_en: {
      type: String,
      default: 'Principal Mathematics Educator, American Diploma & Desmos Graphing Specialist',
      trim: true
    },
    teacher_bio_ar: {
      type: String,
      default: 'خبرة تزيد عن 14 عاماً في تدريس وتبسيط مناهج الرياضيات المصرية والخليجية والدولية (IGCSE) والدبلومة الأمريكية (SAT/EST/ACT). متخصصة في توظيف حاسبة ديسموس البيانية وحل المسائل الهندسية المعقدة بأسهل الطرق.',
      trim: true
    },
    teacher_bio_en: {
      type: String,
      default: 'Over 14 years of excellence in teaching Egyptian, Gulf, IGCSE, and American Diploma Mathematics with deep interactive mastery of the Desmos Graphing Calculator.',
      trim: true
    },
    teacher_qualifications_ar: {
      type: [String],
      default: [
        'بكالوريوس هندسة — جامعة القاهرة مع مرتبة الشرف',
        'خبير معتمد ومحاضر دولي في حاسبة Desmos البيانية المتقدمة',
        'مدرب معتمد لاختبارات الـ SAT I/II و EST I/II و ACT Math',
        'أعلى نسب تفوق في الثانوية العامة والشهادة الإعدادية لسنوات متتالية'
      ]
    },
    teacher_qualifications_en: {
      type: [String],
      default: [
        'B.Sc. in Engineering — Cairo University with Honors',
        'Certified International Desmos Graphing Calculator Specialist',
        'Certified Instructor for SAT I/II, EST I/II and ACT Math',
        'Consistent top scores and highest student rankings year over year'
      ]
    },
    teacher_whatsapp_cta_ar: {
      type: String,
      default: 'تواصل مباشرة مع فريق م/ هبة عبر واتساب',
      trim: true
    },
    teacher_whatsapp_cta_en: {
      type: String,
      default: 'Direct WhatsApp Consultation',
      trim: true
    },
    curriculum_badge_ar: {
      type: String,
      default: 'المسارات الأكاديمية والمناهج',
      trim: true
    },
    curriculum_badge_en: {
      type: String,
      default: 'Academic Tracks & Curriculums',
      trim: true
    },
    curriculum_title_ar: {
      type: String,
      default: 'اختر منهجك الدراسي وابدأ رحلة التفوق',
      trim: true
    },
    curriculum_title_en: {
      type: String,
      default: 'Choose Your Curriculum & Begin Mastery',
      trim: true
    },
    curriculum_subtitle_ar: {
      type: String,
      default: 'مناهج تعليمية متكاملة مصممة بأعلى معايير الجودة لتناسب نظامك الدراسي',
      trim: true
    },
    curriculum_subtitle_en: {
      type: String,
      default: 'Comprehensive educational tracks designed with high engineering standards',
      trim: true
    },
    placement_badge_ar: {
      type: String,
      default: 'اختبار تحديد المستوى وتشخيص المهارات الرياضية',
      trim: true
    },
    placement_badge_en: {
      type: String,
      default: 'Free Placement & Diagnostic Assessment',
      trim: true
    },
    placement_headline_ar: {
      type: String,
      default: 'ابدأ اختبار تحديد المستوى واكتشف نقاط قوتك وضعفك',
      trim: true
    },
    placement_headline_en: {
      type: String,
      default: 'Assess Your Skills & Discover Your Strengths',
      trim: true
    },
    placement_subtitle_ar: {
      type: String,
      default: 'تقييم تشخيصي تفاعلي ذكي يقيس مهاراتك التأسيسية وحل المسائل التحليلية لتحديد خطتك الأكاديمية بدقة وبإشراف مباشر من المهندسة هبة عبدالوهاب.',
      trim: true
    },
    placement_subtitle_en: {
      type: String,
      default: 'Interactive diagnostic assessment designed to evaluate core foundational concepts and analytical problem solving with instant insights.',
      trim: true
    },
    placement_feature_1_ar: {
      type: String,
      default: 'تقييم ذكي ومباشر',
      trim: true
    },
    placement_feature_1_en: {
      type: String,
      default: 'Instant Diagnostic Feedback',
      trim: true
    },
    placement_feature_2_ar: {
      type: String,
      default: 'تقرير مفصل بنقاط القوة والضعف',
      trim: true
    },
    placement_feature_2_en: {
      type: String,
      default: 'Strengths & Weaknesses Report',
      trim: true
    },
    placement_feature_3_ar: {
      type: String,
      default: 'متابعة شخصية من م/ هبة عبدالوهاب',
      trim: true
    },
    placement_feature_3_en: {
      type: String,
      default: 'Eng. Heba Follow-up',
      trim: true
    },
    placement_cta_ar: {
      type: String,
      default: 'ابدأ اختبار تحديد المستوى الآن',
      trim: true
    },
    placement_cta_en: {
      type: String,
      default: 'Start Diagnostic Assessment Now',
      trim: true
    },
    schedule_badge_ar: {
      type: String,
      default: 'جدول المواعيد والحصص',
      trim: true
    },
    schedule_badge_en: {
      type: String,
      default: 'Live Lecture Schedule',
      trim: true
    },
    schedule_title_ar: {
      type: String,
      default: 'مواعيد المحاضرات والبث المباشر',
      trim: true
    },
    schedule_title_en: {
      type: String,
      default: 'Class Timetable & Streaming Schedule',
      trim: true
    },
    schedule_subtitle_ar: {
      type: String,
      default: 'يتم تحديث المواعيد وفقاً للتوقيت المحلي لمدينة القاهرة',
      trim: true
    },
    schedule_subtitle_en: {
      type: String,
      default: 'Times shown in Cairo Local Time (GMT+3)',
      trim: true
    },
    pricing_badge_ar: {
      type: String,
      default: 'الباقات الدراسية والمراجعات',
      trim: true
    },
    pricing_badge_en: {
      type: String,
      default: 'Packages & Tuition Plans',
      trim: true
    },
    pricing_title_ar: {
      type: String,
      default: 'استثمر في مستقبلك الأكاديمي بأعلى معايير الجودة',
      trim: true
    },
    pricing_title_en: {
      type: String,
      default: 'Transparent Tuition & Revision Packages',
      trim: true
    },
    pricing_subtitle_ar: {
      type: String,
      default: 'خطط دراسية مرنة ومراجعات نهائية مكثفة تضمن لك التفوق بأفضل الأسعار',
      trim: true
    },
    pricing_subtitle_en: {
      type: String,
      default: 'Flexible study units and intensive final revisions engineered for mastery',
      trim: true
    },
    hall_of_fame_badge_ar: {
      type: String,
      default: 'لوحة الشرف • أبطال الرياضيات',
      trim: true
    },
    hall_of_fame_badge_en: {
      type: String,
      default: 'Hall of Fame • Top Math Masters',
      trim: true
    },
    hall_of_fame_title_ar: {
      type: String,
      default: 'لوحة الشرف والتفوق الأكاديمي',
      trim: true
    },
    hall_of_fame_title_en: {
      type: String,
      default: 'Academic Hall of Fame & Honor Roll',
      trim: true
    },
    hall_of_fame_subtitle_ar: {
      type: String,
      default: 'نخبة طلابنا الذين حققوا العلامات الكاملة وأعلى مراتب التميز والذكاء الرياضي.',
      trim: true
    },
    hall_of_fame_subtitle_en: {
      type: String,
      default: 'Elite students who achieved perfect scores and mathematical excellence across all academic curricula.',
      trim: true
    },
    honor_board_list: {
      type: [HonorBoardItemSchema],
      default: () => DEFAULT_HONOR_BOARD_LIST
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
    landing_unit_ids: {
      type: [String],
      default: []
    },
    curricula_tracks: {
      type: [
        {
          code: { type: String, required: true },
          nameAr: { type: String, required: true },
          nameEn: { type: String, default: '' },
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
