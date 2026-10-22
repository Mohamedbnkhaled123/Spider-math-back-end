/**
 * Standard API Response Envelope for Spider Math Educational Platform
 * Guarantees a predictable, typed contract across all REST endpoints.
 */
export interface IApiResponseMeta {
  readonly timestamp: string;
  readonly requestId?: string;
  readonly totalCount?: number;
  readonly page?: number;
  readonly limit?: number;
  readonly [key: string]: unknown;
}

export interface IApiResponseError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface IApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly meta?: IApiResponseMeta;
  readonly error?: IApiResponseError;
}

/**
 * Helper to build unified success responses.
 */
export function createSuccessResponse<T>(data: T, meta?: Partial<IApiResponseMeta>): IApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Helper to build unified error responses.
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: unknown,
  meta?: Partial<IApiResponseMeta>
): IApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}
