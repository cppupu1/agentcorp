import 'dotenv/config';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { registerErrorHandler } from './errors.js';
import { registerHealthRoute } from './routes/health.js';
import { registerModelRoutes } from './routes/models.js';
import { registerToolRoutes } from './routes/tools.js';
import { registerEmployeeRoutes } from './routes/employees.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerTeamRoutes } from './routes/teams.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerWebhookConfigRoutes } from './routes/webhook-configs.js';
import { registerCostRoutes } from './routes/cost.js';
import { registerObservabilityRoutes } from './routes/observability.js';
import { registerObserverRoutes } from './routes/observer.js';
import { registerIncidentRoutes } from './routes/incidents.js';
import { registerPolicyRoutes } from './routes/policies.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerTriggerRoutes } from './routes/triggers.js';
import { registerEvidenceRoutes } from './routes/evidence.js';
import { registerDeploymentRoutes } from './routes/deployment.js';
import { registerVisualizationRoutes } from './routes/visualization.js';
import { registerChangeTestingRoutes } from './routes/change-testing.js';
import { registerTestingRoutes } from './routes/testing.js';
import { registerHrAssistantRoutes } from './routes/hr-assistant.js';
import { registerQualityDashboardRoutes } from './routes/quality-dashboard.js';
import { registerRoiReviewRoutes } from './routes/roi-review.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerSelfImprovementRoutes } from './routes/self-improvement.js';
import { registerAiParseRoutes } from './routes/ai-parse.js';
import { sseManager } from './services/sse-manager.js';
import { recoverStuckTasks, cancelAllExecutions } from './services/task-executor.js';
import { seedBuiltinPolicies } from './services/policies.js';
import { initCronScheduler, stopCronScheduler } from './services/triggers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// CORS - restrict to known origins
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
await app.register(cors, { origin: allowedOrigins });

// Error handler
registerErrorHandler(app);

// Routes
registerHealthRoute(app);
registerModelRoutes(app);
registerToolRoutes(app);
registerEmployeeRoutes(app);
registerChatRoutes(app);
registerTeamRoutes(app);
registerTaskRoutes(app);
registerTemplateRoutes(app);
registerSystemRoutes(app);
registerNotificationRoutes(app);
registerWebhookConfigRoutes(app);
registerCostRoutes(app);
registerObservabilityRoutes(app);
registerObserverRoutes(app);
registerIncidentRoutes(app);
registerPolicyRoutes(app);
registerKnowledgeRoutes(app);
registerTriggerRoutes(app);
registerEvidenceRoutes(app);
registerDeploymentRoutes(app);
registerVisualizationRoutes(app);
registerChangeTestingRoutes(app);
registerTestingRoutes(app);
registerHrAssistantRoutes(app);
registerQualityDashboardRoutes(app);
registerRoiReviewRoutes(app);
registerMemoryRoutes(app);
registerSelfImprovementRoutes(app);
registerAiParseRoutes(app);

// Serve frontend static files (production mode)
const webDistPath = resolve(__dirname, '../../web/dist');
if (existsSync(webDistPath)) {
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    wildcard: false,
  });
  // SPA fallback: serve index.html for non-API routes
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `路由 ${req.method} ${req.url} 不存在` } });
    }
    return reply.sendFile('index.html');
  });
}

// Start SSE heartbeat
sseManager.start();

// Graceful shutdown
const shutdown = async () => {
  await cancelAllExecutions();
  stopCronScheduler();
  sseManager.stop();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
const port = parseInt(process.env.PORT || '3000', 10);
try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Server running on http://localhost:${port}`);

  // Recover tasks stuck in 'executing' from previous run (after server is ready)
  recoverStuckTasks().catch(err => {
    console.error('Failed to recover stuck tasks:', err);
  });

  // Seed built-in policy packages
  seedBuiltinPolicies().catch(err => {
    console.error('Failed to seed built-in policies:', err);
  });

  // Start cron scheduler for triggers
  initCronScheduler();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
