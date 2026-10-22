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
  // 1. المنهج المصري (من الأساسيات للتميّز)
  EGYPTIAN: ['PREP_1', 'PREP_2', 'PREP_3', 'SEC_1', 'SEC_2', 'SEC_3'],

  // 2. المنهج الخليجي (شرح واضح وتدريب مستمر)
  GULF: ['GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12'],

  // 3. المناهج الدولية (IGCSE / British — رياضيات بمعايير عالمية)
  INTERNATIONAL: ['IGCSE_YEAR_7', 'IGCSE_YEAR_8', 'IGCSE_YEAR_9', 'IGCSE_OL', 'IGCSE_AS', 'IGCSE_AL'],

  // 4. الدبلومة الأمريكية (SAT • EST • ACT)
  AMERICAN: ['GRADE_9', 'GRADE_10', 'SAT_1', 'SAT_2', 'EST_1', 'EST_2', 'ACT_1', 'ACT_2']
} as const;

export const ALL_GRADE_LEVELS = [
  'PREP_1', 'PREP_2', 'PREP_3', 'SEC_1', 'SEC_2', 'SEC_3',
  'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12',
  'IGCSE_YEAR_7', 'IGCSE_YEAR_8', 'IGCSE_YEAR_9', 'IGCSE_OL', 'IGCSE_AS', 'IGCSE_AL',
  'SAT_1', 'SAT_2', 'EST_1', 'EST_2', 'ACT_1', 'ACT_2'
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
