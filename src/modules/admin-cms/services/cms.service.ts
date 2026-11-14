import { CmsConfigModel, ICmsConfig, DEFAULT_HONOR_BOARD_LIST } from '../../../models/cms-config.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { DEFAULT_CURRICULA_TRACKS } from '../../../common/constants/curriculum-hierarchy.constant';
import { curriculumTreeService } from '../../public-discovery/services/curriculum-tree.service';
import { publicCmsCache } from '../../../config/cache.config';
import { UpdateCmsDto } from '../dto/update-cms.dto';

const CMS_CACHE_KEY = 'MAIN_SITE_CONFIG';
const CMS_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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
        schedules_table: [],
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
      announcementBannerTextEn: config.announcement_banner_text_en || '✦ 20% Limited Discount on Term 1 Master Packages for Platform Launch ✦',

      heroBadgeAr: config.hero_badge_ar || 'Spider Math✦ المنظومة الهندسية الرائدة',
      heroBadgeEn: config.hero_badge_en || 'Spider Math✦ Engineering Excellence',
      heroCtaPrimaryAr: config.hero_cta_primary_ar || 'اختار منهجك وابدأ الآن',
      heroCtaPrimaryEn: config.hero_cta_primary_en || 'Choose Your Curriculum & Begin',
      heroCtaSecondaryAr: config.hero_cta_secondary_ar || 'امتحان تحديد المستوى المجاني',
      heroCtaSecondaryEn: config.hero_cta_secondary_en || 'Free Placement Test',

      teacherNameAr: config.teacher_name_ar || 'المهندسة / هبة عبدالوهاب',
      teacherNameEn: config.teacher_name_en || 'Eng. Heba Abdel-Wahab',
      teacherTitleAr: config.teacher_title_ar || 'كبير محاضري الرياضيات للشهادات العامة والدولية وخبير الدبلومة الأمريكية و Desmos',
      teacherTitleEn: config.teacher_title_en || 'Principal Mathematics Educator, American Diploma & Desmos Graphing Specialist',
      teacherBioAr: config.teacher_bio_ar || 'خبرة تزيد عن 14 عاماً في تدريس وتبسيط مناهج الرياضيات المصرية والخليجية والدولية (IGCSE) والدبلومة الأمريكية (SAT/EST/ACT). متخصصة في توظيف حاسبة ديسموس البيانية وحل المسائل الهندسية المعقدة بأسهل الطرق.',
      teacherBioEn: config.teacher_bio_en || 'Over 14 years of excellence in teaching Egyptian, Gulf, IGCSE, and American Diploma Mathematics with deep interactive mastery of the Desmos Graphing Calculator.',
      teacherQualificationsAr: (config.teacher_qualifications_ar && config.teacher_qualifications_ar.length > 0) ? config.teacher_qualifications_ar : [
        'بكالوريوس هندسة — جامعة القاهرة مع مرتبة الشرف',
        'خبير معتمد ومحاضر دولي في حاسبة Desmos البيانية المتقدمة',
        'مدرب معتمد لاختبارات الـ SAT I/II و EST I/II و ACT Math',
        'أعلى نسب تفوق في الثانوية العامة والشهادة الإعدادية لسنوات متتالية'
      ],
      teacherQualificationsEn: (config.teacher_qualifications_en && config.teacher_qualifications_en.length > 0) ? config.teacher_qualifications_en : [
        'B.Sc. in Engineering — Cairo University with Honors',
        'Certified International Desmos Graphing Calculator Specialist',
        'Certified Instructor for SAT I/II, EST I/II and ACT Math',
        'Consistent top scores and highest student rankings year over year'
      ],
      teacherWhatsappCtaAr: config.teacher_whatsapp_cta_ar || 'تواصل مباشرة مع فريق م/ هبة عبر واتساب',
      teacherWhatsappCtaEn: config.teacher_whatsapp_cta_en || 'Direct WhatsApp Consultation',

      curriculumBadgeAr: config.curriculum_badge_ar || 'المسارات الأكاديمية والمناهج',
      curriculumBadgeEn: config.curriculum_badge_en || 'Academic Tracks & Curriculums',
      curriculumTitleAr: config.curriculum_title_ar || 'اختر منهجك الدراسي وابدأ رحلة التفوق',
      curriculumTitleEn: config.curriculum_title_en || 'Choose Your Curriculum & Begin Mastery',
      curriculumSubtitleAr: config.curriculum_subtitle_ar || 'مناهج تعليمية متكاملة مصممة بأعلى معايير الجودة لتناسب نظامك الدراسي',
      curriculumSubtitleEn: config.curriculum_subtitle_en || 'Comprehensive educational tracks designed with high engineering standards',

      placementBadgeAr: config.placement_badge_ar || 'اختبار تحديد المستوى وتشخيص المهارات الرياضية',
      placementBadgeEn: config.placement_badge_en || 'Free Placement & Diagnostic Assessment',
      placementHeadlineAr: config.placement_headline_ar || 'ابدأ اختبار تحديد المستوى واكتشف نقاط قوتك وضعفك',
      placementHeadlineEn: config.placement_headline_en || 'Assess Your Skills & Discover Your Strengths',
      placementSubtitleAr: config.placement_subtitle_ar || 'تقييم تشخيصي تفاعلي ذكي يقيس مهاراتك التأسيسية وحل المسائل التحليلية لتحديد خطتك الأكاديمية بدقة وبإشراف مباشر من المهندسة هبة عبدالوهاب.',
      placementSubtitleEn: config.placement_subtitle_en || 'Interactive diagnostic assessment designed to evaluate core foundational concepts and analytical problem solving with instant insights.',
      placementFeature1Ar: config.placement_feature_1_ar || 'تقييم ذكي ومباشر',
      placementFeature1En: config.placement_feature_1_en || 'Instant Diagnostic Feedback',
      placementFeature2Ar: config.placement_feature_2_ar || 'تقرير مفصل بنقاط القوة والضعف',
      placementFeature2En: config.placement_feature_2_en || 'Strengths & Weaknesses Report',
      placementFeature3Ar: config.placement_feature_3_ar || 'متابعة شخصية من م/ هبة عبدالوهاب',
      placementFeature3En: config.placement_feature_3_en || 'Eng. Heba Follow-up',
      placementCtaAr: config.placement_cta_ar || 'ابدأ اختبار تحديد المستوى الآن',
      placementCtaEn: config.placement_cta_en || 'Start Diagnostic Assessment Now',

      scheduleBadgeAr: config.schedule_badge_ar || 'جدول المواعيد والحصص',
      scheduleBadgeEn: config.schedule_badge_en || 'Live Lecture Schedule',
      scheduleTitleAr: config.schedule_title_ar || 'مواعيد المحاضرات والبث المباشر',
      scheduleTitleEn: config.schedule_title_en || 'Class Timetable & Streaming Schedule',
      scheduleSubtitleAr: config.schedule_subtitle_ar || 'يتم تحديث المواعيد وفقاً للتوقيت المحلي لمدينة القاهرة',
      scheduleSubtitleEn: config.schedule_subtitle_en || 'Times shown in Cairo Local Time (GMT+3)',

      pricingBadgeAr: config.pricing_badge_ar || 'الباقات الدراسية والمراجعات',
      pricingBadgeEn: config.pricing_badge_en || 'Packages & Tuition Plans',
      pricingTitleAr: config.pricing_title_ar || 'استثمر في مستقبلك الأكاديمي بأعلى معايير الجودة',
      pricingTitleEn: config.pricing_title_en || 'Transparent Tuition & Revision Packages',
      pricingSubtitleAr: config.pricing_subtitle_ar || 'خطط دراسية مرنة ومراجعات نهائية مكثفة تضمن لك التفوق بأفضل الأسعار',
      pricingSubtitleEn: config.pricing_subtitle_en || 'Flexible study units and intensive final revisions engineered for mastery',
      hallOfFameBadgeAr: config.hall_of_fame_badge_ar || 'لوحة الشرف • أبطال الرياضيات',
      hallOfFameBadgeEn: config.hall_of_fame_badge_en || 'Hall of Fame • Top Math Masters',
      hallOfFameTitleAr: config.hall_of_fame_title_ar || 'لوحة الشرف والتفوق الأكاديمي',
      hallOfFameTitleEn: config.hall_of_fame_title_en || 'Academic Hall of Fame & Honor Roll',
      hallOfFameSubtitleAr: config.hall_of_fame_subtitle_ar || 'نخبة طلابنا الذين حققوا العلامات الكاملة وأعلى مراتب التميز والذكاء الرياضي.',
      hallOfFameSubtitleEn: config.hall_of_fame_subtitle_en || 'Elite students who achieved perfect scores and mathematical excellence across all academic curricula.',
      honorBoardList: (config.honor_board_list && config.honor_board_list.length > 0) ? config.honor_board_list : DEFAULT_HONOR_BOARD_LIST,
      honor_board_list: (config.honor_board_list && config.honor_board_list.length > 0) ? config.honor_board_list : DEFAULT_HONOR_BOARD_LIST,
      activeAcademicYear: config.active_academic_year || '2026 / 2027',
      activeAcademicTerm: config.active_academic_term || 'TERM_1',
      active_academic_term: config.active_academic_term || 'TERM_1',
      supportWhatsapp: config.contact_channels?.support_whatsapp || '01012345678',
      supportTelegram: config.contact_channels?.telegram_url || '',
      facebookUrl: config.contact_channels?.facebook_url || '',
      youtubeUrl: config.contact_channels?.youtube_channel_url || '',
      contactChannels: config.contact_channels || {
        subscription_whatsapp: config.contact_channels?.support_whatsapp || '01012345678',
        support_whatsapp: config.contact_channels?.support_whatsapp || '01012345678',
        telegram_url: config.contact_channels?.telegram_url || '',
        facebook_url: config.contact_channels?.facebook_url || '',
        youtube_channel_url: config.contact_channels?.youtube_channel_url || ''
      },
      schedulesTable: (config.schedules_table || []).map((s: any) => ({
        curriculum: s.curriculum,
        gradeLevel: s.grade_level || s.gradeLevel,
        term: s.academic_term || s.term,
        dayOfWeek: s.dayOfWeek || s.days_ar,
        timeSlot: s.time_slot || s.timeSlot,
        lectureSubject: s.lecture_subject || s.lectureSubject || ''
      })),
      activeGrades: config.active_grades || ['SEC_3'],
      active_grades: config.active_grades || ['SEC_3'],
      landingUnitIds: config.landing_unit_ids || [],
      landing_unit_ids: config.landing_unit_ids || [],
      curriculaTracks: config.curricula_tracks || DEFAULT_CURRICULA_TRACKS,
      curricula_tracks: config.curricula_tracks || DEFAULT_CURRICULA_TRACKS
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

    const bannerEn = (dto as any).announcement_banner_text_en ?? (dto as any).announcementBannerTextEn;
    if (bannerEn !== undefined) updatePayload.announcement_banner_text_en = bannerEn;

    // Helper to map either snake_case or camelCase into updatePayload
    const bilingualPairs: Array<[string, string]> = [
      ['hero_badge_ar', 'heroBadgeAr'],
      ['hero_badge_en', 'heroBadgeEn'],
      ['hero_cta_primary_ar', 'heroCtaPrimaryAr'],
      ['hero_cta_primary_en', 'heroCtaPrimaryEn'],
      ['hero_cta_secondary_ar', 'heroCtaSecondaryAr'],
      ['hero_cta_secondary_en', 'heroCtaSecondaryEn'],
      ['teacher_name_ar', 'teacherNameAr'],
      ['teacher_name_en', 'teacherNameEn'],
      ['teacher_title_ar', 'teacherTitleAr'],
      ['teacher_title_en', 'teacherTitleEn'],
      ['teacher_bio_ar', 'teacherBioAr'],
      ['teacher_bio_en', 'teacherBioEn'],
      ['teacher_qualifications_ar', 'teacherQualificationsAr'],
      ['teacher_qualifications_en', 'teacherQualificationsEn'],
      ['teacher_whatsapp_cta_ar', 'teacherWhatsappCtaAr'],
      ['teacher_whatsapp_cta_en', 'teacherWhatsappCtaEn'],
      ['curriculum_badge_ar', 'curriculumBadgeAr'],
      ['curriculum_badge_en', 'curriculumBadgeEn'],
      ['curriculum_title_ar', 'curriculumTitleAr'],
      ['curriculum_title_en', 'curriculumTitleEn'],
      ['curriculum_subtitle_ar', 'curriculumSubtitleAr'],
      ['curriculum_subtitle_en', 'curriculumSubtitleEn'],
      ['placement_badge_ar', 'placementBadgeAr'],
      ['placement_badge_en', 'placementBadgeEn'],
      ['placement_headline_ar', 'placementHeadlineAr'],
      ['placement_headline_en', 'placementHeadlineEn'],
      ['placement_subtitle_ar', 'placementSubtitleAr'],
      ['placement_subtitle_en', 'placementSubtitleEn'],
      ['placement_feature_1_ar', 'placementFeature1Ar'],
      ['placement_feature_1_en', 'placementFeature1En'],
      ['placement_feature_2_ar', 'placementFeature2Ar'],
      ['placement_feature_2_en', 'placementFeature2En'],
      ['placement_feature_3_ar', 'placementFeature3Ar'],
      ['placement_feature_3_en', 'placementFeature3En'],
      ['placement_cta_ar', 'placementCtaAr'],
      ['placement_cta_en', 'placementCtaEn'],
      ['schedule_badge_ar', 'scheduleBadgeAr'],
      ['schedule_badge_en', 'scheduleBadgeEn'],
      ['schedule_title_ar', 'scheduleTitleAr'],
      ['schedule_title_en', 'scheduleTitleEn'],
      ['schedule_subtitle_ar', 'scheduleSubtitleAr'],
      ['schedule_subtitle_en', 'scheduleSubtitleEn'],
      ['pricing_badge_ar', 'pricingBadgeAr'],
      ['pricing_badge_en', 'pricingBadgeEn'],
      ['pricing_title_ar', 'pricingTitleAr'],
      ['pricing_title_en', 'pricingTitleEn'],
      ['pricing_subtitle_ar', 'pricingSubtitleAr'],
      ['pricing_subtitle_en', 'pricingSubtitleEn'],
      ['hall_of_fame_badge_ar', 'hallOfFameBadgeAr'],
      ['hall_of_fame_badge_en', 'hallOfFameBadgeEn'],
      ['hall_of_fame_title_ar', 'hallOfFameTitleAr'],
      ['hall_of_fame_title_en', 'hallOfFameTitleEn'],
      ['hall_of_fame_subtitle_ar', 'hallOfFameSubtitleAr'],
      ['hall_of_fame_subtitle_en', 'hallOfFameSubtitleEn']
    ];

    for (const [snake, camel] of bilingualPairs) {
      const val = (dto as any)[snake] ?? (dto as any)[camel];
      if (val !== undefined) {
        updatePayload[snake] = val;
      }
    }

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

    const landingUnits = (dto as any).landing_unit_ids ?? (dto as any).landingUnitIds;
    if (landingUnits !== undefined && Array.isArray(landingUnits)) {
      updatePayload.landing_unit_ids = landingUnits;
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
        lecture_subject: s.lecture_subject || s.lectureSubject || '',
        is_active: s.is_active ?? true
      }));
    }
    if (dto.contact_channels) {
      updatePayload.contact_channels = dto.contact_channels;
    }

    const honorBoard = (dto as any).honor_board_list ?? (dto as any).honorBoardList;
    if (honorBoard !== undefined && Array.isArray(honorBoard)) {
      updatePayload.honor_board_list = honorBoard.map((h: any, idx: number) => ({
        id: h.id || `honor_${Date.now()}_${idx}`,
        rank: Number(h.rank) || idx + 1,
        nameAr: (h.nameAr || h.name_ar || '').trim(),
        nameEn: (h.nameEn || h.name_en || '').trim(),
        systemAr: (h.systemAr || h.system_ar || '').trim(),
        systemEn: (h.systemEn || h.system_en || '').trim(),
        achievementAr: (h.achievementAr || h.achievement_ar || '').trim(),
        achievementEn: (h.achievementEn || h.achievement_en || '').trim(),
        locationAr: (h.locationAr || h.location_ar || '').trim(),
        locationEn: (h.locationEn || h.location_en || '').trim(),
        xp: Number(h.xp) || 0,
        accuracy: Number(h.accuracy) || 100,
        badgeAr: (h.badgeAr || h.badge_ar || '').trim(),
        badgeEn: (h.badgeEn || h.badge_en || '').trim(),
        avatarUrl: (h.avatarUrl || h.avatar_url || '').trim(),
        is_active: h.is_active ?? h.isActive ?? true
      }));
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
  public static readonly DEFAULT_TRACKS = DEFAULT_CURRICULA_TRACKS;

  /**
   * Retrieves array of active grade codes and the configured curricula tracks.
   */
  public async getActiveGrades(): Promise<{ activeGrades: string[]; curriculaTracks: any[] }> {
    const config = await this.getPublicLandingData();
    const activeGrades = (config as any).activeGrades || (config as any).active_grades || ['SEC_3'];
    let curriculaTracks = (config as any).curricula_tracks || (config as any).curriculaTracks;
    if (!curriculaTracks || !Array.isArray(curriculaTracks) || curriculaTracks.length === 0) {
      curriculaTracks = CmsService.DEFAULT_TRACKS;
    } else {
      curriculaTracks = curriculaTracks.map((t: any) => {
        if (t.code === 'INTERNATIONAL') {
          const defaultIntl = DEFAULT_CURRICULA_TRACKS.find((d) => d.code === 'INTERNATIONAL');
          const isLegacyName = !t.nameAr || t.nameAr.includes('البريطانية');
          const hasIncompleteGrades = !t.grades || t.grades.length <= 4;
          return {
            ...t,
            nameAr: isLegacyName ? 'المناهج الدولية' : t.nameAr,
            nameEn: isLegacyName ? 'International Curriculum' : (t.nameEn || 'International Curriculum'),
            divisions: (!t.divisions || t.divisions.length === 0) ? defaultIntl?.divisions : t.divisions,
            grades: hasIncompleteGrades ? defaultIntl?.grades : t.grades
          };
        }
        return t;
      });
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
    // 1. Detect any deleted grades and safely unpublish their units and assessments
    if (curriculaTracks && Array.isArray(curriculaTracks)) {
      const currentConfig: any = await CmsConfigModel.findOne({ singleton_key: 'MAIN_SITE_CONFIG' }).lean();
      const oldTracks = currentConfig?.curricula_tracks || DEFAULT_CURRICULA_TRACKS;

      const newGradeCodesPerCurriculum = new Map<string, Set<string>>();
      for (const track of curriculaTracks) {
        newGradeCodesPerCurriculum.set(track.code, new Set((track.grades || []).map((g: any) => g.code)));
      }

      for (const oldTrack of oldTracks) {
        const newGradesSet = newGradeCodesPerCurriculum.get(oldTrack.code);
        for (const oldGrade of (oldTrack.grades || [])) {
          if (!newGradesSet || !newGradesSet.has(oldGrade.code)) {
            // Safely unpublish units and assessments for deleted grade level
            await Promise.all([
              UnitPackageModel.updateMany(
                { curriculum: oldTrack.code, grade_level: oldGrade.code },
                { $set: { is_published: false } }
              ),
              AssessmentModel.updateMany(
                { curriculum: oldTrack.code, grade_level: oldGrade.code },
                { $set: { is_published: false } }
              )
            ]);
          }
        }
      }
    }

    await this.updateCmsConfig(payload);

    // Invalidate CMS_MAIN_SITE_CONFIG, PUBLIC_CURRICULUM_TREE, and units_catalog:*
    publicCmsCache.delete('MAIN_SITE_CONFIG');
    publicCmsCache.delete('CMS_MAIN_SITE_CONFIG');
    curriculumTreeService.invalidateCache();
    publicCmsCache.deleteByPattern(/^units_catalog:/);
    return {
      activeGrades: grades,
      curriculaTracks: curriculaTracks || CmsService.DEFAULT_TRACKS
    };
  }
}

export const cmsService = new CmsService();
