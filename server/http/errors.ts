import { NextResponse } from 'next/server';
import { errorResponse } from './envelope';

export class AppError extends Error {
  constructor(
    public override message: string,
    public code: string,
    public statusCode = 500,
    public details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(details: any, message = 'Validation failed') {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHENTICATED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 'CONFLICT', 409);
  }
}

export const handleRouteError = (err: unknown): NextResponse => {
  console.error('Route error caught:', err);
  if (err instanceof AppError) {
    return errorResponse(err.message, err.code, err.details, err.statusCode);
  }

  const message = err instanceof Error ? err.message : 'Internal Server Error';
  return errorResponse(message, 'INTERNAL_SERVER_ERROR', null, 500);
};
