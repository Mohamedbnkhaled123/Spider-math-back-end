import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { TestimonialModel } from '../../models/testimonial.model';
import { UserModel } from '../../models/user.model';
import { createSuccessResponse } from '../../common/interfaces/api-response.interface';
import { AppError } from '../../common/utils/app-error.util';
import { ERROR_CODES } from '../../common/constants/error-codes.constant';
import { ROLES } from '../../common/constants/roles.constant';
import {
  CurriculumType,
  GradeLevelType
} from '../../common/constants/curriculum-hierarchy.constant';

export function formatArabicStudentStage(curriculum?: string, gradeLevel?: string): string {
  const gradeLabelsAr: Record<string, string> = {
    PRI_1: 'الصف الأول الابتدائي',
    PRI_2: 'الصف الثاني الابتدائي',
    PRI_3: 'الصف الثالث الابتدائي',
    PRI_4: 'الصف الرابع الابتدائي',
    PRI_5: 'الصف الخامس الابتدائي',
    PRI_6: 'الصف السادس الابتدائي',
    PREP_1: 'الصف الأول الإعدادي',
    PREP_2: 'الصف الثاني الإعدادي',
    PREP_3: 'الصف الثالث الإعدادي',
    SEC_1: 'الصف الأول الثانوي',
    SEC_2: 'الصف الثاني الثانوي',
    SEC_3: 'الصف الثالث الثانوي (ثانوية عامة)',
    GRADE_1: 'الصف الأول الابتدائي',
    GRADE_2: 'الصف الثاني الابتدائي',
    GRADE_3: 'الصف الثالث الابتدائي',
    GRADE_4: 'الصف الرابع الابتدائي',
    GRADE_5: 'الصف الخامس الابتدائي',
    GRADE_6: 'الصف السادس الابتدائي',
    GRADE_7: 'الصف السابع (أول متوسط)',
    GRADE_8: 'الصف الثامن (ثاني متوسط)',
    GRADE_9: 'الصف التاسع (ثالث متوسط)',
    GRADE_10: 'الصف العاشر',
    GRADE_11: 'الصف الحادي عشر',
    GRADE_12: 'الصف الثاني عشر (توجيهي)',
    IGCSE_YEAR_1: 'السنة الأولى (Year 1)',
    IGCSE_YEAR_2: 'السنة الثانية (Year 2)',
    IGCSE_YEAR_3: 'السنة الثالثة (Year 3)',
    IGCSE_YEAR_4: 'السنة الرابعة (Year 4)',
    IGCSE_YEAR_5: 'السنة الخامسة (Year 5)',
    IGCSE_YEAR_6: 'السنة السادسة (Year 6)',
    IGCSE_YEAR_7: 'السنة السابعة (Year 7)',
    IGCSE_YEAR_8: 'السنة الثامنة (Year 8)',
    IGCSE_YEAR_9: 'السنة التاسعة (Year 9)',
    IGCSE_OL: 'O-Level Extended Math',
    IGCSE_AS: 'AS-Level Mathematics',
    IGCSE_AL: 'A-Level Mathematics (9709)',
    US_GRADE_1: 'الصف الأول الأمريكي',
    US_GRADE_2: 'الصف الثاني الأمريكي',
    US_GRADE_3: 'الصف الثالث الأمريكي',
    US_GRADE_4: 'الصف الرابع الأمريكي',
    US_GRADE_5: 'الصف الخامس الأمريكي',
    US_GRADE_6: 'الصف السادس الأمريكي',
    US_GRADE_7: 'الصف السابع الأمريكي',
    US_GRADE_8: 'الصف الثامن الأمريكي',
    SAT_1: 'Digital SAT Math',
    SAT_2: 'SAT Subject Math',
    SAT_MATH: 'Digital SAT Math',
    ACT_MATH: 'ACT Mathematics',
    EST_MATH: 'EST I & II Math'
  };

  const curriculumLabelsAr: Record<string, string> = {
    EGYPTIAN: 'المنهج المصري',
    GULF: 'المنهج الخليجي',
    INTERNATIONAL: 'الشهادة البريطانية (IGCSE)',
    AMERICAN: 'الدبلومة الأمريكية (SAT / EST)'
  };

  const gLabel = gradeLevel ? (gradeLabelsAr[gradeLevel] || gradeLevel) : '';
  const cLabel = curriculum ? (curriculumLabelsAr[curriculum] || curriculum) : '';

  if (gLabel && cLabel) return `${gLabel} • ${cLabel}`;
  return gLabel || cLabel || 'طالب المنصة';
}

export class TestimonialsController {
  /**
   * GET /api/v1/public/testimonials
   * Publicly returns only approved testimonials.
   */
  public async getApprovedTestimonials(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const testimonials = await TestimonialModel.find({ is_approved: true })
        .sort({ approved_at: -1, createdAt: -1 })
        .limit(30)
        .lean();

      const data = testimonials.map((t) => ({
        id: t._id.toString(),
        authorName: t.author_name,
        authorRole: t.author_role,
        curriculum: t.curriculum,
        gradeLevel: t.grade_level,
        studentStage: t.student_stage,
        studentGrade: t.student_grade || '',
        reviewText: t.review_text,
        rating: t.rating || 5,
        createdAt: t.createdAt
      }));

      res.status(200).json(createSuccessResponse(data));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/public/testimonials
   * Allows authenticated STUDENT or PARENT to submit a testimonial.
   * Student's grade level and curriculum are derived from user profile.
   * State is never exposed as pending/published to student/parent.
   */
  public async submitTestimonial(req: any, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        throw new AppError('Authentication required', 401, ERROR_CODES.UNAUTHORIZED_401);
      }

      const role = user.role;
      if (role !== ROLES.STUDENT && role !== ROLES.PARENT) {
        throw new AppError('Only registered students and parents can submit testimonials', 403, ERROR_CODES.FORBIDDEN_403);
      }

      const { review_text, reviewText, rating } = req.body;
      const text = (review_text || reviewText || '').trim();
      if (!text || text.length < 5) {
        throw new AppError('يرجى كتابة رأيك بشكل واضح (5 أحرف على الأقل)', 400, ERROR_CODES.VALIDATION_ERROR_400);
      }
      if (text.length > 1000) {
        throw new AppError('نص الرأي لا يمكن أن يتجاوز 1000 حرف', 400, ERROR_CODES.VALIDATION_ERROR_400);
      }

      const numRating = Math.min(5, Math.max(1, Number(rating) || 5));

      // Resolve student's curriculum and grade level
      let curriculum: CurriculumType = user.curriculum || 'EGYPTIAN';
      let gradeLevel: GradeLevelType = user.grade_level || 'SEC_1';
      let studentStage = '';

      if (role === ROLES.PARENT) {
        if (Array.isArray(user.linked_children) && user.linked_children.length > 0) {
          const child = await UserModel.findById(user.linked_children[0]).select('curriculum grade_level full_name').lean();
          if (child) {
            curriculum = child.curriculum || curriculum;
            gradeLevel = child.grade_level || gradeLevel;
          }
        }
      }

      // Generate human-friendly stage description in Arabic from student profile
      studentStage = formatArabicStudentStage(curriculum, gradeLevel);

      const authorName = user.full_name || (role === ROLES.PARENT ? 'ولي أمر طالب' : 'طالب');

      await TestimonialModel.create({
        user_id: new Types.ObjectId(user.id || user._id),
        author_name: authorName,
        author_role: role,
        curriculum,
        grade_level: gradeLevel,
        student_stage: studentStage,
        student_grade: '',
        review_text: text,
        rating: numRating,
        is_approved: false,
        status: 'PENDING'
      });

      res.status(201).json(
        createSuccessResponse({
          submitted: true,
          message: 'تم استلام رأيك بنجاح ونعتز بمشاركتك القيمة دائماً.'
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/testimonials
   * Admin dashboard: returns all testimonials (pending and approved).
   */
  public async getAllTestimonialsAdmin(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const testimonials = await TestimonialModel.find()
        .sort({ createdAt: -1 })
        .populate('user_id', 'full_name email phone student_code')
        .lean();

      const data = testimonials.map((t: any) => ({
        id: t._id.toString(),
        userId: t.user_id?._id?.toString() || (t.user_id?.toString() ?? ''),
        authorName: t.author_name,
        authorRole: t.author_role,
        curriculum: t.curriculum,
        gradeLevel: t.grade_level,
        studentStage: t.student_stage,
        studentGrade: t.student_grade || '',
        reviewText: t.review_text,
        rating: t.rating,
        isApproved: !!t.is_approved,
        status: t.status,
        approvedAt: t.approved_at,
        createdAt: t.createdAt,
        userPhone: t.user_id?.phone || '',
        userEmail: t.user_id?.email || '',
        studentCode: t.user_id?.student_code || ''
      }));

      res.status(200).json(createSuccessResponse(data));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/testimonials/:id
   * Admin dashboard: approve, edit text, or set student's grade/score.
   */
  public async updateTestimonialAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { is_approved, isApproved, status, student_grade, studentGrade, review_text, reviewText, author_name, authorName, student_stage, studentStage } = req.body;

      const testimonial = await TestimonialModel.findById(id);
      if (!testimonial) {
        throw new AppError('Testimonial not found', 404, ERROR_CODES.ASSESSMENT_NOT_FOUND_404);
      }

      if (is_approved !== undefined || isApproved !== undefined) {
        const approved = is_approved !== undefined ? !!is_approved : !!isApproved;
        testimonial.is_approved = approved;
        testimonial.status = approved ? 'APPROVED' : 'PENDING';
        testimonial.approved_at = approved ? new Date() : null;
      }

      if (status !== undefined) {
        testimonial.status = status;
        testimonial.is_approved = status === 'APPROVED';
        testimonial.approved_at = status === 'APPROVED' ? new Date() : null;
      }

      if (student_grade !== undefined || studentGrade !== undefined) {
        testimonial.student_grade = (student_grade !== undefined ? student_grade : studentGrade).trim();
      }

      if (student_stage !== undefined || studentStage !== undefined) {
        testimonial.student_stage = (student_stage !== undefined ? student_stage : studentStage).trim();
      }

      if (review_text !== undefined || reviewText !== undefined) {
        testimonial.review_text = (review_text !== undefined ? review_text : reviewText).trim();
      }

      if (author_name !== undefined || authorName !== undefined) {
        testimonial.author_name = (author_name !== undefined ? author_name : authorName).trim();
      }

      await testimonial.save();

      res.status(200).json(
        createSuccessResponse({
          id: testimonial._id.toString(),
          isApproved: testimonial.is_approved,
          status: testimonial.status,
          studentGrade: testimonial.student_grade,
          reviewText: testimonial.review_text,
          authorName: testimonial.author_name,
          studentStage: testimonial.student_stage
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/testimonials/:id
   * Admin dashboard: delete testimonial.
   */
  public async deleteTestimonialAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await TestimonialModel.findByIdAndDelete(id);
      res.status(200).json(createSuccessResponse({ deleted: true }));
    } catch (error) {
      next(error);
    }
  }
}

export const testimonialsController = new TestimonialsController();
