import { Types } from 'mongoose';
import { UserModel } from '../../../models/user.model';
import { NotificationModel } from '../../../models/notification.model';
import { NotificationFactory } from '../../../common/factories/notification.factory';
import { ROLES } from '../../../common/constants/roles.constant';

/**
 * BatchAlertService
 * Collects and batches teacher submission alerts (every 5 submissions).
 * Prevents alert fatigue for Eng. Heba Abdel-Wahab when an entire class submits homework or exams.
 */
export class BatchAlertService {
  private static readonly BATCH_THRESHOLD = 5;
  private static submissionCounters: Map<string, number> = new Map();

  /**
   * Increments submission counter for an assessment.
   * Dispatches an aggregated notification when reaching BATCH_THRESHOLD.
   */
  static async recordSubmissionForGrading(params: {
    assessmentId: Types.ObjectId;
    assessmentTitleAr: string;
    assessmentTitleEn: string;
  }): Promise<void> {
    const key = params.assessmentId.toString();
    const currentCount = (this.submissionCounters.get(key) ?? 0) + 1;

    if (currentCount >= this.BATCH_THRESHOLD) {
      // Threshold reached -> dispatch batched alert to Eng. Heba Abdel-Wahab
      this.submissionCounters.set(key, 0);

      // Find Super Admin
      const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN }).select('_id').lean();
      if (!admin) return;

      const alertPayload = NotificationFactory.createAdminBatchedSubmissionsAlert({
        adminId: admin._id as Types.ObjectId,
        assessmentId: params.assessmentId,
        assessmentTitleAr: params.assessmentTitleAr,
        assessmentTitleEn: params.assessmentTitleEn,
        batchCount: this.BATCH_THRESHOLD
      });

      await NotificationModel.create(alertPayload);
    } else {
      this.submissionCounters.set(key, currentCount);
    }
  }

  /**
   * Resets counter for testing or when grading batch is reviewed.
   */
  static resetCounter(assessmentId: Types.ObjectId): void {
    this.submissionCounters.delete(assessmentId.toString());
  }

  /**
   * Retrieves current pending counter for an assessment.
   */
  static getPendingCounter(assessmentId: Types.ObjectId): number {
    return this.submissionCounters.get(assessmentId.toString()) ?? 0;
  }
}
