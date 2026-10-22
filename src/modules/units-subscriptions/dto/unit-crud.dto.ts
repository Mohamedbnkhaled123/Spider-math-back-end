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
  title_ar: z.string().min(2).max(150),
  title_en: z.string().min(2).max(150),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must contain lowercase alphanumeric characters and hyphens only'),
  description_ar: z.string().max(1000).optional(),
  description_en: z.string().max(1000).optional(),
  package_type: z.enum(PACKAGE_TYPES).default('STUDY_UNIT'),
  subject_branch: z.string().min(2).default('Mathematics'),
  price_egp: z.number().min(0).default(0),
  validity_days: z.number().int().min(1).default(90),
  order_index: z.number().int().min(1).default(1),
  is_published: z.boolean().default(true),
  thumbnail_url: z.string().url().nullable().optional()
});

export const createUnitPackageDtoSchema = unitPackageBaseObject.superRefine((data, ctx) => {
  if (!isValidGradeForCurriculum(data.curriculum as CurriculumType, data.grade_level)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['grade_level'],
      message: `grade_level '${data.grade_level}' does not belong to curriculum '${data.curriculum}'`
    });
  }
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
});

export type UpdateUnitPackageDto = z.infer<typeof updateUnitPackageDtoSchema>;
