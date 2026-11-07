import { Types } from 'mongoose';
import { PlacementAttemptModel } from '../../../models/placement-attempt.model';
import { LeadModel } from '../../../models/lead.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { AssessmentModel } from '../../../models/assessment.model';
import { Request, Response, NextFunction } from 'express';
import { curriculumTreeService } from '../services/curriculum-tree.service';
import { cmsService } from '../../admin-cms/services/cms.service';
import { placementService } from '../../leads-placement/services/placement.service';
import { sitemapService } from '../services/sitemap.service';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { PlacementQueryDto } from '../../leads-placement/dto/placement-query.dto';

export class PublicController {
  /**
   * GET /api/v1/public/curriculum-tree
   * Returns complete 4-curriculum tree with dynamic availability flags computed from MongoDB.
   */
  public async getCurriculumTree(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tree = await curriculumTreeService.getDynamicCurriculumTree();
      res.status(200).json(createSuccessResponse(tree));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/landing-data
   * Serves public landing page CMS payload from LRUCache (10-minute TTL).
   */
  public async getLandingData(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const landingData = await cmsService.getPublicLandingData();
      res.status(200).json(createSuccessResponse(landingData));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/placement-test?curriculum=EGYPTIAN&gradeLevel=SEC_3&term=TERM_1
   * Fetches sanitized placement test questions with hidden answer keys.
   */
  public async getPlacementTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as PlacementQueryDto;
      const testData = await placementService.getSanitizedPlacementQuestions(query);
      res.status(200).json(createSuccessResponse(testData));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/placement-test/submit-anonymous
   * Evaluates answers and saves unclaimed attempt with 48h TTL. Returns attemptId.
   */
  public async submitPlacementTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await placementService.submitAnonymousPlacement(req.body);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/placement-test/:attemptId/unlock
   * Lead Gate: Unlocks placement report, creates Lead, and generates WhatsApp pre-filled link.
   */
  public async unlockPlacementTest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const attemptId = req.params.attemptId!;
      const report = await placementService.unlockPlacementAttempt(attemptId, req.body);
      res.status(200).json(createSuccessResponse(report));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /sitemap.xml
   * Serves standard XML sitemap for SEO crawlers.
   */
  public async getSitemapXml(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const xml = await sitemapService.generateSitemapXml();
      res.header('Content-Type', 'application/xml');
      res.status(200).send(xml);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/placement-test/my-attempt
   * Retrieves latest diagnostic placement attempt for authenticated student
   */
  public async getMyPlacementAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.user?.sub;
      const studentCode = req.user?.studentCode;

      let attempt = null;
      if (studentId && Types.ObjectId.isValid(studentId)) {
        attempt = await PlacementAttemptModel.findOne({
          $or: [
            { linked_user_id: new Types.ObjectId(studentId) },
            { claimed_by_student_id: new Types.ObjectId(studentId) }
          ]
        }).sort({ createdAt: -1 }).lean();

        if (!attempt) {
          const lead = await LeadModel.findOne({ user_id: new Types.ObjectId(studentId) }).lean();
          if (lead?.placement_test_attempt_id) {
            attempt = await PlacementAttemptModel.findById(lead.placement_test_attempt_id).lean();
          }
        }
      }

      if (!attempt && studentCode) {
        attempt = await PlacementAttemptModel.findOne({ student_code: studentCode }).sort({ createdAt: -1 }).lean();
      }

      if (!attempt) {
        res.status(200).json(createSuccessResponse(null));
        return;
      }

      res.status(200).json(createSuccessResponse({
        attemptId: attempt._id,
        scorePercentage: attempt.score_percentage,
        academicLevelBadge: attempt.academic_level_badge,
        strengthsWeaknesses: attempt.strengths_weaknesses,
        curriculum: attempt.curriculum,
        gradeLevel: attempt.grade_level,
        academicTerm: attempt.academic_term,
        totalQuestions: attempt.total_questions,
        correctCount: attempt.correct_count,
        createdAt: attempt.createdAt
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/public/grade-quizzes?curriculum=EGYPTIAN&gradeLevel=SEC_1&term=TERM_1
   * Returns published curriculum quizzes grouped by units for students & visitors.
   */
  public async getGradeQuizzes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const curriculum = req.query.curriculum as string;
      const gradeLevel = (req.query.gradeLevel || req.query.grade_level) as string;
      const term = (req.query.term || req.query.academic_term) as string;

      if (!curriculum || !gradeLevel) {
        res.status(200).json(createSuccessResponse({ units: [], generalQuizzes: [] }));
        return;
      }

      // Query published units for this curriculum + grade
      const unitFilter: any = {
        curriculum,
        grade_level: gradeLevel,
        is_published: true
      };
      if (term && term !== 'ALL_TERMS') {
        unitFilter.academic_term = term;
      }

      const units = await UnitPackageModel.find(unitFilter)
        .sort({ order_index: 1, createdAt: 1 })
        .select('_id title_ar title_en order_index package_type price_egp')
        .lean();

      // Query published assessments (excluding HOMEWORK, which is strictly private)
      const assessmentFilter: any = {
        curriculum,
        grade_level: gradeLevel,
        is_published: true,
        assessment_type: { $ne: 'HOMEWORK' }
      };
      if (term && term !== 'ALL_TERMS') {
        assessmentFilter.$or = [
          { academic_term: term },
          { academic_term: 'ALL_TERMS' },
          { academic_term: null },
          { academic_term: { $exists: false } }
        ];
      }

      const assessments = await AssessmentModel.find(assessmentFilter)
        .sort({ createdAt: 1 })
        .select('_id title_ar title_en unit_package_id assessment_type time_limit_minutes total_points is_free is_placement_test xp_reward questions')
        .lean();

      // Map assessments to units
      const unitMap = new Map<string, any[]>();
      const generalQuizzes: any[] = [];

      for (const a of assessments) {
        const item = {
          id: a._id.toString(),
          titleAr: a.title_ar,
          titleEn: a.title_en,
          assessmentType: a.assessment_type,
          timeLimitMinutes: a.time_limit_minutes,
          totalPoints: a.total_points,
          questionsCount: a.questions?.length || 0,
          isFree: !!a.is_free,
          isPlacementTest: !!a.is_placement_test,
          xpReward: a.xp_reward || 0
        };

        if (a.unit_package_id) {
          const uId = a.unit_package_id.toString();
          const list = unitMap.get(uId) || [];
          list.push(item);
          unitMap.set(uId, list);
        } else {
          generalQuizzes.push(item);
        }
      }

      const groupedUnits = units.map((u) => ({
        unitId: u._id.toString(),
        titleAr: u.title_ar,
        titleEn: u.title_en,
        orderIndex: u.order_index,
        packageType: u.package_type,
        priceEgp: u.price_egp,
        quizzes: unitMap.get(u._id.toString()) || []
      }));

      res.status(200).json(
        createSuccessResponse({
          units: groupedUnits,
          generalQuizzes
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

export const publicController = new PublicController();
