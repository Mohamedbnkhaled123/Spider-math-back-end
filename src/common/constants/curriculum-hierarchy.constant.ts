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
    'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12',
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

export interface ICurriculumTrackDefinition {
  code: CurriculumType;
  nameAr: string;
  nameEn?: string;
  grades: Array<{
    code: string;
    titleAr: string;
    titleEn?: string;
  }>;
}

export const DEFAULT_CURRICULA_TRACKS: ICurriculumTrackDefinition[] = [
  {
    code: 'EGYPTIAN',
    nameAr: 'المنهج المصري',
    nameEn: 'Egyptian Curriculum',
    grades: [
      { code: 'SEC_3', titleAr: 'الصف الثالث الثانوي (Thanaweya)', titleEn: 'Secondary 3' },
      { code: 'SEC_2', titleAr: 'الصف الثاني الثانوي', titleEn: 'Secondary 2' },
      { code: 'SEC_1', titleAr: 'الصف الأول الثانوي', titleEn: 'Secondary 1' },
      { code: 'PREP_3', titleAr: 'الصف الثالث الإعدادي', titleEn: 'Prep 3' },
      { code: 'PREP_2', titleAr: 'الصف الثاني الإعدادي', titleEn: 'Prep 2' },
      { code: 'PREP_1', titleAr: 'الصف الأول الإعدادي', titleEn: 'Prep 1' },
      { code: 'PRI_6', titleAr: 'الصف السادس الابتدائي', titleEn: 'Primary 6' },
      { code: 'PRI_5', titleAr: 'الصف الخامس الابتدائي', titleEn: 'Primary 5' },
      { code: 'PRI_4', titleAr: 'الصف الرابع الابتدائي', titleEn: 'Primary 4' },
      { code: 'PRI_3', titleAr: 'الصف الثالث الابتدائي', titleEn: 'Primary 3' },
      { code: 'PRI_2', titleAr: 'الصف الثاني الابتدائي', titleEn: 'Primary 2' },
      { code: 'PRI_1', titleAr: 'الصف الأول الابتدائي', titleEn: 'Primary 1' }
    ]
  },
  {
    code: 'GULF',
    nameAr: 'المنهج الخليجي',
    nameEn: 'Gulf Curriculum',
    grades: [
      { code: 'GRADE_12', titleAr: 'الصف الثاني عشر (توجيهي)', titleEn: 'Grade 12' },
      { code: 'GRADE_11', titleAr: 'الصف الحادي عشر', titleEn: 'Grade 11' },
      { code: 'GRADE_10', titleAr: 'الصف العاشر', titleEn: 'Grade 10' },
      { code: 'GRADE_9', titleAr: 'الصف التاسع (ثالث متوسط)', titleEn: 'Grade 9' },
      { code: 'GRADE_8', titleAr: 'الصف الثامن (ثاني متوسط)', titleEn: 'Grade 8' },
      { code: 'GRADE_7', titleAr: 'الصف السابع (أول متوسط)', titleEn: 'Grade 7' },
      { code: 'GRADE_6', titleAr: 'الصف السادس الابتدائي', titleEn: 'Grade 6' },
      { code: 'GRADE_5', titleAr: 'الصف الخامس الابتدائي', titleEn: 'Grade 5' },
      { code: 'GRADE_4', titleAr: 'الصف الرابع الابتدائي', titleEn: 'Grade 4' },
      { code: 'GRADE_3', titleAr: 'الصف الثالث الابتدائي', titleEn: 'Grade 3' },
      { code: 'GRADE_2', titleAr: 'الصف الثاني الابتدائي', titleEn: 'Grade 2' },
      { code: 'GRADE_1', titleAr: 'الصف الأول الابتدائي', titleEn: 'Grade 1' }
    ]
  },
  {
    code: 'INTERNATIONAL',
    nameAr: 'IGCSE / البريطانية',
    nameEn: 'British Curriculum (IGCSE)',
    grades: [
      { code: 'IGCSE_AL', titleAr: 'A-Level Mathematics (9709)', titleEn: 'Cambridge / Edexcel A-Level' },
      { code: 'IGCSE_AS', titleAr: 'AS-Level Pure & Mechanics', titleEn: 'AS-Level Math' },
      { code: 'IGCSE_OL', titleAr: 'O-Level Extended Math (0580)', titleEn: 'IGCSE O-Level' },
      { code: 'IGCSE_YEAR_9', titleAr: 'السنة التاسعة (Year 9 / Checkpoint)', titleEn: 'Year 9' },
      { code: 'IGCSE_YEAR_8', titleAr: 'السنة الثامنة (Year 8)', titleEn: 'Year 8' },
      { code: 'IGCSE_YEAR_7', titleAr: 'السنة السابعة (Year 7)', titleEn: 'Year 7' },
      { code: 'IGCSE_YEAR_6', titleAr: 'السنة السادسة (Year 6)', titleEn: 'Year 6' },
      { code: 'IGCSE_YEAR_5', titleAr: 'السنة الخامسة (Year 5)', titleEn: 'Year 5' },
      { code: 'IGCSE_YEAR_4', titleAr: 'السنة الرابعة (Year 4)', titleEn: 'Year 4' },
      { code: 'IGCSE_YEAR_3', titleAr: 'السنة الثالثة (Year 3)', titleEn: 'Year 3' },
      { code: 'IGCSE_YEAR_2', titleAr: 'السنة الثانية (Year 2)', titleEn: 'Year 2' },
      { code: 'IGCSE_YEAR_1', titleAr: 'السنة الأولى (Year 1)', titleEn: 'Year 1' }
    ]
  },
  {
    code: 'AMERICAN',
    nameAr: 'SAT / الأمريكية',
    nameEn: 'American Diploma (SAT)',
    grades: [
      { code: 'SAT_MATH', titleAr: 'Digital SAT Math (Hard Modules)', titleEn: 'SAT Digital Math' },
      { code: 'ACT_MATH', titleAr: 'ACT Math Mastery', titleEn: 'ACT Mathematics' },
      { code: 'EST_MATH', titleAr: 'EST I & EST II Math', titleEn: 'EST Math' },
      { code: 'GRADE_12', titleAr: 'الصف الثاني عشر الأمريكي (Grade 12)', titleEn: 'Grade 12' },
      { code: 'GRADE_11', titleAr: 'الصف الحادي عشر الأمريكي (Grade 11)', titleEn: 'Grade 11' },
      { code: 'GRADE_10', titleAr: 'الصف العاشر الأمريكي (Grade 10)', titleEn: 'Grade 10' },
      { code: 'GRADE_9', titleAr: 'الصف التاسع الأمريكي (Grade 9)', titleEn: 'Grade 9' },
      { code: 'US_GRADE_8', titleAr: 'الصف الثامن الأمريكي (Grade 8)', titleEn: 'Grade 8' },
      { code: 'US_GRADE_7', titleAr: 'الصف السابع الأمريكي (Grade 7)', titleEn: 'Grade 7' },
      { code: 'US_GRADE_6', titleAr: 'الصف السادس الأمريكي (Grade 6)', titleEn: 'Grade 6' },
      { code: 'US_GRADE_5', titleAr: 'الصف الخامس الأمريكي (Grade 5)', titleEn: 'Grade 5' },
      { code: 'US_GRADE_4', titleAr: 'الصف الرابع الأمريكي (Grade 4)', titleEn: 'Grade 4' },
      { code: 'US_GRADE_3', titleAr: 'الصف الثالث الأمريكي (Grade 3)', titleEn: 'Grade 3' },
      { code: 'US_GRADE_2', titleAr: 'الصف الثاني الأمريكي (Grade 2)', titleEn: 'Grade 2' },
      { code: 'US_GRADE_1', titleAr: 'الصف الأول الأمريكي (Grade 1)', titleEn: 'Grade 1' }
    ]
  }
];

/**
 * Validates that a given gradeLevel belongs to the selected curriculum track.
 */
export function isValidGradeForCurriculum(curriculum?: CurriculumType | null, gradeLevel?: string | null): boolean {
  if (!curriculum || !gradeLevel) return false;
  const validGrades = GRADE_LEVELS_BY_CURRICULUM[curriculum];
  return Array.isArray(validGrades) && validGrades.includes(gradeLevel);
}
