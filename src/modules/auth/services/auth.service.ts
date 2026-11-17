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
import { UserModel, IApprovedDevice, IUserDocument } from '../../../models/user.model';
import { SubscriptionModel } from '../../../models/subscription.model';
import { NotificationModel } from '../../../models/notification.model';
import { PlacementAttemptModel } from '../../../models/placement-attempt.model';
import { CmsConfigModel } from '../../../models/cms-config.model';
import { GoogleLoginDto } from '../dto/google-login.dto';
import {
  AdminLoginDto,
  SetupAccessCodeDto,
  TeacherGoogleLoginDto,
  UpdateAdminSecurityDto
} from '../dto/admin-portal-auth.dto';
import { CompleteProfileDto } from '../dto/complete-profile.dto';
import { ParentActivateLoginDto, ParentLinkChildDto } from '../dto/parent-auth.dto';
import { DirectRegisterStudentDto } from '../dto/direct-register.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { DeviceDecisionDto } from '../dto/device-decision.dto';
import { validatePhoneNumber, arePhoneNumbersIdentical } from '../../../common/utils/phone-validator.util';
import { hashAccessCode, verifyAccessCode } from '../../../common/utils/access-code-hash.util';
import { IJwtPayload } from '../../../common/interfaces/auth-payload.interface';
import { primeStudentLastSeenThrottle } from '../../../middlewares/auth.middleware';
import { PresenceTrackerService } from '../../parent-portal/services/presence-tracker.service';

const ADMIN_AUTH_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const ADMIN_AUTH_MAX_ATTEMPTS = 15;

export class AuthService {
  private googleClient: OAuth2Client;
  private adminAuthAttempts = new Map<string, { count: number; resetAt: number }>();

  constructor() {
    this.googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }

  private enforceAdminAuthRateLimit(bucketKey: string): void {
    const now = Date.now();
    const record = this.adminAuthAttempts.get(bucketKey);
    if (!record || record.resetAt <= now) {
      this.adminAuthAttempts.set(bucketKey, { count: 1, resetAt: now + ADMIN_AUTH_ATTEMPT_WINDOW_MS });
      return;
    }
    if (record.count >= ADMIN_AUTH_MAX_ATTEMPTS) {
      throw new AppError(
        'تم تجاوز الحد المسموح لمحاولات الدخول. يرجى الانتظار 5 دقائق.',
        429,
        ERROR_CODES.TOO_MANY_REQUESTS_429
      );
    }
    record.count += 1;
  }

  private clearAdminAuthRateLimit(bucketKey: string): void {
    this.adminAuthAttempts.delete(bucketKey);
  }

  /**
   * Verifies either a Google OAuth2 Access Token (ya29...) or GIS ID Token and returns normalized identity.
   */
  private async verifyGoogleOAuthToken(
    idToken: string,
    emailOverride?: string,
    fullNameOverride?: string
  ): Promise<{ googleId: string; email: string; fullName: string; avatarUrl: string | null }> {
    let googleId: string;
    let email: string | undefined;
    let fullName: string;
    let avatarUrl: string | null = null;

    if (
      env.NODE_ENV !== 'production' &&
      (idToken === 'DEV_MOCK_GOOGLE_TOKEN' ||
        idToken.startsWith('DEV_MOCK_') ||
        idToken.startsWith('test_token_') ||
        idToken.startsWith('mock_') ||
        idToken.startsWith('dev_'))
    ) {
      if (emailOverride) {
        email = emailOverride.trim().toLowerCase();
        googleId = `gid_${Buffer.from(email).toString('hex').slice(0, 24)}`;
        fullName = fullNameOverride?.trim() || (email.split('@')[0] as string) || 'طالب سبايدر ماث';
      } else if (idToken === 'DEV_MOCK_GOOGLE_TOKEN') {
        googleId = 'mock-google-id-111122223333';
        email = 'student.test@spidermath.com';
        fullName = 'أحمد محمد علي';
      } else {
        googleId = idToken.replace(/^(test_token_|DEV_MOCK_|mock_|dev_)/, 'google_id_');
        email = `${googleId}@spidermath.test`;
        fullName = fullNameOverride || 'Test Student';
      }
      return { googleId, email, fullName, avatarUrl };
    }

    try {
      if (idToken.startsWith('ya29.')) {
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        if (!googleRes.ok) {
          throw new AppError('Google OAuth token verification failed. Please re-authenticate.', 401, ERROR_CODES.INVALID_TOKEN_401);
        }
        const googlePayload: any = await googleRes.json();
        googleId = googlePayload.sub;
        email = typeof googlePayload.email === 'string' ? googlePayload.email.trim().toLowerCase() : undefined;
        fullName = googlePayload.name || 'Spider Math User';
        avatarUrl = googlePayload.picture || null;
      } else {
        const ticket = await this.googleClient.verifyIdToken({
          idToken,
          audience: env.GOOGLE_CLIENT_ID
        });
        const googlePayload = ticket.getPayload();

        if (!googlePayload || !googlePayload.sub) {
          throw new AppError('Invalid Google ID Token payload', 401, ERROR_CODES.INVALID_TOKEN_401);
        }

        googleId = googlePayload.sub;
        email = typeof googlePayload.email === 'string' ? googlePayload.email.trim().toLowerCase() : undefined;
        fullName = googlePayload.name || 'Spider Math User';
        avatarUrl = googlePayload.picture || null;
      }

      if (!email) {
        throw new AppError('Google account does not have an associated verified email address', 400, ERROR_CODES.BAD_REQUEST_400);
      }

      return { googleId, email, fullName, avatarUrl };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        `Google OAuth verification failed: ${err.message}`,
        401,
        ERROR_CODES.INVALID_TOKEN_401
      );
    }
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
    const { googleId, email, fullName, avatarUrl } = await this.verifyGoogleOAuthToken(
      dto.idToken,
      dto.email,
      dto.fullName
    );

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
        if (user.role === ROLES.STUDENT) {
          primeStudentLastSeenThrottle(user._id.toString());
          UserModel.updateOne({ _id: user._id }, { $set: { last_seen_at: new Date() } }).catch(() => {});
        }
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
            _id: user._id.toString(),
            fullName: user.full_name,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            avatarUrl: user.avatar_url,
            avatar_url: user.avatar_url,
            has_active_subscription: user.has_active_subscription,
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
        account_lock_status: 'ACTIVE',
        last_seen_at: new Date()
      });

      primeStudentLastSeenThrottle(user._id.toString());

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
          _id: user._id.toString(),
          fullName: user.full_name,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          parentPhone: user.parent_phone,
          parent_phone: user.parent_phone,
          country: user.country,
          governorate: user.governorate,
          role: user.role,
          avatarUrl: user.avatar_url,
          avatar_url: user.avatar_url,
          has_active_subscription: user.has_active_subscription,
          isProfileCompleted: user.is_profile_completed
        }
      };
    }

    // If user already exists and is in signup intent
    if (dto.intent === 'signup' && !user.is_profile_completed) {
      if (user.role === ROLES.STUDENT) {
        primeStudentLastSeenThrottle(user._id.toString());
        UserModel.updateOne({ _id: user._id }, { $set: { last_seen_at: new Date() } }).catch(() => {});
      }
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
          _id: user._id.toString(),
          fullName: user.full_name,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          parentPhone: user.parent_phone,
          parent_phone: user.parent_phone,
          country: user.country,
          governorate: user.governorate,
          role: user.role,
          avatarUrl: user.avatar_url,
          avatar_url: user.avatar_url,
          has_active_subscription: user.has_active_subscription,
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
      if (user.role === ROLES.STUDENT) {
        primeStudentLastSeenThrottle(user._id.toString());
        UserModel.updateOne({ _id: user._id }, { $set: { last_seen_at: new Date() } }).catch(() => {});
      }

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
          _id: user._id.toString(),
          studentCode: user.student_code,
          student_ha_code: user.student_code,
          fullName: user.full_name,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          parentPhone: user.parent_phone,
          parent_phone: user.parent_phone,
          country: user.country,
          governorate: user.governorate,
          role: user.role,
          curriculum: user.curriculum,
          gradeLevel: user.grade_level,
          grade_level: user.grade_level,
          academicTerm: user.academic_term,
          academic_term: user.academic_term,
          totalXp: user.total_xp,
          total_xp: user.total_xp,
          avatarUrl: user.avatar_url,
          avatar_url: user.avatar_url,
          has_active_subscription: user.has_active_subscription,
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
    const cms = await CmsConfigModel.findOne({ singleton_key: 'MAIN_SITE_CONFIG' }).select('active_academic_term').lean();
    user.academic_term = dto.academicTerm || cms?.active_academic_term || 'TERM_1';
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
        _id: user._id.toString(),
        studentCode: user.student_code,
        student_ha_code: user.student_code,
        fullName: user.full_name,
        full_name: user.full_name,
        phone: user.phone,
        parentPhone: user.parent_phone,
        parent_phone: user.parent_phone,
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
        avatar_url: user.avatar_url,
        has_active_subscription: user.has_active_subscription,
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
      academic_term: dto.academicTerm || (await CmsConfigModel.findOne({ singleton_key: 'MAIN_SITE_CONFIG' }).select('active_academic_term').lean())?.active_academic_term || 'TERM_1',
      country: dto.country || 'EG',
      governorate: dto.governorate || null,
      avatar_url: dto.avatarUrl || null,
      is_profile_completed: true,
      approved_devices: [firstDevice],
      account_lock_status: 'ACTIVE',
      total_xp: 50,
      has_active_subscription: false,
      last_seen_at: new Date()
    });

    primeStudentLastSeenThrottle(user._id.toString());

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
        parent_phone: user.parent_phone,
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
        avatar_url: user.avatar_url,
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
    const avatar = dto.avatarUrl !== undefined ? dto.avatarUrl : (dto as any).avatar_url;
    if (avatar !== undefined) user.avatar_url = avatar;
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
        avatar_url: user.avatar_url,
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

    // 1. Check if the device is approved
    const isDeviceApproved = Array.isArray(student.approved_devices) && student.approved_devices.some(
      (d) => d.device_uuid === deviceUuid
    );

    // 2. If approved, generate token and update cache
    if (isDeviceApproved) {
      primeStudentLastSeenThrottle(student._id.toString());
      UserModel.updateOne({ _id: student._id }, { $set: { last_seen_at: new Date() } }).catch(() => {});

      deviceWhitelistCache.set(
        `device_whitelist:${student._id}`,
        new Set(student.approved_devices.map((d) => d.device_uuid)),
        30 * 60 * 1000
      );

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
          id: student._id.toString(),
          full_name: student.full_name,
          fullName: student.full_name,
          email: student.email,
          role: student.role,
          student_ha_code: student.student_code,
          studentCode: student.student_code,
          curriculum: student.curriculum,
          grade_level: student.grade_level,
          gradeLevel: student.grade_level,
          academic_term: student.academic_term,
          academicTerm: student.academic_term,
          total_xp: student.total_xp,
          totalXp: student.total_xp,
          has_active_subscription: student.has_active_subscription,
          avatar_url: student.avatar_url,
          avatarUrl: student.avatar_url,
          phone: student.phone,
          parent_phone: student.parent_phone,
          parentPhone: student.parent_phone,
          country: student.country,
          governorate: student.governorate,
          isProfileCompleted: student.is_profile_completed
        }
      };
    }

    // 3. If device is not registered in approved_devices, log pending request and throw HTTP 423
    await UserModel.findByIdAndUpdate(student._id, {
      $set: {
        pending_device_req: {
          device_uuid: deviceUuid,
          device_type: 'Web Device',
          browser_info: 'Browser Client',
          ip_address: '127.0.0.1',
          requested_at: new Date(),
          status: 'PENDING'
        }
      }
    });

    throw new AppError(
      'هذا الجهاز جديد وبانتظار اعتماد م/ هبة عبدالوهاب قبل السماح بالدخول.',
      423,
      ERROR_CODES.DEVICE_PENDING_APPROVAL_423,
      {
        deviceUuid,
        accountLockStatus: 'PENDING_DEVICE_APPROVAL',
        existingDevicesActive: true,
        studentId: student._id
      }
    );
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
    const parent = await UserModel.findById(parentId);
    if (!parent || parent.role !== ROLES.PARENT) {
      throw new AppError('Parent account not found', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    const code = (dto.studentCode || (dto as any).student_ha_code || '').trim().toUpperCase();
    const student = await UserModel.findOne({ student_code: code });

    if (!student || student.role !== ROLES.STUDENT) {
      throw new AppError(
        'كود الطالب غير صحيح أو لم يتم العثور على حساب الطالب.',
        404,
        ERROR_CODES.STUDENT_NOT_FOUND_404
      );
    }

    // Strict verification: student's registered parent phone must match current parent's phone
    const country = (student as any).country || 'EG';
    const isPhoneMatched = arePhoneNumbersIdentical(parent.phone || '', student.parent_phone || '', country);

    if (!isPhoneMatched) {
      throw new AppError(
        'كود الطالب غير صحيح أو غير مرتبط برقم هاتف ولي الأمر المسجل.',
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    const updatedParent = await UserModel.findByIdAndUpdate(
      parentId,
      { $addToSet: { linked_children: student._id } },
      { new: true }
    ).populate('linked_children', 'full_name student_code curriculum grade_level total_xp avatar_url');

    return {
      parent: {
        id: updatedParent!._id,
        fullName: updatedParent!.full_name,
        linkedChildren: updatedParent!.linked_children
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
   * Strictly filters out SUPER_ADMIN, ADMIN, and TEACHER accounts.
   */
  public async getAllStudents() {
    const students = await UserModel.find({
      role: { $nin: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] }
    })
      .select('full_name student_code email phone parent_phone curriculum grade_level avatar_url approved_devices total_xp has_active_subscription account_lock_status role is_profile_completed is_leaderboard_hidden createdAt last_seen_at')
      .sort({ createdAt: -1 })
      .lean();

    const studentIds = students.map((s) => s._id);
    const activeSubs = await SubscriptionModel.find({
      student_id: { $in: studentIds },
      subscription_status: 'ACTIVE',
      expires_at: { $gt: new Date() }
    }).select('student_id').lean();

    const activeSet = new Set(activeSubs.map((sub) => sub.student_id.toString()));

    return students.map((s) => {
      const studentIdStr = s._id.toString();
      const ramPresence = PresenceTrackerService.getPresence(studentIdStr);
      const lastSeenAt = ramPresence.lastHeartbeatAt || s.last_seen_at || null;
      const diff = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() : Infinity;
      const isOnline = ramPresence.isOnline || (!!lastSeenAt && diff >= -60 * 1000 && diff < 3 * 60 * 1000);

      return {
        ...s,
        avatarUrl: s.avatar_url,
        avatar_url: s.avatar_url,
        has_active_subscription: activeSet.has(studentIdStr) || !!s.has_active_subscription,
        last_seen_at: lastSeenAt,
        lastSeenAt,
        is_online: isOnline,
        isOnline
      };
    });
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

  private buildAdminAuthSession(admin: IUserDocument, portalScope: 'teacher' | 'dev') {
    const token = this.generateToken({
      sub: admin._id.toString(),
      role: admin.role,
      deviceUuid: portalScope === 'dev' ? 'dev_primary_device' : 'admin_primary_device'
    });
    return {
      token,
      portalScope,
      user: {
        _id: admin._id.toString(),
        full_name: admin.full_name,
        email: admin.teacher_google_email || admin.email,
        role: admin.role
      }
    };
  }

  private getConfiguredAdminEmails(admin: IUserDocument): Set<string> {
    const allowed = new Set<string>();
    if (admin.teacher_google_email) {
      allowed.add(admin.teacher_google_email.trim().toLowerCase());
    }
    const envEmails = (env.ADMIN_GOOGLE_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    for (const email of envEmails) {
      allowed.add(email);
    }
    if (
      admin.email &&
      !admin.email.endsWith('@spidermath.com') &&
      !admin.email.endsWith('@spidermath.edu') &&
      !admin.email.endsWith('@spidermath.test')
    ) {
      allowed.add(admin.email.trim().toLowerCase());
    }
    return allowed;
  }

  /**
   * Public status probe for hidden admin portals.
   * Exposes ONLY setup booleans — never hashes or emails.
   */
  public async getAdminPortalStatus() {
    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN })
      .select('+teacher_access_code_hash +dev_access_code_hash teacher_google_email email');
    if (!admin) {
      return {
        teacherCodeSet: false,
        teacherGoogleSet: false,
        devCodeSet: false
      };
    }
    const allowedEmails = this.getConfiguredAdminEmails(admin);
    return {
      teacherCodeSet: Boolean(admin.teacher_access_code_hash),
      teacherGoogleSet: allowedEmails.size > 0,
      devCodeSet: Boolean(admin.dev_access_code_hash)
    };
  }

  /**
   * One-time setup for Teacher access code (5-click Footer entry when uninitialized).
   */
  public async setupTeacherAccessCode(dto: SetupAccessCodeDto, ipAddress?: string) {
    const bucketKey = `teacher_setup:${ipAddress || 'unknown'}`;
    this.enforceAdminAuthRateLimit(bucketKey);

    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN })
      .select('+teacher_access_code_hash +dev_access_code_hash');
    if (!admin) {
      throw new AppError('Super Admin account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    if (admin.teacher_access_code_hash || admin.teacher_google_email) {
      throw new AppError(
        'تم تسجيل بيانات دخول المعلمة مسبقاً. يمكنك تعديلها من داخل لوحة التحكم فقط.',
        403,
        ERROR_CODES.FORBIDDEN_403
      );
    }

    if (admin.dev_access_code_hash && verifyAccessCode(dto.accessCode, admin.dev_access_code_hash)) {
      throw new AppError(
        'يجب اختيار كود مختلف عن كود المطور.',
        409,
        ERROR_CODES.CONFLICT_409
      );
    }

    const updated = await UserModel.findOneAndUpdate(
      {
        _id: admin._id,
        role: ROLES.SUPER_ADMIN,
        $or: [{ teacher_access_code_hash: null }, { teacher_access_code_hash: { $exists: false } }]
      },
      { $set: { teacher_access_code_hash: hashAccessCode(dto.accessCode) } },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        'تم تسجيل كود المعلمة مسبقاً.',
        403,
        ERROR_CODES.FORBIDDEN_403
      );
    }

    this.clearAdminAuthRateLimit(bucketKey);
    return this.buildAdminAuthSession(updated, 'teacher');
  }

  /**
   * Strict one-time registration for Developer secret code (12-click Navbar entry).
   */
  public async setupDevAccessCode(dto: SetupAccessCodeDto, ipAddress?: string) {
    const bucketKey = `dev_setup:${ipAddress || 'unknown'}`;
    this.enforceAdminAuthRateLimit(bucketKey);

    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN })
      .select('+teacher_access_code_hash +dev_access_code_hash');
    if (!admin) {
      throw new AppError('Super Admin account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    if (admin.dev_access_code_hash) {
      throw new AppError(
        'تم تسجيل كود المطور مسبقاً — التسجيل عبر هذا المدخل متاح لمرة واحدة فقط.',
        403,
        ERROR_CODES.FORBIDDEN_403
      );
    }

    if (admin.teacher_access_code_hash && verifyAccessCode(dto.accessCode, admin.teacher_access_code_hash)) {
      throw new AppError(
        'يجب أن يكون كود المطور مختلفاً عن كود دخول المعلمة.',
        409,
        ERROR_CODES.CONFLICT_409
      );
    }

    const updated = await UserModel.findOneAndUpdate(
      {
        _id: admin._id,
        role: ROLES.SUPER_ADMIN,
        $or: [{ dev_access_code_hash: null }, { dev_access_code_hash: { $exists: false } }]
      },
      { $set: { dev_access_code_hash: hashAccessCode(dto.accessCode) } },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        'تم تسجيل كود المطور مسبقاً — التسجيل متاح لمرة واحدة فقط.',
        403,
        ERROR_CODES.FORBIDDEN_403
      );
    }

    this.clearAdminAuthRateLimit(bucketKey);
    return this.buildAdminAuthSession(updated, 'dev');
  }

  /**
   * Authenticates Teacher (5-click Footer) or Developer (12-click Nav) using salted scrypt verification.
   */
  public async adminLogin(dto: AdminLoginDto, ipAddress?: string) {
    const mode = dto.mode === 'dev' ? 'dev' : 'teacher';
    const bucketKey = `admin_login:${mode}:${ipAddress || 'unknown'}`;
    this.enforceAdminAuthRateLimit(bucketKey);

    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN })
      .select('+teacher_access_code_hash +dev_access_code_hash');
    if (!admin) {
      throw new AppError('Super Admin user not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    const targetHash = mode === 'dev' ? admin.dev_access_code_hash : admin.teacher_access_code_hash;
    if (!targetHash) {
      throw new AppError(
        mode === 'dev' ? 'لم يتم تعيين كود المطور بعد.' : 'لم يتم تعيين كود المعلمة بعد.',
        401,
        ERROR_CODES.INVALID_CREDENTIALS_401
      );
    }

    if (!verifyAccessCode(dto.accessCode, targetHash)) {
      throw new AppError('كود الدخول السري غير صحيح.', 401, ERROR_CODES.INVALID_CREDENTIALS_401);
    }

    this.clearAdminAuthRateLimit(bucketKey);
    return this.buildAdminAuthSession(admin, mode);
  }

  /**
   * Authenticates Eng. Heba (Teacher Super Admin) using Google OAuth from the 5-click Footer portal.
   * On initial setup (when neither Teacher Code nor Teacher Google Email exists), binds her Gmail once.
   */
  public async teacherGoogleLogin(dto: TeacherGoogleLoginDto, ipAddress?: string) {
    const bucketKey = `teacher_google:${ipAddress || 'unknown'}`;
    this.enforceAdminAuthRateLimit(bucketKey);

    const { email, googleId } = await this.verifyGoogleOAuthToken(dto.idToken, dto.email, dto.fullName);
    const normalizedEmail = email.trim().toLowerCase();

    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN })
      .select('+teacher_access_code_hash');
    if (!admin) {
      throw new AppError('Super Admin user not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    const allowedEmails = this.getConfiguredAdminEmails(admin);

    if (allowedEmails.size > 0) {
      if (!allowedEmails.has(normalizedEmail)) {
        throw new AppError(
          'حساب Google هذا غير مصرح له بالدخول إلى لوحة المعلمة.',
          403,
          ERROR_CODES.FORBIDDEN_403
        );
      }
      if (!admin.teacher_google_email) {
        await UserModel.updateOne(
          { _id: admin._id },
          { $set: { teacher_google_email: normalizedEmail } }
        ).catch(() => {});
      }
      if (!admin.google_id && googleId && !googleId.startsWith('mock')) {
        await UserModel.updateOne(
          { _id: admin._id, $or: [{ google_id: null }, { google_id: { $exists: false } }] },
          { $set: { google_id: googleId } }
        ).catch(() => {});
      }
      this.clearAdminAuthRateLimit(bucketKey);
      return this.buildAdminAuthSession(admin, 'teacher');
    }

    // Teacher code already exists without bound Gmail: block unauthenticated Google binding
    if (admin.teacher_access_code_hash) {
      throw new AppError(
        'لم يتم ربط حساب Google للمعلمة بعد. يرجى الدخول بالكود السري وربط إيميلك من إعدادات الإدارة.',
        403,
        ERROR_CODES.FORBIDDEN_403
      );
    }

    // First-time Teacher setup with Google Email (atomic once-only bind)
    const existingOtherUser = await UserModel.findOne({
      email: normalizedEmail,
      _id: { $ne: admin._id }
    }).select('_id role');
    if (existingOtherUser) {
      throw new AppError(
        'هذا البريد مسجل مسبقاً كحساب طالب أو ولي أمر ولا يمكن ربطه كحساب إدارة.',
        409,
        ERROR_CODES.EMAIL_ALREADY_REGISTERED_409
      );
    }

    const updated = await UserModel.findOneAndUpdate(
      {
        _id: admin._id,
        role: ROLES.SUPER_ADMIN,
        $or: [
          { teacher_google_email: null },
          { teacher_google_email: '' },
          { teacher_google_email: { $exists: false } }
        ]
      },
      { $set: { teacher_google_email: normalizedEmail } },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        'تم ربط حساب Google مسبقاً بحساب مختلف.',
        403,
        ERROR_CODES.FORBIDDEN_403
      );
    }

    this.clearAdminAuthRateLimit(bucketKey);
    return this.buildAdminAuthSession(updated, 'teacher');
  }

  /**
   * Returns current Admin & Developer security status (authenticated Super Admin only).
   */
  public async getAdminSecuritySettings() {
    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN })
      .select('+teacher_access_code_hash +dev_access_code_hash teacher_google_email email');
    if (!admin) {
      throw new AppError('Super Admin account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }
    return {
      teacherCodeSet: Boolean(admin.teacher_access_code_hash),
      teacherGoogleEmail: admin.teacher_google_email || '',
      devCodeSet: Boolean(admin.dev_access_code_hash)
    };
  }

  /**
   * Updates Admin/Teacher Google Email, Teacher Access Code, or Developer Code inside authenticated Admin Dashboard.
   */
  public async updateAdminSecuritySettings(dto: UpdateAdminSecurityDto) {
    const admin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN })
      .select('+teacher_access_code_hash +dev_access_code_hash');
    if (!admin) {
      throw new AppError('Super Admin account not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    const updates: Record<string, any> = {};

    if (dto.teacherGoogleEmail !== undefined) {
      const normalized = (dto.teacherGoogleEmail || '').trim().toLowerCase();
      if (!normalized) {
        updates.teacher_google_email = null;
      } else {
        const collision = await UserModel.findOne({
          email: normalized,
          _id: { $ne: admin._id }
        }).select('_id');
        if (collision) {
          throw new AppError(
            'هذا البريد مسجل لحساب طالب أو ولي أمر ولا يمكن ربطه للإدارة.',
            409,
            ERROR_CODES.EMAIL_ALREADY_REGISTERED_409
          );
        }
        updates.teacher_google_email = normalized;
      }
    }

    if (dto.newTeacherCode) {
      if (admin.dev_access_code_hash && verifyAccessCode(dto.newTeacherCode, admin.dev_access_code_hash)) {
        throw new AppError('يجب اختيار كود للمعلمة مختلف عن كود المطور.', 409, ERROR_CODES.CONFLICT_409);
      }
      if (dto.newDevCode && dto.newTeacherCode.trim() === dto.newDevCode.trim()) {
        throw new AppError('يجب اختيار كودين مختلفين للمعلمة والمطور.', 409, ERROR_CODES.CONFLICT_409);
      }
      updates.teacher_access_code_hash = hashAccessCode(dto.newTeacherCode);
    }

    if (dto.newDevCode) {
      if (admin.dev_access_code_hash) {
        if (!dto.currentDevCode || !verifyAccessCode(dto.currentDevCode, admin.dev_access_code_hash)) {
          throw new AppError(
            'يرجى إدخال كود المطور الحالي بشكل صحيح لتحديثه.',
            401,
            ERROR_CODES.INVALID_CREDENTIALS_401
          );
        }
      }
      if (admin.teacher_access_code_hash && verifyAccessCode(dto.newDevCode, admin.teacher_access_code_hash)) {
        throw new AppError('يجب اختيار كود مطور مختلف عن كود المعلمة.', 409, ERROR_CODES.CONFLICT_409);
      }
      updates.dev_access_code_hash = hashAccessCode(dto.newDevCode);
    }

    if (Object.keys(updates).length > 0) {
      await UserModel.updateOne({ _id: admin._id }, { $set: updates });
    }

    return this.getAdminSecuritySettings();
  }
}

export const authService = new AuthService();
