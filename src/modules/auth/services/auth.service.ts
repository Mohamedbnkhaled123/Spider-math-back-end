import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { Types } from 'mongoose';
import { env } from '../../../config/env.config';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES, UserRole } from '../../../common/constants/roles.constant';
import { deviceWhitelistCache } from '../../../config/cache.config';
import { generateStudentHaCode } from '../../../common/utils/ha-code-generator.util';
import { NotificationFactory } from '../../../common/factories/notification.factory';
import { UserModel, IApprovedDevice } from '../../../models/user.model';
import { NotificationModel } from '../../../models/notification.model';
import { PlacementAttemptModel } from '../../../models/placement-attempt.model';
import { GoogleLoginDto } from '../dto/google-login.dto';
import { CompleteProfileDto } from '../dto/complete-profile.dto';
import { ParentActivateLoginDto, ParentLinkChildDto } from '../dto/parent-auth.dto';
import { DeviceDecisionDto } from '../dto/device-decision.dto';
import { IJwtPayload } from '../../../common/interfaces/auth-payload.interface';

export class AuthService {
  private googleClient: OAuth2Client;

  constructor() {
    this.googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }

  /**
   * Generates a 512-bit signed JWT using HS512 algorithm.
   */
  public generateToken(payload: {
    sub: string;
    role: UserRole;
    deviceUuid: string;
    studentCode?: string;
  }): string {
    const jwtPayload: IJwtPayload = {
      sub: payload.sub,
      role: payload.role,
      deviceUuid: payload.deviceUuid,
      studentCode: payload.studentCode
    };

    return jwt.sign(jwtPayload, env.JWT_SECRET, {
      algorithm: 'HS512',
      expiresIn: env.JWT_EXPIRES_IN as any
    });
  }

  /**
   * Verifies Google OAuth2 ID Token and handles 1st device auto-approval vs 2nd device additive request.
   */
  public async loginWithGoogle(dto: GoogleLoginDto, ipAddress?: string) {
    let googleId: string;
    let email: string | undefined;
    let fullName: string;
    let avatarUrl: string | null = null;

    // Verify Google ID Token (support mock in test & development mode for Postman testing)
    if (
      env.NODE_ENV !== 'production' &&
      (dto.idToken === 'DEV_MOCK_GOOGLE_TOKEN' ||
        dto.idToken.startsWith('DEV_MOCK_') ||
        dto.idToken.startsWith('test_token_') ||
        dto.idToken.startsWith('mock_'))
    ) {
      if (dto.idToken === 'DEV_MOCK_GOOGLE_TOKEN') {
        googleId = 'mock-google-id-111122223333';
        email = 'student.test@spidermath.com';
        fullName = 'أحمد محمد علي';
        avatarUrl = null;
      } else {
        googleId = dto.idToken.replace(/^(test_token_|DEV_MOCK_|mock_)/, 'google_id_');
        email = `${googleId}@spidermath.test`;
        fullName = 'Test Student';
      }
    } else {
      try {
        const ticket = await this.googleClient.verifyIdToken({
          idToken: dto.idToken,
          audience: env.GOOGLE_CLIENT_ID
        });
        const googlePayload = ticket.getPayload();

        if (!googlePayload || !googlePayload.sub) {
          throw new AppError('Invalid Google ID Token payload', 401, ERROR_CODES.INVALID_TOKEN_401);
        }

        googleId = googlePayload.sub;
        email = googlePayload.email;
        fullName = googlePayload.name || 'Spider Student';
        avatarUrl = googlePayload.picture || null;
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        throw new AppError(
          `Google OAuth verification failed: ${err.message}`,
          401,
          ERROR_CODES.INVALID_TOKEN_401
        );
      }
    }

    // Look up user by google_id or email
    let user = await UserModel.findOne({
      $or: [{ google_id: googleId }, ...(email ? [{ email }] : [])]
    });

    // -------------------------------------------------------------------------
    // CASE 1: Brand New Student (1st Device -> Auto-Approve)
    // -------------------------------------------------------------------------
    if (!user) {
      const firstDevice: IApprovedDevice = {
        device_uuid: dto.deviceUuid,
        device_type: dto.deviceType,
        browser_info: dto.browserInfo,
        ip_address: ipAddress,
        approved_at: new Date()
      };

      user = await UserModel.create({
        google_id: googleId,
        email,
        full_name: fullName,
        avatar_url: avatarUrl,
        role: ROLES.STUDENT,
        country: 'EG',
        is_profile_completed: false,
        approved_devices: [firstDevice],
        account_lock_status: 'ACTIVE'
      });

      // Seed cache for instant lookup
      deviceWhitelistCache.set(
        `device_whitelist:${user._id}`,
        new Set([dto.deviceUuid]),
        5 * 60 * 1000
      );

      // Link placement attempt if provided
      if (dto.placementAttemptId && Types.ObjectId.isValid(dto.placementAttemptId)) {
        await PlacementAttemptModel.findByIdAndUpdate(dto.placementAttemptId, {
          is_unlocked_by_auth: true,
          claimed_by_student_id: user._id
        });
      }

      const token = this.generateToken({
        sub: user._id.toString(),
        role: user.role,
        deviceUuid: dto.deviceUuid,
        studentCode: user.student_code
      });

      return {
        isNewUser: true,
        isProfileCompleted: false,
        isPendingApproval: false,
        token,
        user: {
          id: user._id,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatar_url,
          isProfileCompleted: user.is_profile_completed
        }
      };
    }

    // Link google_id if missing (e.g. matched by email)
    if (!user.google_id) {
      user.google_id = googleId;
      await user.save();
    }

    // Check account status
    if (user.account_lock_status === 'SUSPENDED') {
      throw new AppError(
        'Your account has been suspended. Please contact Eng. Heba Abdel-Wahab.',
        423,
        ERROR_CODES.ACCOUNT_SUSPENDED_423
      );
    }

    // Check if device is in approved_devices
    const isDeviceApproved = user.approved_devices.some(
      (d) => d.device_uuid === dto.deviceUuid
    );

    // -------------------------------------------------------------------------
    // CASE 2: Approved Device (Return Token)
    // -------------------------------------------------------------------------
    if (isDeviceApproved) {
      // Ensure LRU cache is fresh
      deviceWhitelistCache.set(
        `device_whitelist:${user._id}`,
        new Set(user.approved_devices.map((d) => d.device_uuid)),
        5 * 60 * 1000
      );

      const token = this.generateToken({
        sub: user._id.toString(),
        role: user.role,
        deviceUuid: dto.deviceUuid,
        studentCode: user.student_code
      });

      return {
        isNewUser: false,
        isProfileCompleted: user.is_profile_completed,
        isPendingApproval: false,
        token,
        user: {
          id: user._id,
          studentCode: user.student_code,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          curriculum: user.curriculum,
          gradeLevel: user.grade_level,
          academicTerm: user.academic_term,
          totalXp: user.total_xp,
          avatarUrl: user.avatar_url,
          isProfileCompleted: user.is_profile_completed
        }
      };
    }

    // -------------------------------------------------------------------------
    // CASE 3: 2nd or Unrecognized Device -> Additive Pending Device Request
    // -------------------------------------------------------------------------
    user.pending_device_req = {
      device_uuid: dto.deviceUuid,
      device_type: dto.deviceType,
      browser_info: dto.browserInfo,
      ip_address: ipAddress,
      requested_at: new Date(),
      status: 'PENDING'
    };
    user.account_lock_status = 'PENDING_DEVICE_APPROVAL';
    await user.save();

    // Trigger instant alert for Super Admin
    const superAdmin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN }).select('_id');
    if (superAdmin) {
      const alert = NotificationFactory.createAdminDeviceApprovalAlert({
        adminId: superAdmin._id,
        studentId: user._id,
        studentName: user.full_name,
        studentCode: user.student_code,
        deviceType: dto.deviceType,
        browserInfo: dto.browserInfo
      });
      await NotificationModel.create(alert);
    }

    return {
      isNewUser: false,
      isProfileCompleted: user.is_profile_completed,
      isPendingApproval: true,
      existingDevicesActive: true,
      message: 'This device is pending approval by Eng. Heba Abdel-Wahab.',
      deviceUuid: dto.deviceUuid,
      studentId: user._id
    };
  }

  /**
   * Completes 5-level student profile and assigns atomic sequential HAxxxx code.
   */
  public async completeStudentProfile(studentId: string, dto: CompleteProfileDto) {
    const user = await UserModel.findById(studentId);
    if (!user) {
      throw new AppError('Student account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    if (user.role !== ROLES.STUDENT) {
      throw new AppError('Only student profiles can be completed with curriculum taxonomy', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    // Assign sequential student code if not already assigned
    let studentCode = user.student_code;
    if (!studentCode) {
      studentCode = await generateStudentHaCode();
      user.student_code = studentCode;
    }

    user.full_name = dto.fullName.trim();
    user.phone = dto.phone.trim();
    user.parent_phone = dto.parentPhone.trim();
    user.curriculum = dto.curriculum;
    user.grade_level = dto.gradeLevel;
    user.academic_term = dto.academicTerm;
    user.country = dto.country || 'EG';
    user.governorate = dto.governorate || null;
    if (dto.avatarUrl) {
      user.avatar_url = dto.avatarUrl;
    }
    user.is_profile_completed = true;

    await user.save();

    // Link any anonymous placement attempts
    await PlacementAttemptModel.updateMany(
      { claimed_by_student_id: user._id },
      { student_code: studentCode }
    );

    // Refresh token with studentCode
    const approvedDeviceUuid = user.approved_devices[0]?.device_uuid || 'primary_device';
    const token = this.generateToken({
      sub: user._id.toString(),
      role: user.role,
      deviceUuid: approvedDeviceUuid,
      studentCode
    });

    return {
      studentCode,
      token,
      user: {
        id: user._id,
        studentCode: user.student_code,
        fullName: user.full_name,
        phone: user.phone,
        parentPhone: user.parent_phone,
        curriculum: user.curriculum,
        gradeLevel: user.grade_level,
        academicTerm: user.academic_term,
        country: user.country,
        governorate: user.governorate,
        totalXp: user.total_xp,
        avatarUrl: user.avatar_url,
        isProfileCompleted: true
      }
    };
  }

  /**
   * Matches parent phone + student HAxxxx code, links child, and signs parent token.
   */
  public async parentActivateLogin(dto: ParentActivateLoginDto, ipAddress?: string) {
    const student = await UserModel.findOne({ student_code: dto.studentCode });
    if (!student) {
      throw new AppError(
        `No student found with Student Code: ${dto.studentCode}`,
        404,
        ERROR_CODES.STUDENT_NOT_FOUND_404
      );
    }

    // Verify parent phone matching
    if (student.parent_phone && student.parent_phone !== dto.parentPhone) {
      throw new AppError(
        'Provided parent phone does not match registered student profile',
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    // Ensure student record has parent phone
    if (!student.parent_phone) {
      student.parent_phone = dto.parentPhone;
      await student.save();
    }

    // Find or create Parent user account
    let parent = await UserModel.findOne({ role: ROLES.PARENT, phone: dto.parentPhone });
    if (!parent) {
      parent = await UserModel.create({
        full_name: dto.fullName || `ولي أمر الطالب ${student.full_name}`,
        phone: dto.parentPhone,
        role: ROLES.PARENT,
        country: student.country || 'EG',
        is_profile_completed: true,
        linked_children: [student._id],
        account_lock_status: 'ACTIVE',
        approved_devices: [
          {
            device_uuid: dto.deviceUuid,
            device_type: 'Parent Portal Device',
            browser_info: 'Web Browser',
            ip_address: ipAddress,
            approved_at: new Date()
          }
        ]
      });
    } else {
      await UserModel.findByIdAndUpdate(parent._id, {
        $addToSet: { linked_children: student._id }
      });
      parent = (await UserModel.findById(parent._id))!;
    }

    const token = this.generateToken({
      sub: parent._id.toString(),
      role: ROLES.PARENT,
      deviceUuid: dto.deviceUuid
    });

    return {
      parent: {
        id: parent._id,
        fullName: parent.full_name,
        phone: parent.phone,
        role: parent.role,
        linkedChildren: [
          {
            id: student._id,
            studentCode: student.student_code,
            fullName: student.full_name,
            curriculum: student.curriculum,
            gradeLevel: student.grade_level,
            totalXp: student.total_xp
          }
        ]
      },
      token
    };
  }

  /**
   * Links an additional child to an already authenticated parent account.
   */
  public async parentLinkAdditionalChild(parentId: string, dto: ParentLinkChildDto) {
    const student = await UserModel.findOne({ student_code: dto.studentCode });
    if (!student) {
      throw new AppError(
        `Student with code ${dto.studentCode} not found`,
        404,
        ERROR_CODES.STUDENT_NOT_FOUND_404
      );
    }

    const parent = await UserModel.findByIdAndUpdate(
      parentId,
      { $addToSet: { linked_children: student._id } },
      { new: true }
    ).populate('linked_children', 'full_name student_code curriculum grade_level total_xp avatar_url');

    if (!parent) {
      throw new AppError('Parent account not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    return {
      parent: {
        id: parent._id,
        fullName: parent.full_name,
        linkedChildren: parent.linked_children
      },
      newlyLinkedChild: {
        id: student._id,
        studentCode: student.student_code,
        fullName: student.full_name
      }
    };
  }

  /**
   * Fetches all pending device authorization requests for Super Admin review.
   */
  public async getPendingDeviceRequests() {
    return UserModel.find({
      'pending_device_req.status': 'PENDING'
    })
      .select('full_name student_code phone parent_phone curriculum grade_level approved_devices pending_device_req createdAt')
      .lean();
  }

  /**
   * Super Admin Additive Device Decision:
   * APPROVE: Appends device to approved_devices[] via $push and invalidates LRUCache key.
   * REJECT: Sets pending_device_req.status to REJECTED.
   */
  public async decideDeviceRequest(studentId: string, dto: DeviceDecisionDto) {
    const user = await UserModel.findById(studentId);
    if (!user) {
      throw new AppError('Student not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    if (!user.pending_device_req || user.pending_device_req.status !== 'PENDING') {
      throw new AppError('No pending device request found for this student', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const pending = user.pending_device_req;

    if (dto.action === 'APPROVE') {
      const newApprovedDevice: IApprovedDevice = {
        device_uuid: pending.device_uuid,
        device_type: pending.device_type,
        browser_info: pending.browser_info,
        ip_address: pending.ip_address,
        approved_at: new Date()
      };

      await UserModel.findByIdAndUpdate(studentId, {
        $push: { approved_devices: newApprovedDevice },
        $set: {
          'pending_device_req.status': 'APPROVED',
          account_lock_status: 'ACTIVE'
        }
      });

      // Invalidate student whitelist cache key so both devices work concurrently
      deviceWhitelistCache.delete(`device_whitelist:${studentId}`);

      // Send approval notification to student
      const alert = NotificationFactory.createDeviceApprovedAlert({
        recipientId: user._id,
        deviceType: pending.device_type
      });
      await NotificationModel.create(alert);

      return {
        success: true,
        action: 'APPROVED',
        studentId,
        approvedDeviceUuid: pending.device_uuid,
        message: 'Device approved additively. Both devices are now fully active.'
      };
    } else {
      await UserModel.findByIdAndUpdate(studentId, {
        $set: {
          'pending_device_req.status': 'REJECTED',
          account_lock_status: 'ACTIVE'
        }
      });

      deviceWhitelistCache.delete(`device_whitelist:${studentId}`);

      return {
        success: true,
        action: 'REJECTED',
        studentId,
        rejectedDeviceUuid: pending.device_uuid,
        message: 'Device request rejected.'
      };
    }
  }
}

export const authService = new AuthService();
