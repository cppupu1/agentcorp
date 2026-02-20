// API 错误码
export const ERROR_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INVALID_STATE: 'INVALID_STATE',
  LLM_ERROR: 'LLM_ERROR',
  MCP_ERROR: 'MCP_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

// 错误码 → HTTP 状态码映射
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  LLM_ERROR: 502,
  MCP_ERROR: 502,
  INTERNAL_ERROR: 500,
};

// API 错误结构
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Array<{ field: string; rule: string; message: string }>;
  currentStatus?: string;
  requiredStatus?: string;
  references?: Array<{ type: string; id: string; name: string }>;
}

// API 成功响应
export interface ApiResponse<T> {
  data: T;
}

// API 错误响应
export interface ApiErrorResponse {
  error: ApiError;
}
