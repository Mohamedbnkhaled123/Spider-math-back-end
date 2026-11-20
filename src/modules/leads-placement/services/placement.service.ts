import { Types } from 'mongoose';
import { AssessmentModel } from '../../../models/assessment.model';
import { PlacementAttemptModel, AcademicLevelBadge } from '../../../models/placement-attempt.model';
import { LeadModel } from '../../../models/lead.model';
import { CmsConfigModel } from '../../../models/cms-config.model';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { generatePlacementLeadWhatsAppLink } from '../../../common/utils/whatsapp-link.util';
import { PlacementQueryDto } from '../dto/placement-query.dto';
import { SubmitPlacementDto } from '../dto/submit-placement.dto';
import { UnlockPlacementDto } from '../dto/unlock-placement.dto';
import { QuestionGraderFactory } from '../../assessments-grading/factories/question-grader.factory';

export class PlacementService {
  /**
   * Fetches placement test questions with strict sanitization projection.
   * Strips correct_option_index, model_answer_text, and youtube_solution_url.
   */
  public async getSanitizedPlacementQuestions(query: PlacementQueryDto) {
    const term = query.term || 'TERM_1';

    // 1. Try finding explicit placement assessment first
    let assessment = await AssessmentModel.findOne({
      curriculum: query.curriculum,
      grade_level: query.gradeLevel,
      academic_term: term,
      is_placement_test: true,
      is_published: true
    })
      .select('-questions.correct_option_index -questions.accepted_answers -questions.model_answer_text -questions.youtube_solution_url')
      .lean();

    // 2. Fallback to any published quiz for this grade level
    if (!assessment) {
      assessment = await AssessmentModel.findOne({
        curriculum: query.curriculum,
        grade_level: query.gradeLevel,
        academic_term: term,
        assessment_type: 'QUIZ',
        is_published: true
      })
        .select('-questions.correct_option_index -questions.accepted_answers -questions.model_answer_text -questions.youtube_solution_url')
        .lean();
    }

    if (!assessment || assessment.questions.length === 0) {
      // If no assessment seeded in DB yet, return structured empty state with metadata
      return {
        hasTest: false,
        curriculum: query.curriculum,
        gradeLevel: query.gradeLevel,
        academicTerm: term,
        assessmentId: null,
        titleAr: `اختبار تحديد المستوى — ${query.curriculum} (${query.gradeLevel})`,
        titleEn: `Placement Assessment — ${query.curriculum} (${query.gradeLevel})`,
        questions: []
      };
    }

    return {
      hasTest: true,
      assessment_id: assessment._id.toString(),
      assessmentId: assessment._id.toString(),
      title: assessment.title_ar,
      titleAr: assessment.title_ar,
      titleEn: assessment.title_en,
      curriculum: assessment.curriculum,
      grade_level: assessment.grade_level,
      gradeLevel: assessment.grade_level,
      academic_term: assessment.academic_term,
      academicTerm: assessment.academic_term,
      time_limit_minutes: assessment.time_limit_minutes,
      timeLimitMinutes: assessment.time_limit_minutes,
      graphCalculator: assessment.graph_calculator,
      total_questions: assessment.questions.length,
      questions: assessment.questions.map((q: any, qIdx: number) => ({
        id: q._id ? q._id.toString() : `q_${qIdx}`,
        question_id: q._id ? q._id.toString() : `q_${qIdx}`,
        question_type: q.question_type || 'MCQ',
        questionType: q.question_type || 'MCQ',
        questionText: q.question_text,
        question_text: q.question_text,
        questionImageUrl: q.question_image_url || null,
        question_image_url: q.question_image_url || null,
        questionImageSizeKb: q.question_image_size_kb || null,
        has_desmos_calculator: assessment.graph_calculator === 'DESMOS',
        points: q.points || 5,
        options: (q.options || []).map((opt: any, optIdx: number) => {
          if (typeof opt === 'string') {
            return { option_id: `opt_${optIdx}`, option_text: opt };
          }
          return {
            option_id: opt?.option_id || `opt_${optIdx}`,
            option_text: opt?.option_text || opt?.text || String(opt)
          };
        })
      }))
    };
  }

  /**
   * Evaluates submitted anonymous answers and records an unclaimed PlacementAttempt.
   * Locked behind Lead Gate with 48-hour Partial TTL auto-purge.
   */
  public async submitAnonymousPlacement(
    dto: SubmitPlacementDto,
    authenticatedUser?: { sub?: string; studentCode?: string }
  ) {
    const term = dto.academicTerm || 'TERM_1';

    // 1. Fetch assessment with answer keys for server-authoritative evaluation (MCQ, INPUT_TEXT, ESSAY_PHOTO)
    let assessment: any = await AssessmentModel.findOne({
      curriculum: dto.curriculum,
      grade_level: dto.gradeLevel,
      academic_term: term,
      is_placement_test: true,
      is_published: true
    }).select('+questions.correct_option_index +questions.accepted_answers +questions.model_answer_text');

    if (!assessment) {
      assessment = await AssessmentModel.findOne({
        curriculum: dto.curriculum,
        grade_level: dto.gradeLevel,
        academic_term: term,
        assessment_type: 'QUIZ',
        is_published: true
      }).select('+questions.correct_option_index +questions.accepted_answers +questions.model_answer_text');
    }

    // Question answers map
    const answerKeyMap = new Map<string, any>();
    let totalPossiblePoints = 0;
    if (assessment && Array.isArray(assessment.questions)) {
      assessment.questions.forEach((q: any, qIdx: number) => {
        const keyId = q._id ? q._id.toString() : `q_${qIdx}`;
        answerKeyMap.set(keyId, q);
        totalPossiblePoints += Number(q.points) || 1;
      });
    }

    const inputTextGrader = QuestionGraderFactory.getGrader('INPUT_TEXT');
    let correctCount = 0;
    let earnedPoints = 0;

    const evaluatedAnswers = (dto.answers || []).map((ans) => {
      const q = answerKeyMap.get(ans.questionId);
      let isCorrect = false;
      let qPointsEarned = 0;

      if (q) {
        const qPoints = Number(q.points) || 1;
        const rawType = String(q.question_type || 'MCQ').toUpperCase();
        if (rawType === 'INPUT_TEXT') {
          const gradeRes = inputTextGrader.grade(
            {
              questionId: ans.questionId,
              questionType: 'INPUT_TEXT',
              acceptedAnswers: q.accepted_answers,
              modelAnswerText: q.model_answer_text,
              points: qPoints
            },
            { textAnswer: ans.textAnswer || '' }
          );
          isCorrect = gradeRes.isCorrect;
          qPointsEarned = gradeRes.pointsEarned;
        } else if (rawType === 'ESSAY_PHOTO' || rawType === 'ESSAY') {
          const hasImages = Array.isArray(ans.uploadedImageUrls) && ans.uploadedImageUrls.length > 0;
          const hasText = Boolean(ans.textAnswer && ans.textAnswer.trim().length > 0);
          isCorrect = hasImages || hasText;
          qPointsEarned = isCorrect ? qPoints : 0;
        } else {
          isCorrect =
            typeof ans.selectedOption === 'number' &&
            ans.selectedOption >= 0 &&
            ans.selectedOption === (q.correct_option_index ?? 0);
          qPointsEarned = isCorrect ? qPoints : 0;
        }
      }

      if (isCorrect) correctCount++;
      earnedPoints += qPointsEarned;

      return {
        question_id: ans.questionId,
        selected_option: typeof ans.selectedOption === 'number' ? ans.selectedOption : -1,
        text_answer: ans.textAnswer || '',
        uploaded_image_urls: Array.isArray(ans.uploadedImageUrls) ? ans.uploadedImageUrls : [],
        is_correct: isCorrect
      };
    });

    const totalQuestions = Math.max(1, assessment?.questions?.length || evaluatedAnswers.length);
    const maxScore = Math.max(1, totalPossiblePoints || totalQuestions);
    const scorePct = Math.min(100, Math.round((correctCount / totalQuestions) * 100));

    // Compute Academic Level Badge
    let badge: AcademicLevelBadge;
    if (scorePct >= 85) {
      badge = 'EXCELLENT';
    } else if (scorePct >= 65) {
      badge = 'GOOD';
    } else if (scorePct >= 50) {
      badge = 'NEEDS_REVISION';
    } else {
      badge = 'FOUNDATION_REQUIRED';
    }

    // Compute strong & weak topics summary
    const strongTopics: string[] = [];
    const weakTopics: string[] = [];

    evaluatedAnswers.forEach((evaluated, idx) => {
      const topicLabel = `الموضوع ${idx + 1}`;
      if (evaluated.is_correct) {
        strongTopics.push(topicLabel);
      } else {
        weakTopics.push(topicLabel);
      }
    });

    const roundedEarnedScore = Math.round(earnedPoints * 100) / 100;
    const roundedMaxScore = Math.round(maxScore * 100) / 100;
    const passThreshold = Number((assessment as any)?.pass_percentage ?? 50);
    const passed = scorePct >= passThreshold;
    const hasAuthUser = Boolean(authenticatedUser?.sub && Types.ObjectId.isValid(authenticatedUser.sub));

    // Create attempt (48h TTL if unauthenticated/unclaimed)
    const attempt = await PlacementAttemptModel.create({
      curriculum: dto.curriculum,
      grade_level: dto.gradeLevel,
      academic_term: term,
      answers: evaluatedAnswers,
      total_questions: totalQuestions,
      correct_count: correctCount,
      score_percentage: scorePct,
      earned_score: roundedEarnedScore,
      max_score: roundedMaxScore,
      passed,
      academic_level_badge: badge,
      strengths_weaknesses: {
        strong_topics: strongTopics,
        weak_topics: weakTopics
      },
      is_unlocked_by_auth: hasAuthUser,
      ...(hasAuthUser
        ? {
            linked_user_id: new Types.ObjectId(authenticatedUser!.sub!),
            student_code: authenticatedUser?.studentCode || null
          }
        : {}),
      expires_if_unclaimed_at: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

    return {
      attemptId: attempt._id,
      status: hasAuthUser ? 'UNLOCKED' : 'LOCKED_BEHIND_GATE',
      message: hasAuthUser
        ? 'Placement assessment submitted and linked to your account.'
        : 'Placement assessment submitted successfully. Sign in to view your report.',
      score: roundedEarnedScore,
      maxScore: roundedMaxScore,
      percentage: scorePct,
      passed,
      totalQuestions,
      correctAnswersCount: correctCount,
      isUnlocked: hasAuthUser
    };
  }

  /**
   * Claims and unlocks a placement attempt for an authenticated student after login/signup.
   */
  public async claimPlacementAttemptForUser(
    attemptId: string,
    userId: string,
    studentCode?: string
  ) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new AppError('Invalid attemptId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new AppError('Invalid userId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const attempt = await PlacementAttemptModel.findById(attemptId);
    if (!attempt) {
      throw new AppError('Placement assessment attempt not found or has expired', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    if (attempt.linked_user_id && attempt.linked_user_id.toString() !== userId) {
      throw new AppError('Not authorized to access this placement attempt', 403, ERROR_CODES.FORBIDDEN_403);
    }

    attempt.linked_user_id = new Types.ObjectId(userId);
    attempt.is_unlocked_by_auth = true;
    if (studentCode) {
      attempt.student_code = studentCode;
    }
    await attempt.save();

    return {
      attemptId: attempt._id.toString(),
      curriculum: attempt.curriculum,
      gradeLevel: attempt.grade_level,
      academicTerm: attempt.academic_term,
      score: attempt.earned_score ?? attempt.correct_count,
      maxScore: attempt.max_score ?? attempt.total_questions,
      percentage: attempt.score_percentage,
      passed: attempt.passed ?? (attempt.score_percentage >= 50),
      totalQuestions: attempt.total_questions,
      correctAnswersCount: attempt.correct_count,
      academicLevelBadge: attempt.academic_level_badge,
      strengthsWeaknesses: attempt.strengths_weaknesses,
      isUnlocked: true
    };
  }

  /**
   * Lead Gate Unlock:
   * Atomically unlocks placement report, creates Lead CRM entry, and returns report with WhatsApp pre-filled link.
   */
  public async unlockPlacementAttempt(attemptId: string, dto: UnlockPlacementDto) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new AppError('Invalid attemptId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const attempt = await PlacementAttemptModel.findById(attemptId);
    if (!attempt) {
      throw new AppError('Placement assessment attempt not found or has expired', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    // Mark unlocked to cancel 48h TTL purge
    attempt.is_unlocked_by_auth = true;

    // Create LeadModel record if not already created
    let lead = attempt.linked_lead_id ? await LeadModel.findById(attempt.linked_lead_id) : null;

    if (!lead) {
      lead = await LeadModel.create({
        placement_test_attempt_id: attempt._id,
        user_id: attempt.linked_user_id || null,
        google_id: dto.googleId || `lead_${attempt._id}`,
        full_name: dto.fullName.trim(),
        email: dto.email?.trim().toLowerCase() || `${dto.phone.replace(/\D/g, '')}@lead.spidermath.com`,
        phone: dto.phone.trim(),
        curriculum: attempt.curriculum,
        grade_level: attempt.grade_level,
        academic_term: attempt.academic_term,
        placement_score_pct: attempt.score_percentage,
        lead_status: 'NEW',
        admin_notes: 'Acquired via Lead Gate placement test unlock'
      });

      attempt.linked_lead_id = lead._id;
    } else {
      // Update existing lead phone and name
      lead.full_name = dto.fullName.trim();
      lead.phone = dto.phone.trim();
      if (dto.email) lead.email = dto.email.trim().toLowerCase();
      await lead.save();
    }

    await attempt.save();

    // Fetch teacher WhatsApp phone from CMS config
    const cms = await CmsConfigModel.findOne({ singleton_key: 'MAIN_SITE_CONFIG' })
      .select('contact_channels')
      .lean();
    const teacherPhone = cms?.contact_channels?.subscription_whatsapp || '+201000000001';

    const whatsappAlertUrl = generatePlacementLeadWhatsAppLink({
      teacherPhone,
      studentName: dto.fullName,
      studentPhone: dto.phone,
      curriculum: attempt.curriculum,
      gradeLevel: attempt.grade_level,
      academicTerm: attempt.academic_term,
      scorePct: attempt.score_percentage,
      badge: attempt.academic_level_badge,
      attemptId: attempt._id.toString()
    });

    return {
      isUnlocked: true,
      attemptId: attempt._id,
      leadId: lead._id,
      scorePercentage: attempt.score_percentage,
      academicLevelBadge: attempt.academic_level_badge,
      correctCount: attempt.correct_count,
      totalQuestions: attempt.total_questions,
      strengthsWeaknesses: attempt.strengths_weaknesses,
      curriculum: attempt.curriculum,
      gradeLevel: attempt.grade_level,
      academicTerm: attempt.academic_term,
      whatsappAlertUrl,
      unlockedAt: new Date()
    };
  }
}

export const placementService = new PlacementService();
