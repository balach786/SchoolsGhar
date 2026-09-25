/**
 * Centralized API error with HTTP status + machine code.
 * All business errors flow through this class and are handled
 * by the centralized error middleware — never leak stack traces
 * or sensitive details to clients.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) {
    return new ApiError(400, message, code, details);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }
  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }
  static conflict(message: string, code = 'CONFLICT', details?: unknown) {
    return new ApiError(409, message, code, details);
  }
  static unprocessable(message: string, code = 'UNPROCESSABLE', details?: unknown) {
    return new ApiError(422, message, code, details);
  }
  static tooManyRequests(message = 'Too many requests, please slow down') {
    return new ApiError(429, message, 'RATE_LIMITED');
  }
}
