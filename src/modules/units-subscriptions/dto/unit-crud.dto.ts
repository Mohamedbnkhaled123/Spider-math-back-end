import { z } from 'zod';
import {
  CURRICULUMS,
  ALL_GRADE_LEVELS,
  ACADEMIC_TERMS,
  isValidGradeForCurriculum,
  CurriculumType
} from '../../../common/constants/curriculum-hierarchy.constant';
import { PACKAGE_TYPES } from '../../../models/unit-package.model';

const unitPackageBaseObject = z.object({
  curriculum: z.enum(CURRICULUMS, { required_error: 'curriculum track is required' }),
  grade_level: z.enum(ALL_GRADE_LEVELS, { required_error: 'grade_level is required' }),
  academic_term: z.enum(ACADEMIC_TERMS).default('TERM_1'),
  title_ar: z.string().min(2, 'title_ar must be at least 2 characters').max(150),
  title_en: z.string().max(150).optional(),
  slug: z
    .string()
    .max(100)
    .optional(),
  description_ar: z.string().max(1000).optional(),
  description_en: z.string().max(1000).optional(),
  package_type: z.enum(PACKAGE_TYPES).default('STUDY_UNIT'),
  subject_branch: z.string().min(2).default('Mathematics'),
  price_egp: z.number().min(0).default(0),
  original_price_egp: z.number().min(0).nullable().optional(),
  originalPriceEgp: z.number().min(0).nullable().optional(),
  discount_percentage: z.number().min(0).max(100).nullable().optional(),
  discountPercentage: z.number().min(0).max(100).nullable().optional(),
  is_discounted: z.boolean().optional(),
  isDiscounted: z.boolean().optional(),
  validity_days: z.number().int().min(1).default(90),
  order_index: z.number().int().min(1).default(1),
  is_published: z.boolean().default(true),
  thumbnail_url: z.string().url().nullable().optional()
});

export const createUnitPackageDtoSchema = unitPackageBaseObject
  .superRefine((data, ctx) => {
    if (!isValidGradeForCurriculum(data.curriculum as CurriculumType, data.grade_level)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grade_level'],
        message: `grade_level '${data.grade_level}' does not belong to curriculum '${data.curriculum}'`
      });
    }
  })
  .transform((data) => {
    const isDefaultUnitPkg = data.title_en && data.title_en.trim().toLowerCase() === 'unit package';
    const titleEn = (data.title_en && data.title_en.trim().length >= 2 && !isDefaultUnitPkg)
      ? data.title_en.trim()
      : (data.title_ar ? data.title_ar.trim() : 'Unit');

    let slug = (data.slug && data.slug.trim())
      ? data.slug.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-')
      : '';

    if (!slug || slug.length < 2) {
      const baseSlug = titleEn
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'unit';
      slug = `${baseSlug}-${Date.now().toString(36)}`;
    }

    const origPrice = data.original_price_egp !== undefined ? data.original_price_egp : (data.originalPriceEgp !== undefined ? data.originalPriceEgp : null);
    const discPct = data.discount_percentage !== undefined ? data.discount_percentage : (data.discountPercentage !== undefined ? data.discountPercentage : null);
    const isDisc = data.is_discounted !== undefined ? data.is_discounted : (data.isDiscounted !== undefined ? data.isDiscounted : ((origPrice !== null && origPrice > data.price_egp) || (discPct !== null && discPct > 0)));

    return {
      ...data,
      title_en: titleEn,
      slug,
      original_price_egp: origPrice,
      discount_percentage: discPct,
      is_discounted: isDisc
    };
  });

export type CreateUnitPackageDto = z.infer<typeof createUnitPackageDtoSchema>;

export const updateUnitPackageDtoSchema = unitPackageBaseObject.partial().superRefine((data, ctx) => {
  if (data.curriculum && data.grade_level) {
    if (!isValidGradeForCurriculum(data.curriculum as CurriculumType, data.grade_level)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['grade_level'],
        message: `grade_level '${data.grade_level}' does not belong to curriculum '${data.curriculum}'`
      });
    }
  }
}).transform((data) => {
  const result: any = { ...data };
  if (data.originalPriceEgp !== undefined && data.original_price_egp === undefined) {
    result.original_price_egp = data.originalPriceEgp;
  }
  if (data.discountPercentage !== undefined && data.discount_percentage === undefined) {
    result.discount_percentage = data.discountPercentage;
  }
  if (data.isDiscounted !== undefined && data.is_discounted === undefined) {
    result.is_discounted = data.isDiscounted;
  }
  return result;
});

export type UpdateUnitPackageDto = z.infer<typeof updateUnitPackageDtoSchema>;
