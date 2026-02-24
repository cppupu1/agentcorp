// 任务状态
export const TASK_STATUS = {
  DRAFT: 'draft',
  ALIGNING: 'aligning',
  BRIEF_REVIEW: 'brief_review',
  TEAM_REVIEW: 'team_review',
  PLAN_REVIEW: 'plan_review',
  EXECUTING: 'executing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

// 子任务状态
export const SUBTASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
} as const;

export type SubtaskStatus = (typeof SUBTASK_STATUS)[keyof typeof SUBTASK_STATUS];

// 模型状态
export const MODEL_STATUS = {
  UNTESTED: 'untested',
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
} as const;

export type ModelStatus = (typeof MODEL_STATUS)[keyof typeof MODEL_STATUS];

// 工具状态（同模型状态）
export type ToolStatus = ModelStatus;

// 任务模式
export const TASK_MODE = {
  SUGGEST: 'suggest',
  AUTO: 'auto',
} as const;

export type TaskMode = (typeof TASK_MODE)[keyof typeof TASK_MODE];

// 协作模式
export const COLLABORATION_MODE = {
  FREE: 'free',
  PIPELINE: 'pipeline',
  DEBATE: 'debate',
  VOTE: 'vote',
  MASTER_SLAVE: 'master_slave',
} as const;

export type CollaborationMode = (typeof COLLABORATION_MODE)[keyof typeof COLLABORATION_MODE];

// 团队成员角色
export const MEMBER_ROLE = {
  MEMBER: 'member',
  OBSERVER: 'observer',
} as const;

export type MemberRole = (typeof MEMBER_ROLE)[keyof typeof MEMBER_ROLE];

// 消息类型
export const MESSAGE_TYPE = {
  CHAT: 'chat',
  BRIEF: 'brief',
  PLAN: 'plan',
  APPROVAL: 'approval',
  RESULT: 'result',
} as const;

export type MessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

// 工具访问级别
export const ACCESS_LEVEL = {
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
} as const;

export type AccessLevel = (typeof ACCESS_LEVEL)[keyof typeof ACCESS_LEVEL];

// 员工实时状态
export const EMPLOYEE_STATUS = {
  IDLE: 'idle',
  WORKING: 'working',
  WAITING: 'waiting',
} as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUS)[keyof typeof EMPLOYEE_STATUS];

// 系统状态
export const SYSTEM_STATUS = {
  NORMAL: 'normal',
  FROZEN: 'frozen',
} as const;

export type SystemStatus = (typeof SYSTEM_STATUS)[keyof typeof SYSTEM_STATUS];
