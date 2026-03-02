import { db, tasks, subtasks, taskReviews, taskReviewFindings, toolCallLogs, decisionLogs, models, teams, generateId, now } from '@agentcorp/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { generateText } from 'ai';
import { getModelIdForFeature, assertNotFrozen } from './system.js';
import { AppError } from '../errors.js';

/** Strip sensitive patterns (API keys, tokens, passwords) from text before sending to LLM */
function sanitizeForLLM(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9._\-\/+=]{10,}/gi, 'Bearer [REDACTED]')
    .replace(/(?:password|passwd|secret|token|apikey|api_key)[\s]*[=:]\s*\S+/gi, '[REDACTED_CREDENTIAL]');
}

/** Gather execution context for AI analysis */
function gatherTaskContext(taskId: string) {
  const [task] = db.select().from(tasks).where(eq(tasks.id, taskId)).all();
  if (!task) throw new AppError('NOT_FOUND', `Task ${taskId} not found`);

  const [team] = task.teamId
    ? db.select().from(teams).where(eq(teams.id, task.teamId)).all()
    : [null];

  const subs = db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).all();

  const toolCalls = db.select().from(toolCallLogs)
    .where(eq(toolCallLogs.taskId, taskId)).all();

  const decisions = db.select().from(decisionLogs)
    .where(eq(decisionLogs.taskId, taskId)).all();

  const toolErrorCount = toolCalls.filter(tc => tc.isError).length;
  const totalSteps = toolCalls.length;
  const completedSubs = subs.filter(s => s.status === 'completed').length;
  const failedSubs = subs.filter(s => s.status === 'failed').length;

  return {
    task,
    team,
    subtasks: subs,
    toolCalls: { total: totalSteps, errors: toolErrorCount, samples: toolCalls.slice(0, 30) },
    decisions: decisions.slice(0, 20),
    stats: { totalSubtasks: subs.length, completedSubs, failedSubs },
  };
}

/** Main entry: create and run a task review */
export async function createTaskReview(taskId: string, triggeredBy: 'auto' | 'manual') {
  if (triggeredBy === 'manual') assertNotFrozen();

  const [task] = db.select().from(tasks).where(eq(tasks.id, taskId)).all();
  if (!task) throw new AppError('NOT_FOUND', `Task ${taskId} not found`);
  if (!['completed', 'failed'].includes(task.status ?? '')) {
    throw new AppError('INVALID_STATE', 'Only completed or failed tasks can be reviewed');
  }

  // Idempotent: if already has a completed or in-progress review, return it (auto only)
  const [existing] = db.select().from(taskReviews)
    .where(and(
      eq(taskReviews.taskId, taskId),
      sql`${taskReviews.status} IN ('completed', 'analyzing')`,
    ))
    .orderBy(desc(taskReviews.createdAt)).limit(1).all();
  if (existing && triggeredBy === 'auto') return existing;

  // Manual re-trigger: delete old reviews and their findings to avoid double-counting
  if (triggeredBy === 'manual') {
    const oldReviews = db.select({ id: taskReviews.id }).from(taskReviews)
      .where(eq(taskReviews.taskId, taskId)).all();
    for (const old of oldReviews) {
      db.delete(taskReviewFindings).where(eq(taskReviewFindings.reviewId, old.id)).run();
    }
    db.delete(taskReviews).where(eq(taskReviews.taskId, taskId)).run();
  }

  const reviewId = generateId();
  const timestamp = now();
  db.insert(taskReviews).values({
    id: reviewId, taskId, status: 'analyzing',
    triggeredBy, createdAt: timestamp, updatedAt: timestamp,
  }).run();

  try {
    const ctx = gatherTaskContext(taskId);
    const findings = await analyzeWithAI(ctx);
    const validSubtaskIds = new Set(ctx.subtasks.map(s => s.id));

    db.transaction((tx) => {
      for (const f of findings) {
        tx.insert(taskReviewFindings).values({
          id: generateId(), reviewId, taskId,
          category: f.category, severity: f.severity,
          title: f.title, description: f.description,
          suggestion: f.suggestion || null,
          relatedSubtaskId: (f.relatedSubtaskId && validSubtaskIds.has(f.relatedSubtaskId)) ? f.relatedSubtaskId : null,
          createdAt: timestamp,
        }).run();
      }
      tx.update(taskReviews).set({
        status: 'completed',
        summary: findings.length > 0
          ? findings.map(f => `- \`${f.severity}\` ${f.title}`).join('\n')
          : 'No issues found',
        totalFindings: findings.length,
        updatedAt: now(),
      }).where(eq(taskReviews.id, reviewId)).run();
    });

    return db.select().from(taskReviews).where(eq(taskReviews.id, reviewId)).get();
  } catch (err) {
    db.update(taskReviews).set({ status: 'failed', updatedAt: now() })
      .where(eq(taskReviews.id, reviewId)).run();
    throw err;
  }
}

/** Call AI to analyze task execution */
async function analyzeWithAI(ctx: ReturnType<typeof gatherTaskContext>) {
  const modelId = getModelIdForFeature('task_review_model_id');
  if (!modelId) throw new AppError('VALIDATION_ERROR', 'HR assistant model not configured');

  const [model] = db.select().from(models).where(eq(models.id, modelId)).all();
  if (!model) throw new AppError('NOT_FOUND', `Model ${modelId} not found`);

  const aiModel = createModel({
    apiKey: model.apiKey,
    baseURL: model.baseUrl,
    modelId: model.modelId,
  });

  const toolErrorSamples = ctx.toolCalls.samples
    .filter(tc => tc.isError)
    .slice(0, 10)
    .map(tc => `- ${tc.toolName}: ${sanitizeForLLM((tc.output || '').slice(0, 200))}`).join('\n');

  const subtaskSummary = ctx.subtasks.map(s =>
    `- ${s.title} [${s.status}] tokens:${s.tokenUsage || 0} retries:${s.retryCount || 0}`
  ).join('\n');

  const prompt = `Analyze this task execution and identify issues.

Task: ${ctx.task.title || 'Untitled'} (status: ${ctx.task.status})
Team collaboration mode: ${ctx.team?.collaborationMode || 'unknown'}
Subtasks (${ctx.stats.totalSubtasks} total, ${ctx.stats.completedSubs} completed, ${ctx.stats.failedSubs} failed):
${subtaskSummary}

Tool calls: ${ctx.toolCalls.total} total, ${ctx.toolCalls.errors} errors
${toolErrorSamples ? `Tool error samples:\n${toolErrorSamples}` : ''}

Return a JSON array of findings. Each finding:
{"category":"model_issue|prompt_issue|tool_issue|config_issue|collaboration_issue|efficiency_issue|other","severity":"info|warning|critical","title":"short title","description":"detailed description","suggestion":"actionable suggestion"}

If no issues found, return empty array []. Return ONLY valid JSON array.`;

  const result = await generateText({
    model: aiModel as any,
    system: 'You are a task execution analyst. Analyze the execution data and identify problems. Be concise and actionable. Respond in Chinese.',
    prompt,
  });

  try {
    const parsed = JSON.parse(result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    if (!Array.isArray(parsed)) return [];
    const VALID_CATEGORIES = new Set([
      'model_issue', 'prompt_issue', 'tool_issue', 'config_issue',
      'collaboration_issue', 'efficiency_issue', 'other',
    ]);
    const VALID_SEVERITIES = new Set(['info', 'warning', 'critical']);
    return parsed.filter((f: any) =>
      f.title && f.description &&
      VALID_CATEGORIES.has(f.category) &&
      VALID_SEVERITIES.has(f.severity)
    );
  } catch {
    return [];
  }
}

/** Get the latest review for a task (with findings) */
export function getTaskReviewByTaskId(taskId: string) {
  const [review] = db.select().from(taskReviews)
    .where(eq(taskReviews.taskId, taskId))
    .orderBy(desc(taskReviews.createdAt)).limit(1).all();
  if (!review) return null;

  const findings = db.select().from(taskReviewFindings)
    .where(eq(taskReviewFindings.reviewId, review.id))
    .all();

  return { ...review, findings };
}

/** List findings across tasks with filters */
export function listReviewFindings(opts: {
  category?: string; severity?: string; limit?: number; offset?: number;
}) {
  const { category, severity, limit = 50, offset = 0 } = opts;
  const conditions = [];
  if (category) conditions.push(eq(taskReviewFindings.category, category));
  if (severity) conditions.push(eq(taskReviewFindings.severity, severity));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const findings = db.select({
    id: taskReviewFindings.id,
    reviewId: taskReviewFindings.reviewId,
    taskId: taskReviewFindings.taskId,
    taskTitle: tasks.title,
    category: taskReviewFindings.category,
    severity: taskReviewFindings.severity,
    title: taskReviewFindings.title,
    description: taskReviewFindings.description,
    suggestion: taskReviewFindings.suggestion,
    createdAt: taskReviewFindings.createdAt,
  }).from(taskReviewFindings)
    .leftJoin(tasks, eq(taskReviewFindings.taskId, tasks.id))
    .where(where)
    .orderBy(desc(taskReviewFindings.createdAt))
    .limit(limit).offset(offset).all();

  const [{ total }] = db.select({ total: sql<number>`count(*)` })
    .from(taskReviewFindings).where(where).all();

  return { findings, total };
}

/** Aggregated stats for the review dashboard */
export function getReviewStats() {
  const byCategory = db.select({
    category: taskReviewFindings.category,
    count: sql<number>`count(*)`,
  }).from(taskReviewFindings).groupBy(taskReviewFindings.category).all();

  const bySeverity = db.select({
    severity: taskReviewFindings.severity,
    count: sql<number>`count(*)`,
  }).from(taskReviewFindings).groupBy(taskReviewFindings.severity).all();

  const [{ totalReviews }] = db.select({ totalReviews: sql<number>`count(*)` })
    .from(taskReviews).where(eq(taskReviews.status, 'completed')).all();

  const [{ totalFindings }] = db.select({ totalFindings: sql<number>`count(*)` })
    .from(taskReviewFindings).all();

  return { byCategory, bySeverity, totalReviews, totalFindings };
}
