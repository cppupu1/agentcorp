const BASE = '/api';

export class ApiError extends Error {
  code: string;
  details?: Array<{ field: string; rule: string; message: string }>;
  references?: Array<{ type: string; id: string; name: string }>;

  constructor(err: { code: string; message: string; details?: any; references?: any }) {
    super(err.message);
    this.code = err.code;
    this.details = err.details;
    this.references = err.references;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: `服务器返回异常 (${res.status})` });
  }
  if (!res.ok) {
    const err = json.error || { code: 'INTERNAL_ERROR', message: res.statusText };
    throw new ApiError(err);
  }
  return json;
}

// Models
export const modelsApi = {
  list: () => request<{ data: Model[] }>('/models'),
  get: (id: string) => request<{ data: Model }>(`/models/${id}`),
  create: (body: ModelInput) => request<{ data: Model }>('/models', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<ModelInput>) => request<{ data: Model }>(`/models/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ data: { id: string } }>(`/models/${id}`, { method: 'DELETE' }),
  test: (id: string) => request<TestResult>(`/models/${id}/test`, { method: 'POST' }),
};

// Tools
export const toolsApi = {
  list: (group?: string) => request<{ data: Tool[] }>(`/tools${group ? `?group=${encodeURIComponent(group)}` : ''}`),
  get: (id: string) => request<{ data: ToolDetail }>(`/tools/${id}`),
  create: (body: ToolInput) => request<{ data: Tool }>('/tools', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<ToolInput>) => request<{ data: ToolDetail }>(`/tools/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ data: { id: string } }>(`/tools/${id}`, { method: 'DELETE' }),
  test: (id: string) => request<ToolTestResult>(`/tools/${id}/test`, { method: 'POST' }),
  groups: () => request<{ data: string[] }>('/tools/groups'),
};

// Employees
export const employeesApi = {
  list: (params?: { tag?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.search) qs.set('search', params.search);
    const q = qs.toString();
    return request<{ data: Employee[] }>(`/employees${q ? `?${q}` : ''}`);
  },
  get: (id: string) => request<{ data: EmployeeDetail }>(`/employees/${id}`),
  create: (body: EmployeeInput) => request<{ data: Employee }>('/employees', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<EmployeeInput>) => request<{ data: EmployeeDetail }>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ data: { id: string } }>(`/employees/${id}`, { method: 'DELETE' }),
  copy: (id: string) => request<{ data: Employee }>(`/employees/${id}/copy`, { method: 'POST' }),
  tags: () => request<{ data: string[] }>('/employees/tags'),
  export: (ids: string[]) => request<{ data: ExportedEmployee[] }>('/employees/export', { method: 'POST', body: JSON.stringify({ ids }) }),
  import: (employees: ExportedEmployee[], modelId: string) =>
    request<{ data: { created: string[]; warnings: string[] } }>('/employees/import', {
      method: 'POST',
      body: JSON.stringify({ employees, modelId }),
    }),
};

// Types
export interface Model {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  notes: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInput {
  name: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  notes?: string;
}

export interface TestResult {
  success: boolean;
  status: string;
  message: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  transportType: string;
  command: string;
  args: string[];
  groupName: string | null;
  accessLevel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolDetail extends Tool {
  envKeys: string[];
}

export interface ToolInput {
  name: string;
  description: string;
  transportType?: string;
  command: string;
  args?: string[];
  envVars?: Record<string, string>;
  groupName?: string;
  accessLevel?: string;
}

export interface ToolTestResult extends TestResult {
  tools?: Array<{ name: string; description: string }>;
}

export interface Employee {
  id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  modelId: string | null;
  modelName: string;
  systemPrompt: string;
  tags: string[];
  toolCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDetail extends Employee {
  tools: Array<{ id: string; name: string }>;
}

export interface EmployeeInput {
  name: string;
  avatar?: string;
  description?: string;
  modelId: string;
  systemPrompt: string;
  tags?: string[];
  toolIds?: string[];
}

export interface ExportedEmployee {
  name: string;
  avatar?: string | null;
  description?: string | null;
  systemPrompt: string;
  tags: string[];
  toolNames: string[];
}

// Chat
export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  employeeId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: string | null;
  createdAt: string;
}

export const chatApi = {
  listSessions: (employeeId: string) =>
    request<ChatSession[]>(`/employees/${employeeId}/chat/sessions`),
  getMessages: (employeeId: string, sessionId: string) =>
    request<ChatMessage[]>(`/employees/${employeeId}/chat/${sessionId}/messages`),
  deleteSession: (employeeId: string, sessionId: string) =>
    request<{ sessionId: string }>(`/employees/${employeeId}/chat/${sessionId}`, { method: 'DELETE' }),
};

// Teams
export interface Team {
  id: string;
  name: string;
  description: string | null;
  scenario: string | null;
  pmEmployeeId: string | null;
  pmName: string;
  pmAvatar: string | null;
  collaborationMode: string;
  memberCount: number;
  toolCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
}

export interface TeamDetail extends Omit<Team, 'memberCount' | 'toolCount' | 'taskCount'> {
  members: TeamMember[];
  tools: Array<{ id: string; name: string }>;
}

export interface TeamInput {
  name: string;
  description?: string;
  scenario?: string;
  pmEmployeeId: string;
  collaborationMode?: string;
  memberIds?: Array<{ employeeId: string; role?: string }>;
  toolIds?: string[];
}

export const teamsApi = {
  list: () => request<{ data: Team[] }>('/teams'),
  get: (id: string) => request<{ data: TeamDetail }>(`/teams/${id}`),
  create: (body: TeamInput) => request<{ data: TeamDetail }>('/teams', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<TeamInput>) => request<{ data: TeamDetail }>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ data: { id: string } }>(`/teams/${id}`, { method: 'DELETE' }),
  copy: (id: string) => request<{ data: TeamDetail }>(`/teams/${id}/copy`, { method: 'POST' }),
};

export const collaborationApi = {
  getConfig: (teamId: string) => request<{ data: { teamId: string; config: any } }>(`/teams/${teamId}/collaboration-config`),
  updateConfig: (teamId: string, config: any) =>
    request<{ data: { teamId: string; config: any } }>(`/teams/${teamId}/collaboration-config`, { method: 'PUT', body: JSON.stringify({ config }) }),
};

// Templates
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  employeeCount: number;
}

export const templatesApi = {
  list: () => request<{ data: TemplateSummary[] }>('/templates'),
  apply: (id: string, modelId: string) =>
    request<{ data: { teamId: string; employeeIds: string[] } }>(`/templates/${id}/apply`, {
      method: 'POST',
      body: JSON.stringify({ modelId }),
    }),
};

// Tasks
export interface TaskSummary {
  id: string;
  teamId: string | null;
  teamName: string;
  title: string | null;
  description: string | null;
  status: string | null;
  mode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskBrief {
  title: string;
  objective: string;
  deliverables: string;
  constraints?: string;
  acceptanceCriteria: string;
}

export interface TaskTeamConfig {
  pm: { id: string; name: string } | null;
  members: Array<{ id: string; name: string; taskPrompt: string }>;
}

export interface TaskPlan {
  subtasks: Array<{
    id: string;
    title: string;
    description?: string;
    assigneeId: string;
    dependsOn: string[];
  }>;
}

export interface TaskSubtask {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName: string;
  status: string | null;
  dependsOn: string[];
  output: unknown;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends TaskSummary {
  brief: TaskBrief | null;
  teamConfig: TaskTeamConfig | null;
  plan: TaskPlan | null;
  result: unknown;
  tokenUsage: number | null;
  subtasks: TaskSubtask[];
}

export interface TaskMessage {
  id: string;
  taskId: string;
  role: string;
  senderId: string | null;
  content: string;
  messageType: string | null;
  metadata: string | null;
  createdAt: string;
}

export const tasksApi = {
  list: (params?: { teamId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.teamId) qs.set('teamId', params.teamId);
    if (params?.status) qs.set('status', params.status);
    const q = qs.toString();
    return request<{ data: TaskSummary[] }>(`/tasks${q ? `?${q}` : ''}`);
  },
  get: (id: string) => request<{ data: TaskDetail }>(`/tasks/${id}`),
  create: (body: { teamId?: string; pmEmployeeId?: string; description: string; mode?: string }) =>
    request<{ data: TaskDetail }>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ data: { id: string } }>(`/tasks/${id}`, { method: 'DELETE' }),
  messages: (id: string, type?: string) => {
    const qs = type ? `?type=${encodeURIComponent(type)}` : '';
    return request<{ data: TaskMessage[] }>(`/tasks/${id}/messages${qs}`);
  },
  approveBrief: (id: string, body: { approved: boolean; modifications?: Record<string, string> }) =>
    request<{ data: TaskDetail }>(`/tasks/${id}/approve-brief`, { method: 'POST', body: JSON.stringify(body) }),
  approveTeam: (id: string, body: { approved: boolean; adjustments?: { addMembers?: string[]; removeMembers?: string[] } }) =>
    request<{ data: TaskDetail }>(`/tasks/${id}/approve-team`, { method: 'POST', body: JSON.stringify(body) }),
  approvePlan: (id: string, body: { approved: boolean; feedback?: string }) =>
    request<{ data: TaskDetail }>(`/tasks/${id}/approve-plan`, { method: 'POST', body: JSON.stringify(body) }),
};

// Notifications
export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  taskId: string | null;
  read: number;
  createdAt: string;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
}

export const notificationsApi = {
  list: (read?: number) => request<{ data: Notification[] }>(`/notifications${read !== undefined ? `?read=${read}` : ''}`),
  unreadCount: () => request<{ data: { count: number } }>('/notifications/unread-count'),
  markRead: (id: string) => request<{ data: { id: string } }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<{ data: { success: boolean } }>('/notifications/read-all', { method: 'POST' }),
};

export const webhookConfigsApi = {
  list: () => request<{ data: WebhookConfig[] }>('/webhook-configs'),
  create: (body: { name: string; url: string; secret?: string; events: string[]; enabled?: boolean }) =>
    request<{ data: WebhookConfig }>('/webhook-configs', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{ name: string; url: string; secret?: string; events: string[]; enabled: boolean }>) =>
    request<{ data: WebhookConfig }>(`/webhook-configs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<{ data: { id: string } }>(`/webhook-configs/${id}`, { method: 'DELETE' }),
};

// System
export const systemApi = {
  getStatus: () => request<{ data: { status: string } }>('/system/status'),
  emergencyStop: () => request<{ data: { status: string } }>('/system/emergency-stop', { method: 'POST' }),
  emergencyResume: () => request<{ data: { status: string } }>('/system/emergency-resume', { method: 'POST' }),
  getSettings: () => request<{ data: Record<string, string> }>('/system/settings'),
  getSetting: (key: string) => request<{ data: { key: string; value: string } }>(`/system/settings/${key}`),
  updateSetting: (key: string, value: string) =>
    request<{ data: { key: string; value: string } }>(`/system/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
};

// Cost
export interface TaskCostBreakdown {
  taskId: string;
  estimatedCost: number | null;
  actualCost: number | null;
  budgetLimit: number | null;
  breakdown: Array<{
    employeeId: string;
    employeeName: string;
    subtaskId: string | null;
    subtaskTitle: string | null;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

export interface CostStats {
  totalCost: number;
  totalTasks: number;
  totalTokens: number;
  byModel: Array<{ modelId: string; modelName: string; cost: number; tokens: number }>;
}

export const costApi = {
  getTaskCost: (taskId: string) => request<{ data: TaskCostBreakdown }>(`/tasks/${taskId}/cost`),
  getStats: (startDate?: string, endDate?: string) => {
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    const q = qs.toString();
    return request<{ data: CostStats }>(`/cost/stats${q ? `?${q}` : ''}`);
  },
  updateModelPricing: (modelId: string, body: { inputPricePerMToken: number; outputPricePerMToken: number }) =>
    request<{ data: { modelId: string } }>(`/models/${modelId}/pricing`, { method: 'PUT', body: JSON.stringify(body) }),
};

// Observability
export interface TimelineEvent {
  id: string;
  type: 'decision' | 'tool_call';
  taskId: string;
  subtaskId: string | null;
  employeeId: string | null;
  actor?: string;
  action?: string;
  toolName?: string;
  input: unknown;
  output: unknown;
  isError?: boolean;
  durationMs?: number;
  reasoning?: string;
  createdAt: string;
}

export interface HealthStats {
  activeTasks: number;
  failedTasksLast24h: number;
  totalTokenUsage: number;
  completedTasksLast24h: number;
}

export const observabilityApi = {
  getTimeline: (taskId: string) => request<{ data: TimelineEvent[] }>(`/tasks/${taskId}/timeline`),
  getDecisions: (taskId: string) => request<{ data: TimelineEvent[] }>(`/tasks/${taskId}/decisions`),
  getToolTrace: (taskId: string) => request<{ data: TimelineEvent[] }>(`/tasks/${taskId}/tool-trace`),
  getHealthStats: () => request<{ data: HealthStats }>('/health/stats'),
};

// Error Traces
export interface ErrorTrace {
  id: string;
  taskId: string;
  subtaskId: string;
  subtaskTitle: string | null;
  errorType: string;
  errorMessage: string;
  retryAttempt: number;
  resolution: string | null;
  createdAt: string;
}

export const errorTraceApi = {
  getTrace: (taskId: string) => request<{ data: ErrorTrace[] }>(`/tasks/${taskId}/error-trace`),
};

// Observer
export interface ObserverFinding {
  id: string;
  taskId: string;
  observerId: string;
  observerName: string;
  severity: string;
  category: string;
  description: string;
  relatedSubtaskId: string | null;
  resolution: string | null;
  createdAt: string;
}

export const observerApi = {
  getFindings: (taskId: string) => request<{ data: ObserverFinding[] }>(`/tasks/${taskId}/observer-findings`),
  resolve: (taskId: string, findingId: string, resolution: string) =>
    request<{ data: { id: string; resolution: string } }>(`/tasks/${taskId}/observer-findings/${findingId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),
};

// Incident Reports
export interface IncidentReport {
  id: string;
  taskId: string;
  taskTitle: string | null;
  triggerType: string;
  status: string | null;
  timeline: Array<{ time: string; type: string; summary: string }>;
  rootCause: string | null;
  impact: string | null;
  resolution: string | null;
  preventionPlan: string | null;
  aiAnalysis: string | null;
  createdAt: string;
  updatedAt: string;
}

export const incidentsApi = {
  list: () => request<{ data: IncidentReport[] }>('/incidents'),
  get: (id: string) => request<{ data: IncidentReport }>(`/incidents/${id}`),
  create: (body: { taskId: string; triggerType: string }) =>
    request<{ data: IncidentReport }>('/incidents', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { rootCause?: string; impact?: string; resolution?: string; preventionPlan?: string }) =>
    request<{ data: IncidentReport }>(`/incidents/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  analyze: (id: string) =>
    request<{ data: IncidentReport }>(`/incidents/${id}/analyze`, { method: 'POST' }),
  delete: (id: string) =>
    request<{ data: { id: string } }>(`/incidents/${id}`, { method: 'DELETE' }),
};

// Policy Packages
export interface PolicyPackage {
  id: string;
  name: string;
  description: string | null;
  scenario: string | null;
  isBuiltin: number;
  activeVersion: number | null;
  activeVersionId: string | null;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyVersion {
  id: string;
  packageId: string;
  version: number;
  rules: unknown[];
  changelog: string | null;
  isActive: number;
  createdAt: string;
}

export interface PolicyPackageDetail {
  id: string;
  name: string;
  description: string | null;
  scenario: string | null;
  isBuiltin: number;
  createdAt: string;
  updatedAt: string;
  versions: PolicyVersion[];
}

export interface TeamPolicy {
  packageId: string;
  versionId: string | null;
  createdAt: string;
  packageName: string;
  packageDescription: string | null;
  scenario: string | null;
  isBuiltin: number;
  version: number | null;
  rules: unknown[];
}

export const policiesApi = {
  list: () => request<{ data: PolicyPackage[] }>('/policies'),
  get: (id: string) => request<{ data: PolicyPackageDetail }>(`/policies/${id}`),
  create: (body: { name: string; description?: string; scenario?: string; rules: unknown[] }) =>
    request<{ data: PolicyPackageDetail }>('/policies', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; description?: string; scenario?: string }) =>
    request<{ data: PolicyPackageDetail }>(`/policies/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request<{ data: { id: string } }>(`/policies/${id}`, { method: 'DELETE' }),
  createVersion: (id: string, body: { rules: unknown[]; changelog?: string }) =>
    request<{ data: PolicyPackageDetail }>(`/policies/${id}/versions`, { method: 'POST', body: JSON.stringify(body) }),
  activateVersion: (id: string, versionId: string) =>
    request<{ data: PolicyPackageDetail }>(`/policies/${id}/versions/${versionId}/activate`, { method: 'POST' }),
  getTeamPolicies: (teamId: string) =>
    request<{ data: TeamPolicy[] }>(`/teams/${teamId}/policies`),
  assignToTeam: (teamId: string, packageId: string) =>
    request<{ data: TeamPolicy[] }>(`/teams/${teamId}/policies`, { method: 'POST', body: JSON.stringify({ packageId }) }),
  removeFromTeam: (teamId: string, packageId: string) =>
    request<{ data: { teamId: string; packageId: string } }>(`/teams/${teamId}/policies/${packageId}`, { method: 'DELETE' }),
};

// Knowledge Bases
export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseDetail {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  documents: KnowledgeDocumentSummary[];
}

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  mimeType: string | null;
  chunkCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;
  content: string;
  mimeType: string | null;
  chunkCount: number | null;
  createdAt: string;
  updatedAt: string;
  chunks: KnowledgeChunk[];
}

export interface KnowledgeChunk {
  id: string;
  content: string;
  sortOrder: number | null;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  chunkContent: string;
  documentId: string;
  documentTitle: string;
}

export const knowledgeApi = {
  list: () => request<{ data: KnowledgeBase[] }>('/knowledge-bases'),
  get: (id: string) => request<{ data: KnowledgeBaseDetail }>(`/knowledge-bases/${id}`),
  create: (body: { name: string; description?: string }) =>
    request<{ data: KnowledgeBaseDetail }>('/knowledge-bases', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; description?: string }) =>
    request<{ data: KnowledgeBaseDetail }>(`/knowledge-bases/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request<{ data: { id: string } }>(`/knowledge-bases/${id}`, { method: 'DELETE' }),
  addDocument: (kbId: string, body: { title: string; content: string }) =>
    request<{ data: KnowledgeDocument }>(`/knowledge-bases/${kbId}/documents`, { method: 'POST', body: JSON.stringify(body) }),
  getDocument: (kbId: string, docId: string) =>
    request<{ data: KnowledgeDocument }>(`/knowledge-bases/${kbId}/documents/${docId}`),
  deleteDocument: (kbId: string, docId: string) =>
    request<{ data: { id: string } }>(`/knowledge-bases/${kbId}/documents/${docId}`, { method: 'DELETE' }),
  search: (kbId: string, q: string, limit?: number) => {
    const qs = new URLSearchParams({ q });
    if (limit) qs.set('limit', String(limit));
    return request<{ data: KnowledgeSearchResult[] }>(`/knowledge-bases/${kbId}/search?${qs}`);
  },
  getEmployeeKBs: (employeeId: string) =>
    request<{ data: Array<{ id: string; name: string; description: string | null }> }>(`/employees/${employeeId}/knowledge-bases`),
  assignToEmployee: (employeeId: string, knowledgeBaseId: string) =>
    request<{ data: { employeeId: string; knowledgeBaseId: string } }>(`/employees/${employeeId}/knowledge-bases`, {
      method: 'POST', body: JSON.stringify({ knowledgeBaseId }),
    }),
  removeFromEmployee: (employeeId: string, kbId: string) =>
    request<{ data: { employeeId: string; knowledgeBaseId: string } }>(`/employees/${employeeId}/knowledge-bases/${kbId}`, { method: 'DELETE' }),
};

// Triggers
export interface Trigger {
  id: string;
  name: string;
  type: 'cron' | 'webhook' | 'event';
  config: Record<string, unknown>;
  teamId: string | null;
  teamName: string;
  taskTemplate: { title: string; description: string; mode?: string };
  enabled: number | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerInput {
  name: string;
  type: 'cron' | 'webhook' | 'event';
  config: Record<string, unknown>;
  teamId: string;
  taskTemplate: { title: string; description: string; mode?: string };
  enabled?: boolean;
}

export const triggersApi = {
  list: () => request<{ data: Trigger[] }>('/triggers'),
  get: (id: string) => request<{ data: Trigger }>(`/triggers/${id}`),
  create: (body: TriggerInput) =>
    request<{ data: Trigger }>('/triggers', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<TriggerInput>) =>
    request<{ data: Trigger }>(`/triggers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request<{ data: { id: string } }>(`/triggers/${id}`, { method: 'DELETE' }),
  fire: (id: string) =>
    request<{ data: { taskId: string; triggerName: string } }>(`/triggers/${id}/fire`, { method: 'POST' }),
};

// Evidence Chain
export interface EvidenceItem {
  id: string;
  taskId: string;
  subtaskId: string | null;
  type: 'input' | 'output' | 'decision' | 'tool_call' | 'review' | 'approval';
  title: string;
  content: string; // JSON string
  source: string | null;
  createdAt: string;
}

export interface EvidenceChainSummary {
  totalItems: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    source: string | null;
    subtaskId: string | null;
    createdAt: string;
  }>;
}

export const evidenceApi = {
  getEvidence: (taskId: string) => request<{ data: EvidenceItem[] }>(`/tasks/${taskId}/evidence`),
  getSummary: (taskId: string) => request<{ data: EvidenceChainSummary }>(`/tasks/${taskId}/evidence/summary`),
};

// Deployment Stages
export interface DeploymentStage {
  id: string;
  employeeId: string;
  employeeName: string;
  teamId: string | null;
  teamName: string;
  stage: 'simulation' | 'shadow' | 'limited_auto' | 'full_auto';
  promotedAt: string | null;
  promotedBy: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StageEvaluation {
  id: string;
  deploymentStageId: string;
  fromStage: string;
  toStage: string;
  result: 'promoted' | 'rejected' | 'pending';
  metrics: Record<string, unknown>;
  reason: string | null;
  createdAt: string;
}

export interface DeploymentStageDetail extends DeploymentStage {
  evaluations: StageEvaluation[];
}

export const deploymentApi = {
  list: () => request<{ data: DeploymentStage[] }>('/deployment-stages'),
  get: (id: string) => request<{ data: DeploymentStageDetail }>(`/deployment-stages/${id}`),
  create: (body: { employeeId: string; teamId?: string }) =>
    request<{ data: DeploymentStageDetail }>('/deployment-stages', { method: 'POST', body: JSON.stringify(body) }),
  evaluate: (id: string) =>
    request<{ data: DeploymentStageDetail }>(`/deployment-stages/${id}/evaluate`, { method: 'POST' }),
  promote: (id: string) =>
    request<{ data: DeploymentStageDetail }>(`/deployment-stages/${id}/promote`, { method: 'POST' }),
  demote: (id: string) =>
    request<{ data: DeploymentStageDetail }>(`/deployment-stages/${id}/demote`, { method: 'POST' }),
  delete: (id: string) =>
    request<{ data: { id: string } }>(`/deployment-stages/${id}`, { method: 'DELETE' }),
};

// Visualization (DAG)
export interface DAGNode {
  id: string;
  title: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string;
}

export interface DAGEdge {
  source: string;
  target: string;
}

export interface DAGData {
  task: { title: string | null; status: string | null };
  nodes: DAGNode[];
  edges: DAGEdge[];
  stats: { total: number; completed: number; executing: number; failed: number; pending: number };
}

export const visualizationApi = {
  getDAG: (taskId: string) => request<{ data: DAGData }>(`/tasks/${taskId}/dag`),
};

// Testing (F14)
export interface TestScenario {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  input: unknown;
  expectedBehavior: string;
  evaluationCriteria: unknown;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TestScenarioInput {
  name: string;
  description?: string;
  category?: string;
  input: unknown;
  expectedBehavior: string;
  evaluationCriteria?: unknown;
  tags?: string[];
}

export interface TestRunResult {
  id: string;
  testRunId: string;
  scenarioId: string;
  scenarioName: string | null;
  status: 'passed' | 'failed' | 'error';
  actualOutput: unknown;
  score: number | null;
  evaluation: unknown;
  durationMs: number | null;
  createdAt: string;
}

export interface TestRun {
  id: string;
  employeeId: string;
  employeeName: string | null;
  status: string | null;
  triggerType: string;
  totalScenarios: number | null;
  passedScenarios: number | null;
  failedScenarios: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestRunDetail extends TestRun {
  results: TestRunResult[];
}

export const testingApi = {
  listScenarios: () => request<{ data: TestScenario[] }>('/test-scenarios'),
  getScenario: (id: string) => request<{ data: TestScenario }>(`/test-scenarios/${id}`),
  createScenario: (body: TestScenarioInput) =>
    request<{ data: TestScenario }>('/test-scenarios', { method: 'POST', body: JSON.stringify(body) }),
  updateScenario: (id: string, body: Partial<TestScenarioInput>) =>
    request<{ data: TestScenario }>(`/test-scenarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteScenario: (id: string) =>
    request<{ data: { id: string } }>(`/test-scenarios/${id}`, { method: 'DELETE' }),
  listRuns: (employeeId?: string) => {
    const qs = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
    return request<{ data: TestRun[] }>(`/test-runs${qs}`);
  },
  getRun: (id: string) => request<{ data: TestRunDetail }>(`/test-runs/${id}`),
  startRun: (body: { employeeId: string; scenarioIds: string[] }) =>
    request<{ data: TestRunDetail }>('/test-runs', { method: 'POST', body: JSON.stringify(body) }),
};

// Change Testing (F15)
export interface ChangeTestConfig {
  id: string;
  name: string;
  watchTarget: string;
  watchId: string | null;
  scenarioIds: string;
  enabled: number | null;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeTestRun {
  id: string;
  configId: string;
  testRunId: string | null;
  changeType: string;
  changeDetail: string | null;
  createdAt: string;
}

export interface ChangeTestConfigDetail extends ChangeTestConfig {
  runs: ChangeTestRun[];
}

export interface ChangeTestConfigInput {
  name: string;
  watchTarget: string;
  watchId?: string | null;
  scenarioIds: string[];
  enabled?: boolean;
}

export const changeTestingApi = {
  list: () => request<{ data: ChangeTestConfig[] }>('/change-test-configs'),
  get: (id: string) => request<{ data: ChangeTestConfigDetail }>(`/change-test-configs/${id}`),
  create: (body: ChangeTestConfigInput) =>
    request<{ data: ChangeTestConfig }>('/change-test-configs', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<ChangeTestConfigInput>) =>
    request<{ data: ChangeTestConfig }>(`/change-test-configs/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) =>
    request<{ data: { id: string } }>(`/change-test-configs/${id}`, { method: 'DELETE' }),
};

// HR Assistant
export interface HrChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: string | null;
  createdAt: string;
}

export const hrAssistantApi = {
  listSessions: () => request<ChatSession[]>('/hr-assistant/sessions'),
  getMessages: (sessionId: string) => request<HrChatMessage[]>(`/hr-assistant/${sessionId}/messages`),
  deleteSession: (sessionId: string) => request<{ sessionId: string }>(`/hr-assistant/${sessionId}`, { method: 'DELETE' }),
};
