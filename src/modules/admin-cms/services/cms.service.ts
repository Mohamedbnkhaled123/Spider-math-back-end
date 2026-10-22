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
        testimonials_items: [],
        contact_channels: {
          subscription_whatsapp: '+201000000001',
          support_whatsapp: '+201000000002',
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

    // Populate RAM cache
    publicCmsCache.set(CMS_CACHE_KEY, config as any, CMS_CACHE_TTL_MS);

    return config as unknown as ICmsConfig;
  }

  /**
   * Updates Landing Page CMS configuration by Super Admin.
   * Atomically invalidates publicCmsCache entry so updates reflect instantly.
   */
  public async updateCmsConfig(dto: UpdateCmsDto): Promise<ICmsConfig> {
    const updatePayload: Record<string, unknown> = {};

    if (dto.teacher_profile) {
      updatePayload.teacher_profile = dto.teacher_profile;
    }
    if (dto.schedules_table) {
      updatePayload.schedules_table = dto.schedules_table;
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
}

export const cmsService = new CmsService();
