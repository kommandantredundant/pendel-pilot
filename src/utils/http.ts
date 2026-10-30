export interface ApiSuccess<T> {
  success: true;
  data: T;
  attribution?: Record<string, string>;
  telemetryEvents?: string[];
  telemetryPayload?: unknown;
}

export interface ApiError {
  success: false;
  telemetryEvents?: string[];
  telemetryPayload?: unknown;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function json<T>(body: ApiSuccess<T> | ApiError, init: ResponseInit = {}): Response {
  return Response.json(body, {
    headers: { 'content-type': 'application/json; charset=utf-8', ...init.headers },
    ...init
  });
}

export function validationError(message: string, details?: unknown): Response {
  return json({ success: false, error: { code: 'VALIDATION_ERROR', message, details } }, { status: 400 });
}
