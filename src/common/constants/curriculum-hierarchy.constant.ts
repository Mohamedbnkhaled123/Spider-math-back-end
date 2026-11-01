/**
 * Spider Math Educational Platform — Canonical 5-Level Academic Hierarchy Taxonomy
 * Version: v2.2
 *
 * 1. Curriculum Track (CURRICULUMS)
 *    └── 2. Grade Level (GRADE_LEVELS_BY_CURRICULUM)
 *        └── 3. Academic Term (ACADEMIC_TERMS)
 *            └── 4. Unit Package (UnitPackageModel)
 *                └── 5. Lectures & Assessments (LectureMaterialModel & AssessmentModel)
 */

export const CURRICULUMS = [
  'EGYPTIAN',
  'GULF',
  'INTERNATIONAL',
  'AMERICAN'
] as const;

export type CurriculumType = (typeof CURRICULUMS)[number];

export const ACADEMIC_TERMS = ['TERM_1', 'TERM_2'] as const;
export type AcademicTermType = (typeof ACADEMIC_TERMS)[number];

export const GRADE_LEVELS_BY_CURRICULUM: Record<CurriculumType, readonly string[]> = {
  // 1. المنهج المصري (من 1 ابتدائي إلى 3 ثانوي)
  EGYPTIAN: [
    'PRI_1', 'PRI_2', 'PRI_3', 'PRI_4', 'PRI_5', 'PRI_6',
    'PREP_1', 'PREP_2', 'PREP_3',
    'SEC_1', 'SEC_2', 'SEC_3'
  ],

  // 2. المنهج الخليجي (من الصف الأول الابتدائي إلى الثاني عشر)
  GULF: [
    'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6',
    'GRADE_7', 'GRADE_8', 'GRADE_9',
    'GRADE_10', 'GRADE_11', 'GRADE_12'
  ],

  // 3. المناهج الدولية (IGCSE / British — من Year 1 إلى A-Level)
  INTERNATIONAL: [
    'IGCSE_YEAR_1', 'IGCSE_YEAR_2', 'IGCSE_YEAR_3', 'IGCSE_YEAR_4', 'IGCSE_YEAR_5', 'IGCSE_YEAR_6',
    'IGCSE_YEAR_7', 'IGCSE_YEAR_8', 'IGCSE_YEAR_9',
    'IGCSE_OL', 'IGCSE_AS', 'IGCSE_AL'
  ],

  // 4. الدبلومة الأمريكية (SAT • EST • ACT — من Grade 1 إلى اختبارات القبول)
  AMERICAN: [
    'US_GRADE_1', 'US_GRADE_2', 'US_GRADE_3', 'US_GRADE_4', 'US_GRADE_5', 'US_GRADE_6', 'US_GRADE_7', 'US_GRADE_8',
    'GRADE_9', 'GRADE_10',
    'SAT_1', 'SAT_2', 'SAT_MATH',
    'EST_1', 'EST_2', 'EST_MATH',
    'ACT_1', 'ACT_2', 'ACT_MATH'
  ]
} as const;

export const ALL_GRADE_LEVELS = [
  // Egyptian
  'PRI_1', 'PRI_2', 'PRI_3', 'PRI_4', 'PRI_5', 'PRI_6',
  'PREP_1', 'PREP_2', 'PREP_3',
  'SEC_1', 'SEC_2', 'SEC_3',

  // Gulf
  'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6',
  'GRADE_7', 'GRADE_8', 'GRADE_9',
  'GRADE_10', 'GRADE_11', 'GRADE_12',

  // International
  'IGCSE_YEAR_1', 'IGCSE_YEAR_2', 'IGCSE_YEAR_3', 'IGCSE_YEAR_4', 'IGCSE_YEAR_5', 'IGCSE_YEAR_6',
  'IGCSE_YEAR_7', 'IGCSE_YEAR_8', 'IGCSE_YEAR_9',
  'IGCSE_OL', 'IGCSE_AS', 'IGCSE_AL',

  // American
  'US_GRADE_1', 'US_GRADE_2', 'US_GRADE_3', 'US_GRADE_4', 'US_GRADE_5', 'US_GRADE_6', 'US_GRADE_7', 'US_GRADE_8',
  'SAT_1', 'SAT_2', 'SAT_MATH',
  'EST_1', 'EST_2', 'EST_MATH',
  'ACT_1', 'ACT_2', 'ACT_MATH'
] as const;

export type GradeLevelType = (typeof ALL_GRADE_LEVELS)[number];

/**
 * Validates that a given gradeLevel belongs to the selected curriculum track.
 */
export function isValidGradeForCurriculum(curriculum?: CurriculumType | null, gradeLevel?: string | null): boolean {
  if (!curriculum || !gradeLevel) return false;
  const validGrades = GRADE_LEVELS_BY_CURRICULUM[curriculum];
  return Array.isArray(validGrades) && validGrades.includes(gradeLevel);
}
