import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../common/utils/app-error.util';
import { ERROR_CODES } from '../common/constants/error-codes.constant';
import { createErrorResponse } from '../common/interfaces/api-response.interface';
import { env } from '../config/env.config';

/**
 * Centralized Express Error Handling Middleware
 * Intercepts all operational and unhandled exceptions, formatting them into
 * the unified IApiResponse envelope.
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  let statusCode = 500;
  let errorCode: string = ERROR_CODES.INTERNAL_SERVER_ERROR_500;
  let message = 'An unexpected internal server error occurred';
  let details: unknown = undefined;

  // 1. Handled Operational Errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details;
  }
  // 2. Express JSON Parsing Syntax Error (Malformed Body)
  else if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    statusCode = 400;
    errorCode = ERROR_CODES.BAD_REQUEST_400;
    message = 'Malformed JSON payload in request body';
  }
  // 3. MongoDB Duplicate Key Error (Code 11000)
  else if ('code' in err && (err as { code?: number }).code === 11000) {
    statusCode = 409;
    errorCode = ERROR_CODES.CONFLICT_409;
    message = 'A duplicate resource key was detected';
    const keyValue = (err as unknown as { keyValue?: Record<string, unknown> }).keyValue;
    details = keyValue ? { duplicateField: keyValue } : undefined;
  }
  // 4. Mongoose Validation Error
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR_400;
    message = 'Database schema validation constraint violated';
    details = err.message;
  }
  // 5. Mongoose Cast Error (Invalid ObjectId)
  else if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = ERROR_CODES.BAD_REQUEST_400;
    message = 'Invalid resource identifier format';
  }
  // 6. JSON Web Token Errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = ERROR_CODES.INVALID_TOKEN_401;
    message = 'Authentication token signature is invalid';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = ERROR_CODES.TOKEN_EXPIRED_401;
    message = 'Authentication token has expired';
  }

  // Log internal errors on server console for observability
  if (statusCode >= 500) {
    console.error(`[Unhandled Error] ${req.method} ${req.originalUrl}:`, err);
  }

  // Include stack trace only in development
  const responseDetails =
    env.NODE_ENV === 'development' && statusCode >= 500
      ? { message: err.message, stack: err.stack, originalDetails: details }
      : details;

  const responsePayload = createErrorResponse(errorCode, message, responseDetails, {
    requestId: req.header('X-Request-ID') || undefined
  });

  res.status(statusCode).json(responsePayload);
};
