import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { createSuccessResponse, createErrorResponse } from '../../../common/interfaces/api-response.interface';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { AppError } from '../../../common/utils/app-error.util';

export class AuthController {
  /**
   * POST /api/v1/auth/google-login
   */
  public async googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
 
      const result = await authService.loginWithGoogle(req.body, req.ip);

      if (result.isPendingApproval) {
        res.status(423).json(
          createErrorResponse(
            ERROR_CODES.DEVICE_PENDING_APPROVAL_423,
            result.message || 'Waiting for Eng. Heba Abdel-Wahab approval for this device',
            {
              existingDevicesActive: result.existingDevicesActive,
              deviceUuid: result.deviceUuid,
              studentId: result.studentId
            }
          )
        );
        return;
      }

      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/complete-student-profile
   */
  public async completeStudentProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.user!.sub;
      const result = await authService.completeStudentProfile(studentId, req.body);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/register-student-direct
   */
  public async registerStudentDirect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.registerStudentDirect(req.body, req.ip);
      res.status(201).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/auth/profile
   */
  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.user!.sub;
      const result = await authService.updateStudentProfile(studentId, req.body);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/student-code-login
   */
  public async studentCodeLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.studentCodeLogin({
        student_ha_code: req.body.student_ha_code,
        deviceUuid: req.header('X-Device-UUID') || req.body.deviceUuid
      });
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/parent-activate-login
   */
  public async parentActivateLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.parentActivateLogin(req.body, req.ip);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/parent/link-additional-child
   */
  public async parentLinkAdditionalChild(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parentId = req.user!.sub;
      const result = await authService.parentLinkAdditionalChild(parentId, req.body);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/device-requests
   */
  public async getPendingDeviceRequests(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requests = await authService.getPendingDeviceRequests();
      res.status(200).json(createSuccessResponse(requests, { totalCount: requests.length }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/device-requests/:studentId/decide
   */
  public async decideDeviceRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.studentId!;
      const result = await authService.decideDeviceRequest(studentId, req.body);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/admin/users/students
   */
  public async getAllStudents(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const students = await authService.getAllStudents();
      res.status(200).json(createSuccessResponse(students, { totalCount: students.length }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/admin-login
   */
  public async adminLogin(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.adminLogin();
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/device-status
   * POST /api/v1/auth/check-device-status
   */
  public async checkDeviceStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.user?.sub;
      if (!studentId) {
        throw new AppError('Unauthorized', 401, ERROR_CODES.UNAUTHORIZED_401);
      }
      const deviceUuid = req.deviceUuid || req.header('X-Device-UUID') || (req.body && req.body.deviceUuid);
      if (!deviceUuid) {
        throw new AppError('Missing device UUID', 400, ERROR_CODES.INVALID_DEVICE_HEADER_400);
      }
      const result = await authService.checkDeviceStatus(studentId, deviceUuid);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
