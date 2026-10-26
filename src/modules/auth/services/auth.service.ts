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
import { DirectRegisterStudentDto } from '../dto/direct-register.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { DeviceDecisionDto } from '../dto/device-decision.dto';
import { validatePhoneNumber, arePhoneNumbersIdentical } from '../../../common/utils/phone-validator.util';
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

    // Verify Google ID Token (support mock in test & development mode for testing & browser simulation)
    if (
      env.NODE_ENV !== 'production' &&
      (dto.idToken === 'DEV_MOCK_GOOGLE_TOKEN' ||
        dto.idToken.startsWith('DEV_MOCK_') ||
        dto.idToken.startsWith('test_token_') ||
        dto.idToken.startsWith('mock_') ||
        dto.idToken.startsWith('dev_'))
    ) {
      if (dto.email) {
        email = dto.email.trim().toLowerCase();
        googleId = `gid_${Buffer.from(email).toString('hex').slice(0, 24)}`;
        fullName = dto.fullName?.trim() || (email.split('@')[0] as string) || 'طالب سبايدر ماث';
        avatarUrl = null;
      } else if (dto.idToken === 'DEV_MOCK_GOOGLE_TOKEN') {
        googleId = 'mock-google-id-111122223333';
        email = 'student.test@spidermath.com';
        fullName = 'أحمد محمد علي';
        avatarUrl = null;
      } else {
        googleId = dto.idToken.replace(/^(test_token_|DEV_MOCK_|mock_|dev_)/, 'google_id_');
        email = `${googleId}@spidermath.test`;
        fullName = dto.fullName || 'Test Student';
      }
    } else {
      try {
        if (dto.idToken.startsWith('ya29.')) {
          // Real Google OAuth2 Access Token (selected from native Google account chooser popup)
          const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${dto.idToken}` }
          });
          if (!googleRes.ok) {
            throw new AppError('Google OAuth token verification failed. Please re-authenticate.', 401, ERROR_CODES.INVALID_TOKEN_401);
          }
          const googlePayload: any = await googleRes.json();
          googleId = googlePayload.sub;
          email = googlePayload.email;
          fullName = googlePayload.name || 'Spider Student';
          avatarUrl = googlePayload.picture || null;
        } else {
          // Real Google ID Token (Google Identity Services JWT)
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
        }

        if (!email) {
          throw new AppError('Google account does not have an associated verified email address', 400, ERROR_CODES.BAD_REQUEST_400);
        }
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
    // LOGIN INTENT: Reject unregistered users
    // -------------------------------------------------------------------------
    if (dto.intent === 'login') {
      if (!user) {
        throw new AppError(
          'هذا الحساب غير مسجل في المنصة مسبقاً. يرجى إنشاء حساب جديد كطالب أولاً.',
          404,
          ERROR_CODES.STUDENT_NOT_FOUND_404
        );
      }

      // If user registered with Google but hasn't completed their profile yet
      if (!user.is_profile_completed) {
        const token = this.generateToken({
          sub: user._id.toString(),
          role: user.role,
          deviceUuid: dto.deviceUuid,
          studentCode: user.student_code
        });

        return {
          isNewUser: false,
          isProfileCompleted: false,
          isPendingApproval: false,
          token,
          user: {
            id: user._id,
            fullName: user.full_name,
            email: user.email,
            role: user.role,
            avatarUrl: user.avatar_url,
            isProfileCompleted: false
          }
        };
      }
    }

    // -------------------------------------------------------------------------
    // SIGNUP INTENT: Brand New Student (1st Device -> Auto-Approve)
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

    // If user already exists and is in signup intent
    if (dto.intent === 'signup' && !user.is_profile_completed) {
      const token = this.generateToken({
        sub: user._id.toString(),
        role: user.role,
        deviceUuid: dto.deviceUuid,
        studentCode: user.student_code
      });

      return {
        isNewUser: false,
        isProfileCompleted: false,
        isPendingApproval: false,
        token,
        user: {
          id: user._id,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatar_url,
          isProfileCompleted: false
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
    const hasApprovedDevices = Array.isArray(user.approved_devices) && user.approved_devices.length > 0;
    if (!hasApprovedDevices) {
      const firstDevice: IApprovedDevice = {
        device_uuid: dto.deviceUuid,
        device_type: dto.deviceType,
        browser_info: dto.browserInfo,
        ip_address: ipAddress,
        approved_at: new Date()
      };
      user.approved_devices = [firstDevice];
      user.account_lock_status = 'ACTIVE';
      user.pending_device_req = undefined;
      await user.save();
    }

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
   * Registers a brand-new student directly via the platform form without requiring Google.
   */
  public async registerStudentDirect(dto: DirectRegisterStudentDto, ipAddress: string = '127.0.0.1') {
    // Generate sequential HAxxxx code
    const studentCode = await generateStudentHaCode();

    const deviceUuid = dto.deviceUuid || 'device_' + Math.random().toString(36).substring(2, 10);
    const firstDevice: IApprovedDevice = {
      device_uuid: deviceUuid,
      device_type: dto.deviceType || 'Browser Desktop',
      browser_info: dto.browserInfo || 'Spider Math Web Client',
      ip_address: ipAddress,
      approved_at: new Date()
    };

    const user = await UserModel.create({
      student_code: studentCode,
      full_name: dto.fullName.trim(),
      email: dto.email ? dto.email.trim().toLowerCase() : `${studentCode.toLowerCase()}@spidermath.edu`,
      phone: dto.phone.trim(),
      parent_phone: dto.parentPhone.trim(),
      role: ROLES.STUDENT,
      curriculum: dto.curriculum,
      grade_level: dto.gradeLevel,
      academic_term: dto.academicTerm,
      country: dto.country || 'EG',
      governorate: dto.governorate || null,
      avatar_url: dto.avatarUrl || null,
      is_profile_completed: true,
      approved_devices: [firstDevice],
      account_lock_status: 'ACTIVE',
      total_xp: 50,
      has_active_subscription: false
    });

    const token = this.generateToken({
      sub: user._id.toString(),
      role: user.role,
      deviceUuid,
      studentCode
    });

    return {
      studentCode,
      token,
      user: {
        id: user._id,
        _id: user._id,
        studentCode: user.student_code,
        student_ha_code: user.student_code,
        fullName: user.full_name,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        parentPhone: user.parent_phone,
        role: user.role,
        curriculum: user.curriculum,
        gradeLevel: user.grade_level,
        grade_level: user.grade_level,
        academicTerm: user.academic_term,
        academic_term: user.academic_term,
        country: user.country,
        governorate: user.governorate,
        totalXp: user.total_xp,
        total_xp: user.total_xp,
        avatarUrl: user.avatar_url,
        isProfileCompleted: true,
        has_active_subscription: false
      }
    };
  }

  /**
   * Updates an existing student's personal details (Name, Phone, Parent Phone, Avatar, Governorate).
   */
  public async updateStudentProfile(studentId: string, dto: UpdateProfileDto) {
    const user = await UserModel.findById(studentId);
    if (!user) {
      throw new AppError('لم يتم العثور على حساب الطالب', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    const country = user.country || 'EG';

    // 1. If phone updated: validate
    const newPhone = dto.phone ? dto.phone.trim() : user.phone;
    if (dto.phone) {
      const val = validatePhoneNumber(dto.phone, country);
      if (!val.isValid) {
        throw new AppError(val.messageAr, 400, ERROR_CODES.BAD_REQUEST_400);
      }
    }

    // 2. If parentPhone updated: validate
    const newParentPhone = dto.parentPhone ? dto.parentPhone.trim() : user.parent_phone;
    if (dto.parentPhone) {
      const val = validatePhoneNumber(dto.parentPhone, country);
      if (!val.isValid) {
        throw new AppError(val.messageAr, 400, ERROR_CODES.BAD_REQUEST_400);
      }
    }

    // 3. Strict: Parent phone !== Student phone
    if (newPhone && newParentPhone && arePhoneNumbersIdentical(newPhone, newParentPhone, country)) {
      throw new AppError(
        'رقم هاتف ولي الأمر لا يمكن أن يكون مطابقاً لرقم هاتف الطالب نهائياً.',
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    if (dto.fullName) user.full_name = dto.fullName.trim();
    if (dto.phone) user.phone = dto.phone.trim();
    if (dto.parentPhone) user.parent_phone = dto.parentPhone.trim();
    if (dto.avatarUrl !== undefined) user.avatar_url = dto.avatarUrl;
    if (dto.governorate !== undefined) user.governorate = dto.governorate as any;

    await user.save();

    return {
      user: {
        id: user._id,
        _id: user._id,
        studentCode: user.student_code,
        student_ha_code: user.student_code,
        fullName: user.full_name,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        parentPhone: user.parent_phone,
        role: user.role,
        curriculum: user.curriculum,
        gradeLevel: user.grade_level,
        grade_level: user.grade_level,
        academicTerm: user.academic_term,
        academic_term: user.academic_term,
        country: user.country,
        governorate: user.governorate,
        totalXp: user.total_xp,
        total_xp: user.total_xp,
        avatarUrl: user.avatar_url,
        isProfileCompleted: user.is_profile_completed,
        has_active_subscription: user.has_active_subscription
      }
    };
  }

  /**
   * Directly authenticates a student via their unique HAxxxx code.
   */
  public async studentCodeLogin(dto: { student_ha_code: string; deviceUuid?: string }) {
    const code = (dto.student_ha_code || '').trim().toUpperCase();
    const student = await UserModel.findOne({ student_code: code });

    if (!student) {
      throw new AppError(
        `لم يتم العثور على طالب مسجل بالكود: ${code}`,
        404,
        ERROR_CODES.STUDENT_NOT_FOUND_404
      );
    }

    const deviceUuid = dto.deviceUuid || 'browser_student_device';
    const token = this.generateToken({
      sub: student._id.toString(),
      role: student.role,
      deviceUuid,
      studentCode: student.student_code
    });

    return {
      token,
      user: {
        _id: student._id.toString(),
        full_name: student.full_name,
        email: student.email,
        role: student.role,
        student_ha_code: student.student_code,
        curriculum: student.curriculum,
        grade_level: student.grade_level,
        academic_term: student.academic_term,
        total_xp: student.total_xp,
        has_active_subscription: student.has_active_subscription
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

  /**
   * Fetches all registered users/students from Atlas for Super Admin overview.
   */
  public async getAllStudents() {
    return UserModel.find()
      .select('full_name student_code email phone parent_phone curriculum grade_level approved_devices total_xp has_active_subscription account_lock_status role is_profile_completed createdAt')
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Checks whether a specific device UUID is approved for the student.
   * If approved, returns isApproved: true and refreshed token.
   */
  public async checkDeviceStatus(studentId: string, deviceUuid: string) {
    const user = await UserModel.findById(studentId);
    if (!user) {
      throw new AppError('Student not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    const isApproved = (user.approved_devices || []).some(
      (d: IApprovedDevice) => d.device_uuid === deviceUuid
    );

    const pendingStatus = user.pending_device_req?.device_uuid === deviceUuid
      ? user.pending_device_req.status
      : (isApproved ? 'APPROVED' : 'NONE');

    if (isApproved) {
      // Refresh cache so next calls succeed immediately
      deviceWhitelistCache.set(
        `device_whitelist:${user._id}`,
        new Set(user.approved_devices.map((d) => d.device_uuid))
      );

      const token = this.generateToken({
        sub: user._id.toString(),
        role: user.role,
        deviceUuid
      });

      return {
        isApproved: true,
        status: 'APPROVED',
        token,
        user: {
          _id: user._id.toString(),
          student_ha_code: user.student_code,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          parent_phone: user.parent_phone,
          role: user.role,
          curriculum: user.curriculum,
          grade_level: user.grade_level,
          academic_term: user.academic_term,
          total_xp: user.total_xp,
          avatar_url: user.avatar_url,
          has_active_subscription: user.has_active_subscription,
          account_lock_status: 'ACTIVE'
        }
      };
    }

    return {
      isApproved: false,
      status: pendingStatus,
      deviceUuid,
      message: pendingStatus === 'REJECTED'
        ? 'تم رفض هذا الجهاز من قبل المعلمة.'
        : 'الجهاز قيد انتظار موافقة المهندسة هبة عبدالوهاب.'
    };
  }

  /**
   * Logs in official Super Admin and returns real HS512 JWT token.
   */
  public async adminLogin() {
    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN });
    if (!admin) {
      throw new AppError('Super Admin user not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }
    const token = this.generateToken({
      sub: admin._id.toString(),
      role: admin.role,
      deviceUuid: 'admin_primary_device'
    });
    return {
      token,
      user: {
        _id: admin._id.toString(),
        full_name: admin.full_name,
        email: admin.email,
        role: admin.role
      }
    };
  }
}

export const authService = new AuthService();
