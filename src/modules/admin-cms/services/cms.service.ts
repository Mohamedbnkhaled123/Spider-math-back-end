import { CmsConfigModel, ICmsConfig } from '../../../models/cms-config.model';
import { publicCmsCache } from '../../../config/cache.config';
import { UpdateCmsDto } from '../dto/update-cms.dto';

const CMS_CACHE_KEY = 'MAIN_SITE_CONFIG';
const CMS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class CmsService {
  /**
   * Retrieves Landing Page public configuration.
   * Utilizes RAM-first LRUCache with 10-minute TTL to shield MongoDB from anonymous visitor spikes.
   */
  public async getPublicLandingData(): Promise<ICmsConfig> {
    const cached = publicCmsCache.get(CMS_CACHE_KEY) as ICmsConfig | undefined;
    if (cached) {
      return cached;
    }

    let config: any = await CmsConfigModel.findOne({ singleton_key: 'MAIN_SITE_CONFIG' }).lean();

    if (!config) {
      // Seed default configuration if not initialized yet
      const created = await CmsConfigModel.create({
        singleton_key: 'MAIN_SITE_CONFIG',
        hero_headline_ar: 'تعلم الرياضيات بأعلى المعايير الهندسية مع المهندسة هبة عبد الوهاب',
        hero_headline_en: 'Master Mathematics with Engineering Standards — Eng. Heba Abdel-Wahab',
        hero_subheadline_ar: 'منصة تفاعلية مخصصة للثانوية العامة والأنظمة الدولية بنظام حماية متطور واستراتيجيات ديسموس البيانية.',
        hero_subheadline_en: 'Interactive learning for Egyptian, Gulf, International, and American Curriculums with Desmos graphing strategies.',
        announcement_banner_text: '✦ خصم 20% لفترة محدودة على اشتراك باقات الترم الأول بمناسبة تدشين المنصة ✦',
        is_announcement_active: true,
        active_academic_year: '2026 / 2027',
        active_academic_term: 'TERM_1',
        teacher_profile: {
          bio_ar: 'المهندسة هبة عبدالوهاب — متخصصة في تدريس الرياضيات للمناهج المصرية والخليجية والدولية والأمريكية بأحدث الأساليب التفاعلية.',
          bio_en: 'Eng. Heba Abdel-Wahab — Leading Mathematics Specialist across Egyptian, Gulf, International, and American Curriculums.',
          qualifications: [
            { title_ar: 'بكالوريوس الهندسة', title_en: 'B.Sc. in Engineering', year: '2016' },
            { title_ar: 'خبرة أكثر من 10 سنوات في تدريس الرياضيات', title_en: '10+ Years Teaching Mathematics' }
          ],
          hero_video_youtube_id: null
        },
        schedules_table: [
          {
            curriculum: 'EGYPTIAN',
            grade_level: 'SEC_3',
            academic_term: 'TERM_1',
            days_ar: 'الأحد والثلاثاء',
            days_en: 'Sun & Tue',
            dayOfWeek: 'الأحد والثلاثاء',
            time_slot: '07:00 م - 09:00 م',
            lecture_subject: 'تفاضل وتكامل وحساب مثلثات',
            is_active: true
          }
        ],
        testimonials_items: [],
        contact_channels: {
          subscription_whatsapp: '01012345678',
          support_whatsapp: '01012345678',
          facebook_url: 'https://facebook.com/spidermath',
          youtube_channel_url: 'https://youtube.com/@spidermath',
          telegram_url: 'https://t.me/spidermath'
        },
        assessment_batch_trackers: new Map(),
        analytics_snapshot: {
          active_students_count: 0,
          total_leads_count: 0,
          avg_watch_completion_pct: 0,
          last_computed_at: new Date()
        }
      });
      config = created.toObject();
    }

    // Normalized payload supporting both snake_case and camelCase
    const normalized: any = {
      ...config,
      heroHeadlineAr: config.hero_headline_ar || 'تعلم الرياضيات بأعلى المعايير الهندسية مع المهندسة هبة عبد الوهاب',
      heroHeadlineEn: config.hero_headline_en || 'Master Mathematics with Engineering Standards — Eng. Heba Abdel-Wahab',
      heroSubheadlineAr: config.hero_subheadline_ar || 'منصة تفاعلية مخصصة للثانوية العامة والأنظمة الدولية بنظام حماية متطور واستراتيجيات ديسموس البيانية.',
      heroSubheadlineEn: config.hero_subheadline_en || 'Interactive learning for Egyptian, Gulf, International, and American Curriculums with Desmos graphing strategies.',
      heroVideoUrl: config.hero_video_url || config.teacher_profile?.hero_video_youtube_id || '',
      hero_video_url: config.hero_video_url || config.teacher_profile?.hero_video_youtube_id || '',
      announcementBannerText: config.announcement_banner_text || '✦ خصم 20% لفترة محدودة على اشتراك باقات الترم الأول بمناسبة تدشين المنصة ✦',
      isAnnouncementActive: config.is_announcement_active ?? true,
      activeAcademicYear: config.active_academic_year || '2026 / 2027',
      activeAcademicTerm: config.active_academic_term || 'TERM_1',
      active_academic_term: config.active_academic_term || 'TERM_1',
      supportWhatsapp: config.contact_channels?.support_whatsapp || '01012345678',
      schedulesTable: (config.schedules_table || []).map((s: any) => ({
        curriculum: s.curriculum,
        gradeLevel: s.grade_level || s.gradeLevel,
        term: s.academic_term || s.term,
        dayOfWeek: s.dayOfWeek || s.days_ar,
        timeSlot: s.time_slot || s.timeSlot,
        lectureSubject: s.lecture_subject || s.lectureSubject || 'تفاضل وتكامل وحساب مثلثات'
      })),
      activeGrades: config.active_grades || ['SEC_3'],
      active_grades: config.active_grades || ['SEC_3']
    };

    // Populate RAM cache
    publicCmsCache.set(CMS_CACHE_KEY, normalized as any, CMS_CACHE_TTL_MS);

    return normalized as unknown as ICmsConfig;
  }

  /**
   * Updates Landing Page CMS configuration by Super Admin.
   * Atomically invalidates publicCmsCache entry so updates reflect instantly.
   */
  public async updateCmsConfig(dto: UpdateCmsDto): Promise<ICmsConfig> {
    const updatePayload: Record<string, unknown> = {};

    const heroAr = dto.hero_headline_ar ?? dto.heroHeadlineAr;
    if (heroAr !== undefined) updatePayload.hero_headline_ar = heroAr;

    const heroEn = dto.hero_headline_en ?? dto.heroHeadlineEn;
    if (heroEn !== undefined) updatePayload.hero_headline_en = heroEn;

    const subAr = dto.hero_subheadline_ar ?? dto.heroSubheadlineAr;
    if (subAr !== undefined) updatePayload.hero_subheadline_ar = subAr;

    const subEn = dto.hero_subheadline_en ?? dto.heroSubheadlineEn;
    if (subEn !== undefined) updatePayload.hero_subheadline_en = subEn;

    const heroVid = dto.hero_video_url ?? dto.heroVideoUrl;
    if (heroVid !== undefined) {
      updatePayload.hero_video_url = heroVid.trim();
      updatePayload['teacher_profile.hero_video_youtube_id'] = heroVid.trim();
    }

    const banner = dto.announcement_banner_text ?? dto.announcementBannerText;
    if (banner !== undefined) updatePayload.announcement_banner_text = banner;

    const isBannerActive = dto.is_announcement_active ?? dto.isAnnouncementActive;
    if (isBannerActive !== undefined) updatePayload.is_announcement_active = isBannerActive;

    const year = dto.active_academic_year ?? dto.activeAcademicYear;
    if (year !== undefined) updatePayload.active_academic_year = year;

    const term = dto.active_academic_term ?? (dto as any).activeAcademicTerm;
    if (term !== undefined) updatePayload.active_academic_term = term;

    const whatsapp = dto.support_whatsapp ?? dto.supportWhatsapp;
    if (whatsapp !== undefined) {
      updatePayload['contact_channels.support_whatsapp'] = whatsapp;
    }

    const activeGrades = dto.active_grades ?? (dto as any).activeGrades;
    if (activeGrades !== undefined && Array.isArray(activeGrades)) {
      updatePayload.active_grades = activeGrades;
    }

    const tracks = (dto as any).curricula_tracks ?? (dto as any).curriculaTracks;
    if (tracks !== undefined && Array.isArray(tracks)) {
      updatePayload.curricula_tracks = tracks;
    }

    if (dto.teacher_profile) {
      updatePayload.teacher_profile = dto.teacher_profile;
    }

    const scheds = dto.schedules_table ?? dto.schedulesTable;
    if (scheds && Array.isArray(scheds)) {
      updatePayload.schedules_table = scheds.map((s: any) => ({
        curriculum: s.curriculum || 'EGYPTIAN',
        grade_level: s.grade_level || s.gradeLevel || 'SEC_3',
        academic_term: s.academic_term || s.term || 'TERM_1',
        days_ar: s.days_ar || s.dayOfWeek || s.daysAr || 'الأحد والثلاثاء',
        days_en: s.days_en || s.daysEn || 'Sun & Tue',
        dayOfWeek: s.dayOfWeek || s.days_ar || 'الأحد والثلاثاء',
        time_slot: s.time_slot || s.timeSlot || '07:00 م - 09:00 م',
        lecture_subject: s.lecture_subject || s.lectureSubject || 'تفاضل وتكامل وحساب مثلثات',
        is_active: s.is_active ?? true
      }));
    }

    if (dto.testimonials_items) {
      updatePayload.testimonials_items = dto.testimonials_items;
    }
    if (dto.contact_channels) {
      updatePayload.contact_channels = dto.contact_channels;
    }

    const updated = await CmsConfigModel.findOneAndUpdate(
      { singleton_key: 'MAIN_SITE_CONFIG' },
      { $set: updatePayload },
      { new: true, upsert: true }
    ).lean();

    // Invalidate cache immediately
    publicCmsCache.delete(CMS_CACHE_KEY);

    return updated as unknown as ICmsConfig;
  }

  /**
   * Default fallback curricula tracks
   */
  public static readonly DEFAULT_TRACKS = [
    {
      code: 'EGYPTIAN',
      nameAr: 'المنهج المصري',
      grades: [
        { code: 'SEC_3', titleAr: 'الصف الثالث الثانوي (Thanaweya)', titleEn: 'Secondary 3' },
        { code: 'SEC_2', titleAr: 'الصف الثاني الثانوي', titleEn: 'Secondary 2' },
        { code: 'SEC_1', titleAr: 'الصف الأول الثانوي', titleEn: 'Secondary 1' },
        { code: 'PREP_3', titleAr: 'الصف الثالث الإعدادي', titleEn: 'Prep 3' }
      ]
    },
    {
      code: 'GULF',
      nameAr: 'المنهج الخليجي',
      grades: [
        { code: 'GRADE_12', titleAr: 'الصف الثاني عشر (توجيهي)', titleEn: 'Grade 12' },
        { code: 'GRADE_11', titleAr: 'الصف الحادي عشر', titleEn: 'Grade 11' },
        { code: 'GRADE_10', titleAr: 'الصف العاشر', titleEn: 'Grade 10' }
      ]
    },
    {
      code: 'INTERNATIONAL',
      nameAr: 'IGCSE / البريطانية',
      grades: [
        { code: 'IGCSE_AL', titleAr: 'A-Level Mathematics (9709)', titleEn: 'Cambridge / Edexcel A-Level' },
        { code: 'IGCSE_AS', titleAr: 'AS-Level Pure & Mechanics', titleEn: 'AS-Level Math' },
        { code: 'IGCSE_OL', titleAr: 'O-Level Extended Math (0580)', titleEn: 'IGCSE O-Level' }
      ]
    },
    {
      code: 'AMERICAN',
      nameAr: 'SAT / الأمريكية',
      grades: [
        { code: 'SAT_MATH', titleAr: 'Digital SAT Math (Hard Modules)', titleEn: 'SAT Digital Math' },
        { code: 'ACT_MATH', titleAr: 'ACT Math Mastery', titleEn: 'ACT Mathematics' },
        { code: 'EST_MATH', titleAr: 'EST I & EST II Math', titleEn: 'EST Math' }
      ]
    }
  ];

  /**
   * Retrieves array of active grade codes and the configured curricula tracks.
   */
  public async getActiveGrades(): Promise<{ activeGrades: string[]; curriculaTracks: any[] }> {
    const config = await this.getPublicLandingData();
    const activeGrades = (config as any).activeGrades || (config as any).active_grades || ['SEC_3'];
    let curriculaTracks = (config as any).curricula_tracks || (config as any).curriculaTracks;
    if (!curriculaTracks || !Array.isArray(curriculaTracks) || curriculaTracks.length === 0) {
      curriculaTracks = CmsService.DEFAULT_TRACKS;
    }
    return { activeGrades, curriculaTracks };
  }

  /**
   * Updates active grade codes and optional curricula tracks in CMS config.
   */
  public async updateActiveGrades(
    grades: string[],
    curriculaTracks?: any[]
  ): Promise<{ activeGrades: string[]; curriculaTracks: any[] }> {
    const payload: any = { active_grades: grades };
    if (curriculaTracks && Array.isArray(curriculaTracks)) {
      payload.curricula_tracks = curriculaTracks;
    }
    await this.updateCmsConfig(payload);
    return {
      activeGrades: grades,
      curriculaTracks: curriculaTracks || CmsService.DEFAULT_TRACKS
    };
  }
}

export const cmsService = new CmsService();
