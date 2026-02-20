import type { FastifyInstance } from 'fastify';
import { db, subtasks, tasks, employees } from '@agentcorp/db';
import { eq } from 'drizzle-orm';
import { AppError } from '../errors.js';

function safeJsonParse(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

export function registerVisualizationRoutes(app: FastifyInstance) {
  // Get DAG data for a task
  app.get<{ Params: { id: string } }>('/api/tasks/:id/dag', async (req) => {
    const taskId = req.params.id;

    // Verify task exists
    const [task] = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
    }).from(tasks).where(eq(tasks.id, taskId)).limit(1);

    if (!task) {
      throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);
    }

    // Get subtasks with assignee names
    const rows = await db.select({
      id: subtasks.id,
      title: subtasks.title,
      status: subtasks.status,
      assigneeId: subtasks.assigneeId,
      assigneeName: employees.name,
      dependsOn: subtasks.dependsOn,
      sortOrder: subtasks.sortOrder,
    })
      .from(subtasks)
      .leftJoin(employees, eq(subtasks.assigneeId, employees.id))
      .where(eq(subtasks.taskId, taskId))
      .orderBy(subtasks.sortOrder);

    const nodes = rows.map(r => ({
      id: r.id,
      title: r.title,
      status: r.status ?? 'pending',
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName ?? '未分配',
    }));

    const edges: Array<{ source: string; target: string }> = [];
    for (const r of rows) {
      const deps: string[] = r.dependsOn ? safeJsonParse(r.dependsOn) : [];
      for (const dep of deps) {
        edges.push({ source: dep, target: r.id });
      }
    }

    const total = nodes.length;
    const completed = nodes.filter(n => n.status === 'completed').length;
    const executing = nodes.filter(n => n.status === 'executing' || n.status === 'running').length;
    const failed = nodes.filter(n => n.status === 'failed').length;

    return {
      data: {
        task: { title: task.title, status: task.status },
        nodes,
        edges,
        stats: { total, completed, executing, failed, pending: total - completed - executing - failed },
      },
    };
  });
}
