import type { FastifyInstance, FastifyReply } from 'fastify';
import { ERROR_HTTP_STATUS, type ErrorCode, type ApiError } from '@agentcorp/shared';

export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: ApiError['details'];
  currentStatus?: string;
  requiredStatus?: string;
  references?: ApiError['references'];

  constructor(code: ErrorCode, message: string, extra?: Partial<Pick<ApiError, 'details' | 'currentStatus' | 'requiredStatus' | 'references'>>) {
    super(message);
    this.code = code;
    this.statusCode = ERROR_HTTP_STATUS[code];
    if (extra) Object.assign(this, extra);
  }
}

export function sendError(reply: FastifyReply, err: AppError) {
  const body: { error: ApiError } = {
    error: {
      code: err.code,
      message: err.message,
    },
  };
  if (err.details) body.error.details = err.details;
  if (err.currentStatus) body.error.currentStatus = err.currentStatus;
  if (err.requiredStatus) body.error.requiredStatus = err.requiredStatus;
  if (err.references) body.error.references = err.references;

  return reply.status(err.statusCode).send(body);
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: Error & { validation?: unknown }, _request, reply) => {
    if (error instanceof AppError) {
      return sendError(reply, error);
    }

    // Fastify validation errors
    if (error.validation) {
      const appErr = new AppError('VALIDATION_ERROR', error.message);
      return sendError(reply, appErr);
    }

    console.error('Unhandled error:', error);
    const appErr = new AppError('INTERNAL_ERROR', 'Internal server error');
    return sendError(reply, appErr);
  });
}
