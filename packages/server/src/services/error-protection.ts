import { db, errorTraces, subtasks, tasks, teamMembers, generateId, now } from '@agentcorp/db';
import { eq, and } from 'drizzle-orm';
import { sseManager } from './sse-manager.js';
import { summarizeError } from './error-summarizer.js';

// Validate subtask output (basic quality check)
export async function validateSubtaskOutput(subtaskId: string, output: string): Promise<{ valid: boolean; reason?: string }> {
  if (!output || output.trim().length === 0) {
    return { valid: false, reason: '输出为空' };
  }
  if (output.trim().length < 10) {
    return { valid: false, reason: '输出内容过短，可能不完整' };
  }
  if (output.includes('Error:') && output.length < 100) {
    return { valid: false, reason: '输出包含错误信息' };
  }
  const normalized = output.replace(/\s+/g, ' ');
  const unfinishedPatterns = [
    /任务状态[：:]\s*部分完成/i,
    /重试次数已达上限/i,
    /执行过程中遇到(?:技术|系统).{0,8}(?:障碍|异常)/i,
    /系统多次返回异常状态/i,
    /未能(?:正常)?(?:获取|产出|完成|执行)/i,
    /无法(?:获取|产出|完成|执行)/i,
    /未产出符合要求/i,
    /未收到(?:具体)?(?:项目)?(?:文档|素材|原文|输入)/i,
    /由于(?:未|缺少).{0,10}(?:提供|收到).{0,12}(?:文档|素材|原文|输入)/i,
    /以下为通用.{0,20}(?:模板|方案)/i,
  ];
  if (unfinishedPatterns.some(pattern => pattern.test(normalized))) {
    return { valid: false, reason: '输出显示任务未完成或仅部分完成' };
  }
  return { valid: true };
}

// Handle subtask failure with retry logic
export async function handleSubtaskFailure(
  taskId: string,
  subtaskId: string,
  error: string,
  errorType: string = 'execution_error',
): Promise<{ action: 'retried' | 'reassigned' | 'skipped' | 'escalated'; message: string }> {
  const [st] = await db.select().from(subtasks).where(eq(subtasks.id, subtaskId));
  if (!st) return { action: 'escalated', message: '子任务不存在' };
  const [taskState] = await db.select({ status: tasks.status, teamId: tasks.teamId }).from(tasks).where(eq(tasks.id, taskId));
  if (!taskState || !['executing', 'paused'].includes(taskState.status ?? '')) {
    return { action: 'skipped', message: '任务已结束，跳过重试与重分配' };
  }

  const retryCount = st.retryCount ?? 0;
  const maxRetries = st.maxRetries ?? 2;
  const hardStopPattern = /repeated tool loop|tool-call limit exceeded|token limit exceeded/i;
  const shouldHardStop = hardStopPattern.test(error || '');

  // Record error trace
  const traceId = generateId();
  await db.insert(errorTraces).values({
    id: traceId,
    taskId,
    subtaskId,
    errorType,
    errorMessage: error,
    retryAttempt: retryCount,
    createdAt: now(),
  });

  // Fire-and-forget AI summary generation
  summarizeError(traceId, error);

  // Retry if under limit (except hard-stop errors that are unlikely to recover by retrying)
  if (!shouldHardStop && retryCount < maxRetries) {
    await db.update(subtasks).set({
      status: 'pending',
      retryCount: retryCount + 1,
      output: null,
      updatedAt: now(),
    }).where(eq(subtasks.id, subtaskId));

    await db.update(errorTraces).set({ resolution: 'retried' }).where(eq(errorTraces.id, traceId));

    sseManager.emit(taskId, 'error_protection', {
      subtaskId,
      action: 'retried',
      retryCount: retryCount + 1,
      maxRetries,
      message: `子任务将重试 (${retryCount + 1}/${maxRetries})`,
    });

    return { action: 'retried', message: `重试中 (${retryCount + 1}/${maxRetries})` };
  }

  // Max retries exceeded - try reassignment
  if (taskState?.teamId && st.assigneeId) {
    // Check if we've already reassigned for this subtask (prevent infinite loop)
    const reassignTraces = await db.select({ id: errorTraces.id })
      .from(errorTraces)
      .where(and(eq(errorTraces.taskId, taskId), eq(errorTraces.subtaskId, subtaskId), eq(errorTraces.resolution, 'reassigned')));

    if (reassignTraces.length > 0) {
      // Already reassigned once before — escalate instead of looping
      await db.update(errorTraces).set({ resolution: 'escalated' }).where(eq(errorTraces.id, traceId));
      sseManager.emit(taskId, 'error_protection', { subtaskId, action: 'escalated', message: '多次重新分配后仍失败，已上报' });
      return { action: 'escalated', message: '多次重新分配后仍失败，已上报PM处理' };
    }

    const alternates = await db.select({ employeeId: teamMembers.employeeId })
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, taskState.teamId),
        eq(teamMembers.role, 'member'),
      ));

    const altEmployee = alternates.find(a => a.employeeId !== st.assigneeId);
    if (altEmployee) {
      await db.update(subtasks).set({
        status: 'pending',
        assigneeId: altEmployee.employeeId,
        retryCount: 0,
        output: null,
        updatedAt: now(),
      }).where(eq(subtasks.id, subtaskId));

      await db.update(errorTraces).set({ resolution: 'reassigned' }).where(eq(errorTraces.id, traceId));

      sseManager.emit(taskId, 'error_protection', {
        subtaskId,
        action: 'reassigned',
        newAssigneeId: altEmployee.employeeId,
        message: '已重新分配给其他员工',
      });

      return { action: 'reassigned', message: '已重新分配给其他员工' };
    }
  }

  // No alternative - escalate
  await db.update(errorTraces).set({ resolution: 'escalated' }).where(eq(errorTraces.id, traceId));

  sseManager.emit(taskId, 'error_protection', {
    subtaskId,
    action: 'escalated',
    message: '重试次数已用尽，已上报',
  });

  return { action: 'escalated', message: '重试次数已用尽，已上报PM处理' };
}

// Get error trace for a task
export async function getErrorTrace(taskId: string) {
  return db.select({
    id: errorTraces.id,
    taskId: errorTraces.taskId,
    subtaskId: errorTraces.subtaskId,
    subtaskTitle: subtasks.title,
    errorType: errorTraces.errorType,
    errorMessage: errorTraces.errorMessage,
    aiSummary: errorTraces.aiSummary,
    retryAttempt: errorTraces.retryAttempt,
    resolution: errorTraces.resolution,
    createdAt: errorTraces.createdAt,
  })
  .from(errorTraces)
  .leftJoin(subtasks, eq(errorTraces.subtaskId, subtasks.id))
  .where(eq(errorTraces.taskId, taskId))
  .orderBy(errorTraces.createdAt);
}
