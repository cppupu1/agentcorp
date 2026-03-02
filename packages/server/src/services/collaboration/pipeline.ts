import { db, subtasks, tasks, now } from '@agentcorp/db';
import { eq, and } from 'drizzle-orm';
import type { CollaborationStrategy, CollaborationContext } from './types.js';
import { executeSubtask, completeTask, failTask, loadTeamToolIds } from '../task-executor.js';
import { sseManager } from '../sse-manager.js';

export class PipelineStrategy implements CollaborationStrategy {
  async execute(ctx: CollaborationContext): Promise<void> {
    const { taskId, teamId, signal } = ctx;

    const taskSubtasks = await db.select().from(subtasks)
      .where(eq(subtasks.taskId, taskId))
      .orderBy(subtasks.sortOrder);

    if (taskSubtasks.length === 0) {
      await failTask(taskId, '没有子任务可执行');
      return;
    }

    const teamToolIds = await loadTeamToolIds(teamId);
    let previousOutput = '';

    for (const st of taskSubtasks) {
      if (signal.aborted) {
        await failTask(taskId, '任务被取消');
        return;
      }

      const instruction = previousOutput
        ? `${st.description || st.title}\n\n前一步骤的输出:\n${previousOutput}`
        : (st.description || st.title);

      const assigneeId = st.assigneeId;
      if (!assigneeId) {
        await failTask(taskId, `子任务 ${st.id} 未分配执行人`);
        return;
      }

      const maxRetries = st.maxRetries ?? 2;
      let result = '';
      let succeeded = false;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          // Reset subtask status for retry
          await db.update(subtasks).set({ status: 'pending', updatedAt: now() })
            .where(and(eq(subtasks.id, st.id), eq(subtasks.taskId, taskId)));
          sseManager.emit(taskId, 'pipeline_retry', {
            subtaskId: st.id, attempt, maxRetries,
          });
        }

        result = await executeSubtask(taskId, st.id, assigneeId, instruction, teamToolIds, signal, undefined, { skipDependencyCheck: true });

        if (!result.startsWith('[子任务执行失败]')) {
          succeeded = true;
          break;
        }
      }

      if (!succeeded) {
        await failTask(taskId, `流水线中断: 子任务 "${st.title}" 重试 ${maxRetries} 次后仍失败`);
        return;
      }

      previousOutput = result;
    }

    // All subtasks completed
    await completeTask(taskId, '流水线执行完成', previousOutput);
  }
}
