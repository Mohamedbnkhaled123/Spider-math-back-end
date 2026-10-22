import { Types } from 'mongoose';
import { UserModel } from '../../../models/user.model';
import { GamificationLogModel } from '../../../models/gamification-log.model';
import { ROLES } from '../../../common/constants/roles.constant';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { LeaderboardQueryDto } from '../dto/leaderboard-query.dto';
import { AdjustXpDto } from '../dto/adjust-xp.dto';

export interface ILeaderboardEntry {
  rank: number;
  studentId: string;
  fullName: string;
  studentCode?: string;
  avatarUrl?: string | null;
  totalXp: number;
  badgeLevel: string;
  governorate?: string | null;
}

export class GamificationService {
  /**
   * Calculates dynamic badge level based on cumulative student XP.
   */
  static calculateBadgeLevel(totalXp: number): string {
    if (totalXp >= 1000) return 'عبقري Spider Math (Master)';
    if (totalXp >= 600) return 'فارس التفاضل والتكامل (Champion)';
    if (totalXp >= 300) return 'فيثاغورس الصغير (Scholar)';
    if (totalXp >= 100) return 'عاشق الهندسة والجبر (Explorer)';
    return 'مبتدئ الرياضيات (Apprentice)';
  }

  /**
   * Fast 5-Level Compound Index Leaderboard Query (< 5ms response time)
   * GET /api/v1/gamification/leaderboard?curriculum=EGYPTIAN&gradeLevel=SEC_3
   * Scoped by: (role, curriculum, grade_level, has_active_subscription, is_leaderboard_hidden, total_xp: -1)
   */
  async getLeaderboard(query: LeaderboardQueryDto) {
    const filter: Record<string, unknown> = {
      role: ROLES.STUDENT,
      curriculum: query.curriculum,
      grade_level: query.gradeLevel,
      has_active_subscription: true,
      is_leaderboard_hidden: { $ne: true }
    };

    if (query.term) {
      filter.academic_term = query.term;
    }

    // High performance projection utilizing compound index
    const students = await UserModel.find(filter)
      .select('full_name student_code avatar_url total_xp governorate')
      .sort({ total_xp: -1, createdAt: 1 })
      .limit(query.limit)
      .lean();

    const leaderboard: ILeaderboardEntry[] = students.map((student, index) => ({
      rank: index + 1,
      studentId: (student._id as Types.ObjectId).toString(),
      fullName: student.full_name,
      studentCode: student.student_code,
      avatarUrl: student.avatar_url,
      totalXp: student.total_xp,
      badgeLevel: GamificationService.calculateBadgeLevel(student.total_xp),
      governorate: student.governorate
    }));

    return {
      curriculum: query.curriculum,
      gradeLevel: query.gradeLevel,
      term: query.term ?? null,
      totalStudents: leaderboard.length,
      leaderboard
    };
  }

  /**
   * Adjusts student XP and/or leaderboard visibility in Admin Studio
   * POST /api/v1/admin/gamification/adjust-xp
   */
  async adjustStudentXp(_adminId: string, dto: AdjustXpDto) {
    const student = await UserModel.findById(dto.student_id);
    if (!student) {
      throw new AppError('Student not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    if (student.role !== ROLES.STUDENT) {
      throw new AppError('XP adjustments can only be applied to students', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    if (dto.is_leaderboard_hidden !== undefined) {
      student.is_leaderboard_hidden = dto.is_leaderboard_hidden;
    }

    if (dto.xp_delta !== 0) {
      const newXp = Math.max(0, student.total_xp + dto.xp_delta);
      student.total_xp = newXp;

      await GamificationLogModel.create({
        student_id: student._id,
        xp_delta: dto.xp_delta,
        action_type: dto.action_type,
        reason_note: dto.reason_note
      });
    }

    await student.save();

    return {
      studentId: student._id.toString(),
      fullName: student.full_name,
      studentCode: student.student_code,
      totalXp: student.total_xp,
      isLeaderboardHidden: student.is_leaderboard_hidden,
      badgeLevel: GamificationService.calculateBadgeLevel(student.total_xp)
    };
  }
}
