import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import * as knowledgeService from '../services/knowledge.js';

export function registerKnowledgeRoutes(app: FastifyInstance) {
  // List all knowledge bases
  app.get('/api/knowledge-bases', async () => {
    return { data: await knowledgeService.listKnowledgeBases() };
  });

  // Get knowledge base with documents
  app.get<{ Params: { id: string } }>('/api/knowledge-bases/:id', async (req) => {
    return { data: await knowledgeService.getKnowledgeBase(req.params.id) };
  });

  // Create knowledge base
  app.post<{ Body: { name?: string; description?: string } }>('/api/knowledge-bases', async (req, reply) => {
    const { name, description } = req.body;
    if (!name || name.length < 1 || name.length > 100) {
      throw new AppError('VALIDATION_ERROR', '请求参数校验失败', {
        details: [{ field: 'name', rule: 'required', message: 'name 必填，1-100 字符' }],
      });
    }
    const kb = await knowledgeService.createKnowledgeBase({ name, description });
    return reply.status(201).send({ data: kb });
  });

  // Update knowledge base
  app.put<{ Params: { id: string }; Body: { name?: string; description?: string } }>(
    '/api/knowledge-bases/:id', async (req) => {
      return { data: await knowledgeService.updateKnowledgeBase(req.params.id, req.body) };
    }
  );

  // Delete knowledge base
  app.delete<{ Params: { id: string } }>('/api/knowledge-bases/:id', async (req) => {
    return { data: await knowledgeService.deleteKnowledgeBase(req.params.id) };
  });

  // Add document to knowledge base
  app.post<{ Params: { id: string }; Body: { title?: string; content?: string; mimeType?: string } }>(
    '/api/knowledge-bases/:id/documents', async (req, reply) => {
      const { title, content, mimeType } = req.body;
      const errors: Array<{ field: string; rule: string; message: string }> = [];
      if (!title || title.length < 1) {
        errors.push({ field: 'title', rule: 'required', message: 'title 必填' });
      }
      if (!content || content.length < 1) {
        errors.push({ field: 'content', rule: 'required', message: 'content 必填' });
      }
      if (errors.length > 0) {
        throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
      }
      const doc = await knowledgeService.addDocument(req.params.id, title!, content!, mimeType);
      return reply.status(201).send({ data: doc });
    }
  );

  // Get document with chunks
  app.get<{ Params: { id: string; docId: string } }>(
    '/api/knowledge-bases/:id/documents/:docId', async (req) => {
      return { data: await knowledgeService.getDocument(req.params.docId) };
    }
  );

  // Delete document
  app.delete<{ Params: { id: string; docId: string } }>(
    '/api/knowledge-bases/:id/documents/:docId', async (req) => {
      return { data: await knowledgeService.deleteDocument(req.params.docId) };
    }
  );

  // Search within knowledge base
  app.get<{ Params: { id: string }; Querystring: { q?: string; limit?: string } }>(
    '/api/knowledge-bases/:id/search', async (req) => {
      const { q, limit } = req.query;
      if (!q) {
        throw new AppError('VALIDATION_ERROR', '搜索关键词不能为空', {
          details: [{ field: 'q', rule: 'required', message: 'q 参数必填' }],
        });
      }
      const parsedLimit = limit ? parseInt(limit, 10) : 10;
      const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 10;
      return { data: await knowledgeService.searchKnowledge(req.params.id, q, safeLimit) };
    }
  );

  // ---- Employee KB assignments ----

  // Get employee's knowledge bases
  app.get<{ Params: { id: string } }>('/api/employees/:id/knowledge-bases', async (req) => {
    return { data: await knowledgeService.getEmployeeKnowledgeBases(req.params.id) };
  });

  // Assign KB to employee
  app.post<{ Params: { id: string }; Body: { knowledgeBaseId?: string } }>(
    '/api/employees/:id/knowledge-bases', async (req, reply) => {
      const { knowledgeBaseId } = req.body;
      if (!knowledgeBaseId) {
        throw new AppError('VALIDATION_ERROR', '请求参数校验失败', {
          details: [{ field: 'knowledgeBaseId', rule: 'required', message: 'knowledgeBaseId 必填' }],
        });
      }
      const result = await knowledgeService.assignKnowledgeBase(req.params.id, knowledgeBaseId);
      return reply.status(201).send({ data: result });
    }
  );

  // Remove KB from employee
  app.delete<{ Params: { id: string; kbId: string } }>(
    '/api/employees/:id/knowledge-bases/:kbId', async (req) => {
      return { data: await knowledgeService.removeKnowledgeBase(req.params.id, req.params.kbId) };
    }
  );
}
