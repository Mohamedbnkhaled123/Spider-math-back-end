import { Types } from 'mongoose';
import { INotification } from '../../models/notification.model';
import { ROLES } from '../constants/roles.constant';

/**
 * Spider Math NotificationFactory
 * Centralized, typed factory for constructing localized, role-targeted notification payloads.
 * Strictly adheres to RULES.md Section 4.1 & Section 5.1 (Zero Image Bloat, optional YouTube solution URL).
 */
export class NotificationFactory {
  /**
   * Generates notification for Super Admin when a student logs in from a 2nd unrecognized device.
   */
  static createAdminDeviceApprovalAlert(params: {
    adminId: Types.ObjectId;
    studentId: Types.ObjectId;
    studentName: string;
    studentCode?: string;
    deviceType: string;
    browserInfo: string;
  }): Omit<INotification, 'created_at'> {
    const codeTag = params.studentCode ? ` (${params.studentCode})` : '';
    return {
      recipient_id: params.adminId,
      recipient_role: ROLES.SUPER_ADMIN,
      alert_category: 'ADMIN_DEVICE_APPROVAL_REQ',
      title_ar: `طلب اعتماد جهاز جديد${codeTag}`,
      title_en: `New Device Approval Request${codeTag}`,
      body_ar: `طلب الطالب ${params.studentName}${codeTag} تسجيل الدخول من جهاز جديد (${params.deviceType} - ${params.browserInfo}). يرجى المراجعة والاعتماد.`,
      body_en: `Student ${params.studentName}${codeTag} requested access from a new device (${params.deviceType} - ${params.browserInfo}). Click to review.`,
      action_url: `/admin/device-requests`,
      batch_counter: 1,
      is_read: false
    };
  }

  /**
   * Generates notification for Super Admin when submissions batch accumulates.
   */
  static createAdminBatchedSubmissionsAlert(params: {
    adminId: Types.ObjectId;
    assessmentId: Types.ObjectId;
    assessmentTitleAr: string;
    assessmentTitleEn: string;
    batchCount: number;
  }): Omit<INotification, 'created_at'> {
    return {
      recipient_id: params.adminId,
      recipient_role: ROLES.SUPER_ADMIN,
      alert_category: 'ADMIN_BATCHED_SUBMISSIONS',
      title_ar: `دفعة تسليمات جديدة (${params.batchCount} طلاب)`,
      title_en: `New Submissions Batch (${params.batchCount} Students)`,
      body_ar: `قام ${params.batchCount} طلاب بتسليم "${params.assessmentTitleAr}" بانتظار المراجعة والتصحيح.`,
      body_en: `${params.batchCount} students submitted "${params.assessmentTitleEn}" awaiting grading review.`,
      action_url: `/admin/grading-studio/${params.assessmentId.toString()}`,
      batch_counter: params.batchCount,
      is_read: false
    };
  }

  /**
   * Generates notification for Student/Parent when homework is graded by Eng. Heba Abdel-Wahab.
   */
  static createHomeworkGradedAlert(params: {
    recipientId: Types.ObjectId;
    recipientRole: typeof ROLES.STUDENT | typeof ROLES.PARENT;
    assessmentTitleAr: string;
    assessmentTitleEn: string;
    score: number;
    totalPoints: number;
    youtubeSolutionUrl?: string | null;
  }): Omit<INotification, 'created_at'> {
    return {
      recipient_id: params.recipientId,
      recipient_role: params.recipientRole,
      alert_category: 'STUDENT_HOMEWORK_GRADED',
      title_ar: `تم تصحيح الواجب: ${params.assessmentTitleAr}`,
      title_en: `Homework Graded: ${params.assessmentTitleEn}`,
      body_ar: `الدرجة النهائية: ${params.score}/${params.totalPoints}. اضغط لعرض ملاحظات المهندسة هبة عبدالوهاب ورابط فيديو الحل على يوتيوب.`,
      body_en: `Final Score: ${params.score}/${params.totalPoints}. Click to view Eng. Heba Abdel-Wahab's feedback and YouTube solution link.`,
      youtube_solution_url: params.youtubeSolutionUrl ?? null,
      batch_counter: 1,
      is_read: false
    };
  }

  /**
   * Generates notification for Student when their new device has been approved.
   */
  static createDeviceApprovedAlert(params: {
    recipientId: Types.ObjectId;
    deviceType: string;
  }): Omit<INotification, 'created_at'> {
    return {
      recipient_id: params.recipientId,
      recipient_role: ROLES.STUDENT,
      alert_category: 'STUDENT_UNIT_ACTIVATED',
      title_ar: 'تم اعتماد جهازك الجديد بنجاح',
      title_en: 'New Device Approved Successfully',
      body_ar: `تم اعتماد جهازك (${params.deviceType}) بواسطة المهندسة هبة عبدالوهاب. يمكنك الآن متابعة دروسك عليه بحرية.`,
      body_en: `Your device (${params.deviceType}) has been approved by Eng. Heba Abdel-Wahab. You can now access your lessons.`,
      action_url: `/dashboard`,
      batch_counter: 1,
      is_read: false
    };
  }
}
