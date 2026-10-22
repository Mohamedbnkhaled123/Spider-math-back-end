import { env } from '../../../config/env.config';
import { UnitPackageModel } from '../../../models/unit-package.model';

export class SitemapService {
  /**
   * Generates a standard XML sitemap.
   * Programmatically indexes static public routes and all published UnitPackage slugs.
   * Adheres to RULES.md Section 5.6 (100% code-driven SSR SEO).
   */
  public async generateSitemapXml(): Promise<string> {
    const baseUrl = env.CLIENT_ORIGIN.replace(/\/$/, '');
    const today = new Date().toISOString().split('T')[0];

    // 1. Canonical Static Public Routes
    const staticUrls = [
      { loc: `${baseUrl}/`, priority: '1.0', changefreq: 'daily', lastmod: today },
      { loc: `${baseUrl}/curriculum`, priority: '0.9', changefreq: 'weekly', lastmod: today },
      { loc: `${baseUrl}/curriculum/egyptian`, priority: '0.9', changefreq: 'weekly', lastmod: today },
      { loc: `${baseUrl}/curriculum/gulf`, priority: '0.9', changefreq: 'weekly', lastmod: today },
      { loc: `${baseUrl}/curriculum/international`, priority: '0.9', changefreq: 'weekly', lastmod: today },
      { loc: `${baseUrl}/curriculum/american`, priority: '0.9', changefreq: 'weekly', lastmod: today },
      { loc: `${baseUrl}/placement-test`, priority: '0.8', changefreq: 'weekly', lastmod: today },
      { loc: `${baseUrl}/login`, priority: '0.5', changefreq: 'monthly', lastmod: today }
    ];

    // 2. Fetch all published educational units across the 4 curriculums
    const publishedUnits = await UnitPackageModel.find({ is_published: true })
      .select('slug updatedAt')
      .lean();

    const dynamicUrls = publishedUnits.map((unit) => {
      const lastmod = unit.updatedAt
        ? new Date(unit.updatedAt).toISOString().split('T')[0]
        : today;

      return {
        loc: `${baseUrl}/units/${unit.slug}`,
        priority: '0.8',
        changefreq: 'weekly',
        lastmod
      };
    });

    const allUrls = [...staticUrls, ...dynamicUrls];

    // 3. Construct Standard XML payload
    const xmlEntries = allUrls
      .map(
        (item) => `  <url>
    <loc>${item.loc}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
  }
}

export const sitemapService = new SitemapService();
