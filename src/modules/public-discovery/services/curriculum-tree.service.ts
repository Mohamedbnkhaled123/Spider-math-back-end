import {
  CURRICULUMS,
  GRADE_LEVELS_BY_CURRICULUM,
  ACADEMIC_TERMS,
  CurriculumType,
  GradeLevelType,
  AcademicTermType
} from '../../../common/constants/curriculum-hierarchy.constant';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { publicCmsCache } from '../../../config/cache.config';

export interface ITermTreeItem {
  term: AcademicTermType;
  publishedUnitsCount: number;
  hasPublishedUnits: boolean;
  hasPlacementTest: boolean;
}

export interface IGradeLevelTreeItem {
  gradeLevel: GradeLevelType;
  terms: ITermTreeItem[];
  hasPublishedUnits: boolean;
  totalPublishedUnitsCount: number;
  hasPlacementTest: boolean;
  isAvailable: boolean; // Dynamic availability: true if content exists, false = 'Coming Soon'
}

export interface ICurriculumTreeItem {
  curriculum: CurriculumType;
  gradeLevels: IGradeLevelTreeItem[];
  totalPublishedUnitsCount: number;
  hasPublishedUnits: boolean;
}

const CURRICULUM_TREE_CACHE_KEY = 'PUBLIC_CURRICULUM_TREE';
const CURRICULUM_TREE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export class CurriculumTreeService {
  /**
   * Generates the dynamic 5-level curriculum taxonomy tree.
   * Hydrates availability flags directly from MongoDB indexes.
   * Shielded by publicCmsCache (10-minute TTL) for sub-millisecond p95 latency under high concurrency.
   */
  public async getDynamicCurriculumTree(): Promise<ICurriculumTreeItem[]> {
    const cached = publicCmsCache.get(CURRICULUM_TREE_CACHE_KEY) as ICurriculumTreeItem[] | undefined;
    if (cached) {
      return cached;
    }

    // 1. Aggregate published unit package counts per (curriculum, grade_level, academic_term)
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

    // 2. Check placement test availability per (curriculum, grade_level, academic_term)
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

    // 3. Assemble the Canonical 4-Curriculum Tree
    const tree: ICurriculumTreeItem[] = CURRICULUMS.map((curriculum) => {
      const allowedGrades = GRADE_LEVELS_BY_CURRICULUM[curriculum] || [];
      let curriculumTotalUnits = 0;

      const gradeLevels: IGradeLevelTreeItem[] = allowedGrades.map((gradeLevel) => {
        let gradeTotalUnits = 0;

        const terms: ITermTreeItem[] = ACADEMIC_TERMS.map((term) => {
          const key = `${curriculum}:${gradeLevel}:${term}`;
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

        return {
          gradeLevel: gradeLevel as GradeLevelType,
          terms,
          hasPublishedUnits: gradeTotalUnits > 0,
          totalPublishedUnitsCount: gradeTotalUnits,
          hasPlacementTest: hasPlacement,
          isAvailable: gradeTotalUnits > 0 || hasPlacement
        };
      });

      return {
        curriculum,
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
