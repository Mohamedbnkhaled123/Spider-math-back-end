import { Types } from 'mongoose';
import {
  SubscriptionModel,
  SubscriptionStatus,
  assertValidSubscriptionTransition
} from '../../../models/subscription.model';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { UserModel } from '../../../models/user.model';
import { CmsConfigModel } from '../../../models/cms-config.model';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { generateSubscriptionRequestWhatsAppLink } from '../../../common/utils/whatsapp-link.util';
import { ActivateSubscriptionDto } from '../dto/subscription.dto';

export class SubscriptionsService {
  /**
   * Generates pre-filled WhatsApp subscription request link.
   */
  public async generateWhatsAppRequestLink(studentId: string, unitPackageId: string) {
    if (!Types.ObjectId.isValid(unitPackageId)) {
      throw new AppError('Invalid unitPackageId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const [student, unit, cms] = await Promise.all([
      UserModel.findById(studentId).lean(),
      UnitPackageModel.findById(unitPackageId).lean(),
      CmsConfigModel.findOne({ singleton_key: 'MAIN_SITE_CONFIG' }).lean()
    ]);

    if (!student) {
      throw new AppError('Student profile not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }
    if (!unit) {
      throw new AppError('Unit package not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    const teacherPhone = cms?.contact_channels?.subscription_whatsapp || '+201000000001';

    const whatsappUrl = generateSubscriptionRequestWhatsAppLink({
      teacherPhone,
      studentName: student.full_name,
      studentCode: student.student_code,
      curriculum: unit.curriculum,
      gradeLevel: unit.grade_level,
      academicTerm: unit.academic_term,
      unitTitle: unit.title_ar
    });

    return {
      whatsappUrl,
      studentCode: student.student_code,
      unitTitle: unit.title_ar,
      priceEgp: unit.price_egp
    };
  }

  /**
   * Super Admin: One-Click Subscription Activation.
   */
  public async activateSubscription(adminId: string, dto: ActivateSubscriptionDto) {
    let student = null;
    if (dto.studentId && Types.ObjectId.isValid(dto.studentId)) {
      student = await UserModel.findById(dto.studentId);
    } else if (dto.studentCode) {
      student = await UserModel.findOne({ student_code: dto.studentCode.trim() });
    }

    if (!student) {
      throw new AppError('Student not found for subscription activation', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    const unit = await UnitPackageModel.findById(dto.unitPackageId);
    if (!unit) {
      throw new AppError('Unit package not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    const validityDays = dto.validityDays || unit.validity_days || 90;
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
    const pricePaid = dto.pricePaidEgp !== undefined ? dto.pricePaidEgp : unit.price_egp;

    const subscription = await SubscriptionModel.findOneAndUpdate(
      { student_id: student._id, unit_package_id: unit._id },
      {
        $set: {
          student_code: student.student_code || 'PENDING',
          curriculum: unit.curriculum,
          grade_level: unit.grade_level,
          academic_term: unit.academic_term,
          subscription_status: 'ACTIVE',
          price_paid_egp: pricePaid,
          activated_by: adminId,
          activated_at: new Date(),
          expires_at: expiresAt,
          expiry_warning_sent: false,
          freeze_reason: null,
          frozen_at: null,
          frozen_days_remaining: 0
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Update student's active subscription flag
    await UserModel.findByIdAndUpdate(student._id, {
      $set: { has_active_subscription: true }
    });

    return subscription;
  }

  /**
   * Super Admin: Updates subscription status enforcing the Subscription State Pattern.
   */
  public async updateSubscriptionStatus(subscriptionId: string, nextStatus: SubscriptionStatus, freezeReason?: string) {
    if (!Types.ObjectId.isValid(subscriptionId)) {
      throw new AppError('Invalid subscriptionId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new AppError('Subscription record not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    // Enforce State Pattern (ACTIVE <-> FROZEN, ACTIVE -> EXPIRED, ANY -> CANCELLED)
    assertValidSubscriptionTransition(subscription.subscription_status, nextStatus);

    // Handle Freezing
    if (nextStatus === 'FROZEN') {
      const daysRemaining = Math.max(
        0,
        Math.ceil((subscription.expires_at.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );
      subscription.frozen_days_remaining = daysRemaining;
      subscription.frozen_at = new Date();
      subscription.freeze_reason = freezeReason || 'Frozen by Eng. Heba Abdel-Wahab';
    }

    // Handle Unfreezing (Restoring Active State)
    if (subscription.subscription_status === 'FROZEN' && nextStatus === 'ACTIVE') {
      const remainingDays = subscription.frozen_days_remaining || 0;
      subscription.expires_at = new Date(Date.now() + remainingDays * 24 * 60 * 60 * 1000);
      subscription.frozen_days_remaining = 0;
      subscription.frozen_at = null;
      subscription.freeze_reason = null;
    }

    subscription.subscription_status = nextStatus;
    await subscription.save();

    // Check if student still has any remaining active subscriptions
    const remainingActiveCount = await SubscriptionModel.countDocuments({
      student_id: subscription.student_id,
      subscription_status: 'ACTIVE',
      expires_at: { $gt: new Date() }
    });

    await UserModel.findByIdAndUpdate(subscription.student_id, {
      $set: { has_active_subscription: remainingActiveCount > 0 }
    });

    return subscription;
  }
}

export const subscriptionsService = new SubscriptionsService();
