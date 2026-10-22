import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../common/utils/app-error.util';
import { ERROR_CODES } from '../common/constants/error-codes.constant';

export interface IRequestValidationSchema {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

/**
 * Generic Express Middleware for Zod Request Validation
 * Validates body, query, params, and headers before controller invocation.
 */
export function validateRequest(schemas: IRequestValidationSchema) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
      }

      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as typeof req.query;
      }

      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }

      if (schemas.headers) {
        // Headers are case-insensitive in Node; schema must account for lowercase keys
        await schemas.headers.parseAsync(req.headers);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          rule: err.code
        }));

        next(
          new AppError(
            'Request validation failed',
            400,
            ERROR_CODES.VALIDATION_ERROR_400,
            formattedErrors
          )
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Convenient shorthand for validating request body with Zod schema.
 */
export function validateBody(schema: ZodSchema) {
  return validateRequest({ body: schema });
}
