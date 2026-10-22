import crypto from 'crypto';
import { envConfig } from '../../../config/env.config';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { ROLES, UserRole } from '../../../common/constants/roles.constant';

export type UploadTargetType = 'question' | 'homework';

export interface ICloudinarySignaturePayload {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
  uploadUrl: string;
}

/**
 * CloudinarySignedUploadAdapter (Dual-Folder Direct Client-to-CDN Upload Adapter)
 * Generates short-lived cryptographic upload signatures for:
 * 1. Permanent Teacher Question Prompt Images ('spider-math-questions/') - SUPER_ADMIN only
 * 2. Ephemeral Student Homework Photos ('spider-math-homework/') - STUDENT only
 * Zero Binary Routing Through Express: eliminates serverless execution timeouts and 4.5MB payload limits.
 */
export class CloudinarySignedUploadAdapter {
  static readonly QUESTION_FOLDER = 'spider-math-questions';
  static readonly HOMEWORK_FOLDER = 'spider-math-homework';

  /**
   * Generates a signed upload signature for direct CDN uploads.
   */
  static generateSignature(target: UploadTargetType, userRole: UserRole): ICloudinarySignaturePayload {
    let folder: string;

    if (target === 'question') {
      if (userRole !== ROLES.SUPER_ADMIN) {
        throw new AppError(
          'Unauthorized: Only Super Admin can request upload signatures for question images',
          403,
          ERROR_CODES.ROLE_UNAUTHORIZED_403
        );
      }
      folder = this.QUESTION_FOLDER;
    } else if (target === 'homework') {
      if (userRole !== ROLES.STUDENT) {
        throw new AppError(
          'Unauthorized: Only Students can request upload signatures for homework submissions',
          403,
          ERROR_CODES.ROLE_UNAUTHORIZED_403
        );
      }
      folder = this.HOMEWORK_FOLDER;
    } else {
      throw new AppError(
        `Invalid upload target: ${target}. Must be 'question' or 'homework'`,
        400,
        ERROR_CODES.BAD_REQUEST_400
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signature calculation: sorted params "folder=...&timestamp=..." + api_secret
    const toSign = `folder=${folder}&timestamp=${timestamp}${envConfig.CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    return {
      signature,
      timestamp,
      folder,
      apiKey: envConfig.CLOUDINARY_API_KEY,
      cloudName: envConfig.CLOUDINARY_CLOUD_NAME,
      uploadUrl: `https://api.cloudinary.com/v1_1/${envConfig.CLOUDINARY_CLOUD_NAME}/image/upload`
    };
  }
}
