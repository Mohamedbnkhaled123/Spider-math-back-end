import { ErrorCode, ERROR_CODES } from '../constants/error-codes.constant';

/**
 * Custom Operational Application Error
 * Encapsulates HTTP status code, standardized error code string, and optional metadata.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: ErrorCode = ERROR_CODES.INTERNAL_SERVER_ERROR_500,
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}
