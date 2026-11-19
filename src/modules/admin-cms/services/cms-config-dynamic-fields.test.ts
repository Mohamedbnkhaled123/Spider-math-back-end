import assert from 'node:assert/strict';
import { cmsService } from './cms.service';
import { CmsConfigModel } from '../../../models/cms-config.model';
import { publicCmsCache } from '../../../config/cache.config';
import { updateCmsDtoSchema } from '../dto/update-cms.dto';

async function runTests(): Promise<void> {
  console.log('Running CMS Dynamic Fields & Social Channels Persistence Tests...');

  const origFindOne = (CmsConfigModel as any).findOne;
  const origFindOneAndUpdate = (CmsConfigModel as any).findOneAndUpdate;

  let storedDoc: Record<string, any> = {};
  let capturedSetPayload: any = null;

  try {
    (CmsConfigModel as any).findOne = () => ({
      lean: async () => storedDoc
    });

    (CmsConfigModel as any).findOneAndUpdate = (_filter: any, update: any) => {
      capturedSetPayload = update?.$set || {};
      for (const [key, val] of Object.entries(capturedSetPayload!)) {
        if (key.startsWith('contact_channels.')) {
          const nestedKey = key.replace('contact_channels.', '');
          storedDoc.contact_channels = {
            ...(storedDoc.contact_channels || {}),
            [nestedKey]: val
          };
        } else {
          storedDoc[key] = val;
        }
      }
      return {
        lean: async () => storedDoc
      };
    };

    // Test 1: DTO validation accepts all new dynamic fields + top-level social channels
    const dtoPayload = {
      aboutHeadlineAr: 'عنوان مخصص\nسطر ثاني ذهبي\nسطر ثالث',
      aboutHeadlineEn: 'Custom\nInteractive\nHeading',
      placementRibbonAr: 'جديد ومجاني',
      placementRibbonEn: 'New & Free',
      placementBadgeAr: 'شارة مخصصة',
      placementBadgeEn: 'Custom Placement Badge',
      placementHeadlineAr: 'اختبر مستواك المخصص الآن',
      placementHeadlineEn: 'Test Custom Level Now',
      placementSubtitleAr: 'وصف مخصص لقسم تحديد المستوى',
      placementSubtitleEn: 'Custom placement subtitle',
      placementFeature1Ar: 'ميزة أولى مخصصة',
      placementFeature2Ar: 'ميزة ثانية مخصصة',
      placementFeature3Ar: 'ميزة ثالثة مخصصة',
      placementCtaAr: 'انطلق للاختبار',
      placementCtaEn: 'Launch Assessment',
      honorCtaTitleAr: 'سجل اسمك في لوحة الشرف',
      honorCtaTitleEn: 'Join Top Performers',
      honorCtaSubtitleAr: 'خض الاختبار الآن لتقييم مستواك.',
      honorCtaSubtitleEn: 'Take placement assessment now.',
      honorCtaButtonAr: 'ابدأ تحديد المستوى',
      honorCtaButtonEn: 'Begin Placement',
      testimonialsBadgeAr: 'تجارب موثقة',
      testimonialsBadgeEn: 'Verified Reviews',
      testimonialsTitleAr: 'كلمات طلابنا',
      testimonialsTitleEn: 'What Students Say',
      testimonialsSubtitleAr: 'آراء حقيقية من الطلاب.',
      testimonialsSubtitleEn: 'Real feedback from learners.',
      supportWhatsapp: '01099887766',
      supportTelegram: 'https://t.me/SpiderMathOfficial',
      facebookUrl: 'https://facebook.com/SpiderMathOfficial',
      youtubeUrl: 'https://youtube.com/@SpiderMathOfficial'
    };

    const parsed = updateCmsDtoSchema.safeParse(dtoPayload);
    assert.equal(parsed.success, true, 'updateCmsDtoSchema should validate all new CMS fields');

    // Test 2: updateCmsConfig maps camelCase fields to snake_case + persists all 4 social channels & invalidates cache
    publicCmsCache.set('MAIN_SITE_CONFIG', { stale: true });
    publicCmsCache.set('CMS_MAIN_SITE_CONFIG', { stale: true });

    await cmsService.updateCmsConfig(dtoPayload as any);

    assert.ok(capturedSetPayload, 'Expected updatePayload to be passed to findOneAndUpdate');
    assert.equal(capturedSetPayload!.about_headline_ar, dtoPayload.aboutHeadlineAr);
    assert.equal(capturedSetPayload!.about_headline_en, dtoPayload.aboutHeadlineEn);
    assert.equal(capturedSetPayload!.placement_ribbon_ar, dtoPayload.placementRibbonAr);
    assert.equal(capturedSetPayload!.placement_ribbon_en, dtoPayload.placementRibbonEn);
    assert.equal(capturedSetPayload!.placement_headline_ar, dtoPayload.placementHeadlineAr);
    assert.equal(capturedSetPayload!.placement_cta_ar, dtoPayload.placementCtaAr);
    assert.equal(capturedSetPayload!.honor_cta_title_ar, dtoPayload.honorCtaTitleAr);
    assert.equal(capturedSetPayload!.honor_cta_subtitle_en, dtoPayload.honorCtaSubtitleEn);
    assert.equal(capturedSetPayload!.honor_cta_button_ar, dtoPayload.honorCtaButtonAr);
    assert.equal(capturedSetPayload!.testimonials_badge_ar, dtoPayload.testimonialsBadgeAr);
    assert.equal(capturedSetPayload!.testimonials_title_en, dtoPayload.testimonialsTitleEn);
    assert.equal(capturedSetPayload!.testimonials_subtitle_ar, dtoPayload.testimonialsSubtitleAr);

    assert.equal(capturedSetPayload!['contact_channels.support_whatsapp'], '01099887766');
    assert.equal(capturedSetPayload!['contact_channels.subscription_whatsapp'], '01099887766');
    assert.equal(capturedSetPayload!['contact_channels.telegram_url'], 'https://t.me/SpiderMathOfficial');
    assert.equal(capturedSetPayload!['contact_channels.facebook_url'], 'https://facebook.com/SpiderMathOfficial');
    assert.equal(capturedSetPayload!['contact_channels.youtube_channel_url'], 'https://youtube.com/@SpiderMathOfficial');

    assert.equal(publicCmsCache.has('MAIN_SITE_CONFIG'), false, 'MAIN_SITE_CONFIG cache key must be invalidated');
    assert.equal(publicCmsCache.has('CMS_MAIN_SITE_CONFIG'), false, 'CMS_MAIN_SITE_CONFIG cache key must be invalidated');
    console.log('[PASS] Test 1 & 2 Passed: All dynamic CMS fields & social channels persist and invalidate caches.');

    // Test 3: getPublicLandingData returns saved values and preserves explicit empty strings ("") for optional fields
    publicCmsCache.clear();
    storedDoc = {
      hero_badge_ar: '',
      hero_cta_secondary_ar: '',
      placement_ribbon_ar: '',
      placement_badge_ar: '',
      placement_feature_1_ar: '',
      placement_feature_2_ar: 'ميزة متاحة فقط',
      placement_feature_3_ar: '',
      testimonials_badge_ar: '',
      curriculum_badge_ar: '',
      hall_of_fame_badge_ar: '',
      contact_channels: {
        support_whatsapp: '01099887766',
        telegram_url: 'https://t.me/SpiderMathOfficial',
        facebook_url: 'https://facebook.com/SpiderMathOfficial',
        youtube_channel_url: 'https://youtube.com/@SpiderMathOfficial'
      }
    };

    const landing: any = await cmsService.getPublicLandingData();
    assert.equal(landing.heroBadgeAr, '', 'Explicit empty heroBadgeAr must remain empty');
    assert.equal(landing.heroCtaSecondaryAr, '', 'Explicit empty heroCtaSecondaryAr must remain empty');
    assert.equal(landing.placementRibbonAr, '', 'Explicit empty placementRibbonAr must remain empty');
    assert.equal(landing.placementBadgeAr, '', 'Explicit empty placementBadgeAr must remain empty');
    assert.equal(landing.placementFeature1Ar, '', 'Explicit empty placementFeature1Ar must remain empty');
    assert.equal(landing.placementFeature2Ar, 'ميزة متاحة فقط');
    assert.equal(landing.placementFeature3Ar, '', 'Explicit empty placementFeature3Ar must remain empty');
    assert.equal(landing.testimonialsBadgeAr, '', 'Explicit empty testimonialsBadgeAr must remain empty');
    assert.equal(landing.curriculumBadgeAr, '', 'Explicit empty curriculumBadgeAr must remain empty');
    assert.equal(landing.hallOfFameBadgeAr, '', 'Explicit empty hallOfFameBadgeAr must remain empty');

    // When undefined, sensible defaults are returned
    assert.equal(landing.aboutHeadlineAr, 'تعلم تفاعلي\nالمفاهيم أولاً\nبمنهجية هندسية');
    assert.equal(landing.placementRibbonEn, 'Free');
    assert.equal(landing.honorCtaTitleAr, 'انضم لقائمة الشرف');
    assert.equal(landing.honorCtaButtonEn, 'Start Placement');
    assert.equal(landing.testimonialsTitleAr, 'آراء الطلاب وأولياء الأمور');
    assert.equal(landing.supportTelegram, 'https://t.me/SpiderMathOfficial');
    assert.equal(landing.facebookUrl, 'https://facebook.com/SpiderMathOfficial');
    assert.equal(landing.youtubeUrl, 'https://youtube.com/@SpiderMathOfficial');
    console.log('[PASS] Test 3 Passed: Empty optional fields preserved while undefined fields receive defaults.');
  } finally {
    (CmsConfigModel as any).findOne = origFindOne;
    (CmsConfigModel as any).findOneAndUpdate = origFindOneAndUpdate;
    publicCmsCache.clear();
  }
}

runTests().catch((err) => {
  console.error('[FAIL] Test suite failed:', err);
  process.exit(1);
});
