import type { FastifyInstance } from 'fastify';
import { createTaskReview, getTaskReviewByTaskId, listReviewFindings, getReviewStats } from '../services/task-review.js';
import { AppError } from '../errors.js';

export function registerTaskReviewRoutes(app: FastifyInstance) {
  // Get review for a task
  app.get('/api/tasks/:taskId/review', async (req) => {
    const { taskId } = req.params as { taskId: string };
    const review = getTaskReviewByTaskId(taskId);
    return { data: review };
  });

  // Trigger (or re-trigger) a review
  app.post('/api/tasks/:taskId/review', async (req) => {
    const { taskId } = req.params as { taskId: string };
    const review = await createTaskReview(taskId, 'manual');
    return { data: review };
  });

  // List findings across all tasks
  app.get('/api/reviews/findings', async (req) => {
    const query = req.query as { category?: string; severity?: string; limit?: string; offset?: string };
    const parsedLimit = query.limit ? parseInt(query.limit, 10) : undefined;
    const parsedOffset = query.offset ? parseInt(query.offset, 10) : undefined;
    const result = listReviewFindings({
      category: query.category,
      severity: query.severity,
      limit: Number.isFinite(parsedLimit) && parsedLimit! > 0 ? Math.min(parsedLimit!, 200) : undefined,
      offset: Number.isFinite(parsedOffset) && parsedOffset! >= 0 ? parsedOffset : undefined,
    });
    return { data: result };
  });

  // Aggregated stats
  app.get('/api/reviews/stats', async () => {
    const stats = getReviewStats();
    return { data: stats };
  });
}
