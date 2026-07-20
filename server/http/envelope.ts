import { NextResponse } from 'next/server';

export interface SuccessEnvelope<T> {
  success: true;
  message: string;
  data: T;
  requestId: string;
}

export interface ErrorDetails {
  code: string;
  details?: any;
}

export interface ErrorEnvelope {
  success: false;
  message: string;
  error: ErrorDetails;
  requestId: string;
}

export function generateRequestId(): string {
  return 'req_' + Math.random().toString(36).substring(2, 15);
}

export function okResponse<T>(
  data: T,
  message = 'OK',
  status = 200,
  headers?: HeadersInit
): NextResponse<SuccessEnvelope<T>> {
  const requestId = generateRequestId();
  return NextResponse.json(
    {
      success: true,
      message,
      data,
      requestId,
    },
    {
      status,
      headers,
    }
  );
}

export function errorResponse(
  message: string,
  code: string,
  details?: any,
  status = 500,
  headers?: HeadersInit
): NextResponse<ErrorEnvelope> {
  const requestId = generateRequestId();
  return NextResponse.json(
    {
      success: false,
      message,
      error: {
        code,
        details,
      },
      requestId,
    },
    {
      status,
      headers,
    }
  );
}
