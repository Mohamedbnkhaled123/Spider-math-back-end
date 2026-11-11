import {
  CURRICULUMS,
  GRADE_LEVELS_BY_CURRICULUM,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType,
  DEFAULT_CURRICULA_TRACKS
} from '../../../common/constants/curriculum-hierarchy.constant';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { CmsConfigModel } from '../../../models/cms-config.model';
import { publicCmsCache } from '../../../config/cache.config';

export interface ITermTreeItem {
  term: AcademicTermType;
  publishedUnitsCount: number;
  hasPublishedUnits: boolean;
  hasPlacementTest: boolean;
}

export interface IGradeLevelTreeItem {
  gradeLevel: GradeLevelType | string;
  titleAr?: string;
  titleEn?: string;
  terms: ITermTreeItem[];
  hasPublishedUnits: boolean;
  totalPublishedUnitsCount: number;
  hasPlacementTest: boolean;
  isAvailable: boolean; // Dynamic availability: true if content exists and grade is active
  isActive: boolean;
}

export interface ICurriculumTreeItem {
  curriculum: CurriculumType;
  nameAr?: string;
  gradeLevels: IGradeLevelTreeItem[];
  totalPublishedUnitsCount: number;
  hasPublishedUnits: boolean;
}

const CURRICULUM_TREE_CACHE_KEY = 'PUBLIC_CURRICULUM_TREE';
const CURRICULUM_TREE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export class CurriculumTreeService {
  /**
   * Generates the dynamic 5-level curriculum taxonomy tree.
   * Hydrates availability flags directly from MongoDB indexes and CmsConfig active grades / curricula tracks.
   * Shielded by publicCmsCache for sub-millisecond p95 latency under high concurrency.
   */
  public async getDynamicCurriculumTree(): Promise<ICurriculumTreeItem[]> {
    const cached = publicCmsCache.get(CURRICULUM_TREE_CACHE_KEY) as ICurriculumTreeItem[] | undefined;
    if (cached) {
      return cached;
    }

    // 1. Fetch CMS configuration for active_grades and curricula_tracks
    const cmsConfig: any = await CmsConfigModel.findOne({ singleton_key: 'MAIN_SITE_CONFIG' }).lean();
    const activeGradesSet = new Set<string>(cmsConfig?.active_grades || ['SEC_3']);
    const configuredTracks =
      (cmsConfig?.curricula_tracks && Array.isArray(cmsConfig.curricula_tracks) && cmsConfig.curricula_tracks.length > 0)
        ? cmsConfig.curricula_tracks
        : DEFAULT_CURRICULA_TRACKS;

    // 2. Aggregate published unit package counts per (curriculum, grade_level, academic_term)
    const unitStats = await UnitPackageModel.aggregate([
      { $match: { is_published: true } },
      {
        $group: {
          _id: {
            curriculum: '$curriculum',
            grade_level: '$grade_level',
            academic_term: '$academic_term'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const unitCountsMap = new Map<string, number>();
    for (const stat of unitStats) {
      if (stat._id) {
        const key = `${stat._id.curriculum}:${stat._id.grade_level}:${stat._id.academic_term}`;
        unitCountsMap.set(key, stat.count);
      }
    }

    // 3. Check placement test availability per (curriculum, grade_level, academic_term)
    const placementStats = await AssessmentModel.aggregate([
      { $match: { is_published: true } },
      {
        $group: {
          _id: {
            curriculum: '$curriculum',
            grade_level: '$grade_level',
            academic_term: '$academic_term'
          },
          hasPlacementTest: {
            $max: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$is_placement_test', true] },
                    { $eq: ['$assessment_type', 'QUIZ'] }
                  ]
                },
                true,
                false
              ]
            }
          }
        }
      }
    ]);

    const placementMap = new Map<string, boolean>();
    for (const stat of placementStats) {
      if (stat._id) {
        const key = `${stat._id.curriculum}:${stat._id.grade_level}:${stat._id.academic_term}`;
        placementMap.set(key, !!stat.hasPlacementTest);
      }
    }

    // 4. Assemble the Dynamic Curricula Tree from Configured Tracks & Active Grades
    const tree: ICurriculumTreeItem[] = CURRICULUMS.map((curriculum) => {
      const track = configuredTracks.find((t: any) => t.code === curriculum);
      const configuredGrades = track?.grades || (GRADE_LEVELS_BY_CURRICULUM[curriculum] || []).map((code: string) => ({
        code,
        titleAr: code,
        titleEn: code
      }));
      let curriculumTotalUnits = 0;

      const gradeLevels: IGradeLevelTreeItem[] = configuredGrades.map((grade: any) => {
        const gradeCode = grade.code;
        const isActive = activeGradesSet.has(gradeCode);
        let gradeTotalUnits = 0;

        const terms: ITermTreeItem[] = ACADEMIC_TERMS.map((term) => {
          const key = `${curriculum}:${gradeCode}:${term}`;
          const unitsCount = unitCountsMap.get(key) || 0;
          gradeTotalUnits += unitsCount;

          return {
            term,
            publishedUnitsCount: unitsCount,
            hasPublishedUnits: unitsCount > 0,
            hasPlacementTest: placementMap.get(key) ?? false
          };
        });

        curriculumTotalUnits += gradeTotalUnits;

        const hasPlacement = terms.some((t) => t.hasPlacementTest);
        const isAvailable = isActive && (gradeTotalUnits > 0 || hasPlacement);

        return {
          gradeLevel: gradeCode as GradeLevelType,
          titleAr: grade.titleAr,
          titleEn: grade.titleEn,
          isActive,
          terms,
          hasPublishedUnits: gradeTotalUnits > 0,
          totalPublishedUnitsCount: gradeTotalUnits,
          hasPlacementTest: hasPlacement,
          isAvailable
        };
      });

      return {
        curriculum,
        nameAr: track?.nameAr,
        gradeLevels,
        totalPublishedUnitsCount: curriculumTotalUnits,
        hasPublishedUnits: curriculumTotalUnits > 0
      };
    });

    // Populate cache
    publicCmsCache.set(CURRICULUM_TREE_CACHE_KEY, tree as any, CURRICULUM_TREE_CACHE_TTL_MS);

    return tree;
  }

  /**
   * Invalidates cached curriculum tree upon admin unit/assessment mutations.
   */
  public invalidateCache(): void {
    publicCmsCache.delete(CURRICULUM_TREE_CACHE_KEY);
  }
}

export const curriculumTreeService = new CurriculumTreeService();
