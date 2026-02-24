import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============ models ============
export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  modelId: text('model_id').notNull(),
  apiKey: text('api_key').notNull(),
  notes: text('notes'),
  status: text('status').default('untested'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ tools ============
export const tools = sqliteTable('tools', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  transportType: text('transport_type').default('stdio'), // 'stdio' | 'sse'
  command: text('command').notNull(),       // stdio: npm package name; sse: URL
  args: text('args'),           // JSON array (stdio only)
  envVars: text('env_vars'),    // JSON object (plaintext, MVP scope)
  groupName: text('group_name'),
  accessLevel: text('access_level').default('read'), // 'read' | 'write' | 'admin'
  status: text('status').default('untested'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ employees ============
export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatar: text('avatar'),
  description: text('description'),
  modelId: text('model_id').references(() => models.id),
  systemPrompt: text('system_prompt').notNull(),
  tags: text('tags'),           // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ employee_tools ============
export const employeeTools = sqliteTable('employee_tools', {
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  toolId: text('tool_id').notNull().references(() => tools.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('uq_employee_tool').on(table.employeeId, table.toolId),
]);

// ============ teams ============
export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  scenario: text('scenario'),
  pmEmployeeId: text('pm_employee_id').references(() => employees.id),
  collaborationMode: text('collaboration_mode').default('free'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ team_members ============
export const teamMembers = sqliteTable('team_members', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  role: text('role').default('member'),
}, (table) => [
  uniqueIndex('uq_team_member').on(table.teamId, table.employeeId),
]);

// ============ team_tools ============
export const teamTools = sqliteTable('team_tools', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  toolId: text('tool_id').notNull().references(() => tools.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('uq_team_tool').on(table.teamId, table.toolId),
]);

// ============ tasks ============
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
  title: text('title'),
  description: text('description'),
  status: text('status').default('draft'),
  mode: text('mode').default('suggest'),
  brief: text('brief'),           // JSON
  teamConfig: text('team_config'), // JSON
  plan: text('plan'),              // JSON
  result: text('result'),          // JSON
  tokenUsage: integer('token_usage').default(0),
  estimatedCost: integer('estimated_cost'),
  actualCost: integer('actual_cost'),
  budgetLimit: integer('budget_limit'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ task_messages ============
export const taskMessages = sqliteTable('task_messages', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  senderId: text('sender_id'),
  content: text('content').notNull(),
  messageType: text('message_type'),
  metadata: text('metadata'),      // JSON
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_task_messages_task_created').on(table.taskId, table.createdAt),
]);

// ============ subtasks ============
export const subtasks = sqliteTable('subtasks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  assigneeId: text('assignee_id').references(() => employees.id),
  status: text('status').default('pending'),
  dependsOn: text('depends_on'),   // JSON array
  input: text('input'),            // JSON
  output: text('output'),          // JSON
  tokenUsage: integer('token_usage').default(0),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(2),
  validationResult: text('validation_result'), // JSON
  sortOrder: integer('sort_order'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_subtasks_task').on(table.taskId),
]);

// ============ employee_chat_messages ============
export const employeeChatMessages = sqliteTable('employee_chat_messages', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'),   // JSON
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_chat_employee_session').on(table.employeeId, table.sessionId, table.createdAt),
]);

// ============ hr_chat_messages ============
export const hrChatMessages = sqliteTable('hr_chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'),   // JSON
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_hr_chat_session').on(table.sessionId, table.createdAt),
]);

// ============ system_settings ============
export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ notifications ============
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'task_approval'|'task_completed'|'task_failed'|'circuit_breaker'|'observer_alert'|'trigger_fired'
  title: text('title').notNull(),
  content: text('content').notNull(),
  taskId: text('task_id').references(() => tasks.id),
  read: integer('read').default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_notifications_read').on(table.read),
  index('idx_notifications_created').on(table.createdAt),
]);

// ============ webhook_configs ============
export const webhookConfigs = sqliteTable('webhook_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret'),
  events: text('events').notNull(), // JSON array
  enabled: integer('enabled').default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ model_pricing ============
export const modelPricing = sqliteTable('model_pricing', {
  modelId: text('model_id').primaryKey().references(() => models.id, { onDelete: 'cascade' }),
  inputPricePerMToken: integer('input_price_per_m_token'),
  outputPricePerMToken: integer('output_price_per_m_token'),
  updatedAt: text('updated_at').notNull(),
});

// ============ token_usage_logs ============
export const tokenUsageLogs = sqliteTable('token_usage_logs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  subtaskId: text('subtask_id').references(() => subtasks.id),
  employeeId: text('employee_id').references(() => employees.id),
  modelId: text('model_id').references(() => models.id),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  estimatedCost: integer('estimated_cost').default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_token_usage_task').on(table.taskId),
]);

// ============ decision_logs ============
export const decisionLogs = sqliteTable('decision_logs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  subtaskId: text('subtask_id').references(() => subtasks.id),
  employeeId: text('employee_id').references(() => employees.id),
  actor: text('actor').notNull(), // 'pm'|'employee'|'system'
  action: text('action').notNull(),
  input: text('input'),   // JSON
  output: text('output'),  // JSON
  reasoning: text('reasoning'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_decision_logs_task').on(table.taskId),
]);

// ============ tool_call_logs ============
export const toolCallLogs = sqliteTable('tool_call_logs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  subtaskId: text('subtask_id').references(() => subtasks.id),
  employeeId: text('employee_id').references(() => employees.id),
  toolName: text('tool_name').notNull(),
  input: text('input'),   // JSON
  output: text('output'),  // JSON
  isError: integer('is_error').default(0),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_tool_call_logs_task').on(table.taskId),
]);

// ============ collaboration_configs ============
export const collaborationConfigs = sqliteTable('collaboration_configs', {
  teamId: text('team_id').primaryKey().references(() => teams.id, { onDelete: 'cascade' }),
  config: text('config').notNull(), // JSON
  updatedAt: text('updated_at').notNull(),
});

// ============ observer_findings ============
export const observerFindings = sqliteTable('observer_findings', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  observerId: text('observer_id').notNull().references(() => employees.id),
  severity: text('severity').notNull(), // 'info'|'warning'|'critical'
  category: text('category').notNull(), // 'factual_error'|'contradiction'|'goal_drift'|'quality'
  description: text('description').notNull(),
  relatedSubtaskId: text('related_subtask_id').references(() => subtasks.id),
  resolution: text('resolution'), // 'acknowledged'|'fixed'|'dismissed'
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_observer_findings_task').on(table.taskId),
]);

// ============ error_traces ============
export const errorTraces = sqliteTable('error_traces', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  subtaskId: text('subtask_id').notNull().references(() => subtasks.id),
  errorType: text('error_type').notNull(), // 'validation_failed'|'execution_error'|'timeout'|'quality_rejected'
  errorMessage: text('error_message').notNull(),
  aiSummary: text('ai_summary'), // AI-generated human-readable error summary
  retryAttempt: integer('retry_attempt').default(0),
  resolution: text('resolution'), // 'retried'|'reassigned'|'skipped'|'escalated'
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_error_traces_task').on(table.taskId),
]);

// ============ triggers ============
export const triggers = sqliteTable('triggers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'cron'|'webhook'|'event'
  config: text('config').notNull(), // JSON: { cron?, webhookPath?, eventType? }
  teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
  taskTemplate: text('task_template').notNull(), // JSON: { title, description, mode }
  enabled: integer('enabled').default(1),
  lastFiredAt: text('last_fired_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ evidence_items ============
export const evidenceItems = sqliteTable('evidence_items', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  subtaskId: text('subtask_id').references(() => subtasks.id),
  type: text('type').notNull(), // 'input'|'output'|'decision'|'tool_call'|'review'|'approval'
  title: text('title').notNull(),
  content: text('content').notNull(), // JSON
  source: text('source'), // 'pm'|'employee'|'system'|'observer'
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_evidence_items_task').on(table.taskId),
]);

// ============ policy_packages ============
export const policyPackages = sqliteTable('policy_packages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  scenario: text('scenario'), // target scenario type
  isBuiltin: integer('is_builtin').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ policy_package_versions ============
export const policyPackageVersions = sqliteTable('policy_package_versions', {
  id: text('id').primaryKey(),
  packageId: text('package_id').notNull().references(() => policyPackages.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  rules: text('rules').notNull(), // JSON array of policy rules
  changelog: text('changelog'),
  isActive: integer('is_active').default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_policy_versions_package').on(table.packageId),
]);

// ============ team_policies ============
export const teamPolicies = sqliteTable('team_policies', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  packageId: text('package_id').notNull().references(() => policyPackages.id, { onDelete: 'cascade' }),
  versionId: text('version_id').references(() => policyPackageVersions.id),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('uq_team_policy').on(table.teamId, table.packageId),
]);

// ============ incident_reports ============
export const incidentReports = sqliteTable('incident_reports', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  triggerType: text('trigger_type').notNull(), // 'emergency_stop'|'circuit_breaker'|'observer_critical'|'manual'
  status: text('status').default('draft'), // 'draft'|'analyzing'|'completed'
  timeline: text('timeline'), // JSON array of events
  rootCause: text('root_cause'),
  impact: text('impact'),
  resolution: text('resolution'),
  preventionPlan: text('prevention_plan'),
  aiAnalysis: text('ai_analysis'), // LLM-generated analysis
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_incident_reports_task').on(table.taskId),
]);

// ============ knowledge_bases ============
export const knowledgeBases = sqliteTable('knowledge_bases', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ knowledge_documents ============
export const knowledgeDocuments = sqliteTable('knowledge_documents', {
  id: text('id').primaryKey(),
  knowledgeBaseId: text('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  mimeType: text('mime_type').default('text/plain'),
  chunkCount: integer('chunk_count').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_knowledge_docs_base').on(table.knowledgeBaseId),
]);

// ============ knowledge_chunks ============
export const knowledgeChunks = sqliteTable('knowledge_chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: text('embedding'), // JSON array of floats (for simple vector search)
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_knowledge_chunks_doc').on(table.documentId),
]);

// ============ employee_knowledge_bases ============
export const employeeKnowledgeBases = sqliteTable('employee_knowledge_bases', {
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  knowledgeBaseId: text('knowledge_base_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
}, (table) => [
  uniqueIndex('uq_employee_kb').on(table.employeeId, table.knowledgeBaseId),
]);

// ============ deployment_stages (F10) ============
export const deploymentStages = sqliteTable('deployment_stages', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
  stage: text('stage').notNull().default('simulation'), // 'simulation'|'shadow'|'limited_auto'|'full_auto'
  promotedAt: text('promoted_at'),
  promotedBy: text('promoted_by'), // 'manual'|'auto'
  config: text('config'), // JSON: stage-specific config (e.g., rate limit for limited_auto)
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_deployment_stages_employee').on(table.employeeId),
  index('idx_deployment_stages_team').on(table.teamId),
]);

// ============ stage_evaluations (F10) ============
export const stageEvaluations = sqliteTable('stage_evaluations', {
  id: text('id').primaryKey(),
  deploymentStageId: text('deployment_stage_id').notNull().references(() => deploymentStages.id, { onDelete: 'cascade' }),
  fromStage: text('from_stage').notNull(),
  toStage: text('to_stage').notNull(),
  result: text('result').notNull(), // 'promoted'|'rejected'|'pending'
  metrics: text('metrics'), // JSON: { taskCount, successRate, avgCost, etc. }
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_stage_evaluations_deployment').on(table.deploymentStageId),
]);

// ============ test_scenarios (F14) ============
export const testScenarios = sqliteTable('test_scenarios', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'), // 'safety'|'quality'|'performance'|'compliance'
  input: text('input').notNull(), // JSON: the test prompt/scenario
  expectedBehavior: text('expected_behavior').notNull(), // description of expected behavior
  evaluationCriteria: text('evaluation_criteria'), // JSON: scoring rubric
  tags: text('tags'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ test_runs (F14) ============
export const testRuns = sqliteTable('test_runs', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  status: text('status').default('pending'), // 'pending'|'running'|'completed'|'failed'
  triggerType: text('trigger_type').notNull(), // 'manual'|'change'|'scheduled'
  totalScenarios: integer('total_scenarios').default(0),
  passedScenarios: integer('passed_scenarios').default(0),
  failedScenarios: integer('failed_scenarios').default(0),
  summary: text('summary'), // JSON or text summary
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_test_runs_employee').on(table.employeeId),
]);

// ============ test_results (F14) ============
export const testResults = sqliteTable('test_results', {
  id: text('id').primaryKey(),
  testRunId: text('test_run_id').notNull().references(() => testRuns.id, { onDelete: 'cascade' }),
  scenarioId: text('scenario_id').notNull().references(() => testScenarios.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'passed'|'failed'|'error'
  actualOutput: text('actual_output'), // JSON
  score: integer('score'), // 0-100
  evaluation: text('evaluation'), // JSON: detailed evaluation
  durationMs: integer('duration_ms'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_test_results_run').on(table.testRunId),
]);

// ============ change_test_configs (F15) ============
export const changeTestConfigs = sqliteTable('change_test_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  watchTarget: text('watch_target').notNull(), // 'employee'|'model'|'tool'|'prompt'
  watchId: text('watch_id'), // specific entity ID, null = all
  scenarioIds: text('scenario_ids').notNull(), // JSON array of test scenario IDs
  enabled: integer('enabled').default(1),
  lastTriggeredAt: text('last_triggered_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ change_test_runs (F15) ============
export const changeTestRuns = sqliteTable('change_test_runs', {
  id: text('id').primaryKey(),
  configId: text('config_id').notNull().references(() => changeTestConfigs.id, { onDelete: 'cascade' }),
  testRunId: text('test_run_id').references(() => testRuns.id),
  changeType: text('change_type').notNull(), // 'employee_updated'|'model_updated'|'tool_updated'|'prompt_updated'
  changeDetail: text('change_detail'), // JSON: what changed
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_change_test_runs_config').on(table.configId),
]);

// ============ employee_memories (Phase3-F1) ============
export const employeeMemories = sqliteTable('employee_memories', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  sourceTaskId: text('source_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  type: text('type').notNull(), // 'strategy'|'failure'|'pattern'|'insight'
  summary: text('summary').notNull(),
  detail: text('detail').notNull(),
  tags: text('tags'), // JSON array
  confidence: integer('confidence').default(50),
  usageCount: integer('usage_count').default(0),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_employee_memories_employee').on(table.employeeId),
]);

// ============ team_memories (Phase3-F1) ============
export const teamMemories = sqliteTable('team_memories', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  sourceTaskId: text('source_task_id').references(() => tasks.id, { onDelete: 'set null' }),
  type: text('type').notNull(), // 'review_summary'|'execution_template'|'collaboration_pattern'
  summary: text('summary').notNull(),
  detail: text('detail').notNull(),
  tags: text('tags'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_team_memories_team').on(table.teamId),
]);

// ============ improvement_proposals (Phase3-F3) ============
export const improvementProposals = sqliteTable('improvement_proposals', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull(), // 'employee'|'model'|'tool'|'config'
  targetId: text('target_id').notNull(),
  category: text('category').notNull(), // 'prompt_optimization'|'model_recommendation'|'tool_recommendation'|'config_change'
  diagnosis: text('diagnosis').notNull(),
  suggestion: text('suggestion').notNull(), // JSON
  status: text('status').default('pending'), // 'pending'|'approved'|'rejected'|'applied'
  appliedAt: text('applied_at'),
  testRunId: text('test_run_id'),
  sourceData: text('source_data'), // JSON
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ============ employee_competency_scores (Phase3-F4) ============
export const employeeCompetencyScores = sqliteTable('employee_competency_scores', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  period: text('period').notNull(), // 'YYYY-MM'
  completionRate: integer('completion_rate'),
  qualityScore: integer('quality_score'),
  efficiencyScore: integer('efficiency_score'),
  stabilityScore: integer('stability_score'),
  overallScore: integer('overall_score'),
  taskCount: integer('task_count').default(0),
  details: text('details'), // JSON
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_competency_scores_employee').on(table.employeeId),
  uniqueIndex('uq_competency_employee_period').on(table.employeeId, table.period),
]);
