import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import * as employeeService from '../services/employees.js';
import { triggerChangeTests } from '../services/change-testing.js';
import { db, employees } from '@agentcorp/db';
import { sql } from 'drizzle-orm';

interface EmployeeBody {
  name?: string;
  avatar?: string;
  description?: string;
  modelId?: string;
  systemPrompt?: string;
  tags?: string[];
  toolIds?: string[];
}

function validateCreate(body: EmployeeBody) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (!body.name || body.name.length < 1 || body.name.length > 100) {
    errors.push({ field: 'name', rule: 'required', message: 'name 必填，1-100 字符' });
  }
  if (!body.modelId) {
    errors.push({ field: 'modelId', rule: 'required', message: 'modelId 必填' });
  }
  if (!body.systemPrompt) {
    errors.push({ field: 'systemPrompt', rule: 'required', message: 'systemPrompt 必填' });
  }
  if (body.tags && body.tags.length > 20) {
    errors.push({ field: 'tags', rule: 'maxItems', message: '标签最多 20 个' });
  }
  if (body.tags) {
    for (const tag of body.tags) {
      if (tag.length < 1 || tag.length > 30) {
        errors.push({ field: 'tags', rule: 'itemLength', message: '每个标签 1-30 字符' });
        break;
      }
    }
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerEmployeeRoutes(app: FastifyInstance) {
  // List
  app.get<{ Querystring: { tag?: string; search?: string } }>('/api/employees', async (req) => {
    return { data: await employeeService.listEmployees(req.query.tag, req.query.search) };
  });

  // Tags
  app.get('/api/employees/tags', async () => {
    return { data: await employeeService.listTags() };
  });

  // Statuses (derived from subtasks)
  app.get('/api/employees/statuses', async () => {
    return { data: await employeeService.getEmployeeStatuses() };
  });

  // Growth stats
  app.get('/api/employees/growth-stats', async () => {
    const stats = await db.select({
      employeeId: employees.id,
      overallScore: sql<number | null>`(
        SELECT overall_score FROM employee_competency_scores
        WHERE employee_id = ${employees.id}
        ORDER BY period DESC LIMIT 1
      )`,
      taskCount: sql<number>`(
        SELECT count(*) FROM subtasks WHERE assignee_id = ${employees.id}
      )`,
    }).from(employees);
    return { data: stats };
  });

  // Export (before /:id to avoid conflict)
  app.post<{ Body: { ids: string[] } }>('/api/employees/export', async (req) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError('VALIDATION_ERROR', '请选择要导出的员工', {
        details: [{ field: 'ids', rule: 'required', message: 'ids 必填且不能为空' }],
      });
    }
    return { data: await employeeService.exportEmployees(ids) };
  });

  // Import (before /:id to avoid conflict)
  app.post<{ Body: { employees: Array<Record<string, unknown>>; modelId: string } }>('/api/employees/import', async (req, reply) => {
    const { employees: empData, modelId } = req.body;
    if (!Array.isArray(empData) || empData.length === 0) {
      throw new AppError('VALIDATION_ERROR', '导入数据不能为空', {
        details: [{ field: 'employees', rule: 'required', message: 'employees 必填且不能为空' }],
      });
    }
    if (!modelId) {
      throw new AppError('VALIDATION_ERROR', 'modelId 必填', {
        details: [{ field: 'modelId', rule: 'required', message: 'modelId 必填' }],
      });
    }
    const result = await employeeService.importEmployees(empData as any, modelId);
    return reply.status(201).send({ data: result });
  });

  // Auto-assign tools to ALL employees (before /:id to avoid conflict)
  app.post('/api/employees/auto-assign-tools', async () => {
    return { data: await employeeService.autoAssignToolsForAll() };
  });

  // Get by ID
  app.get<{ Params: { id: string } }>('/api/employees/:id', async (req) => {
    return { data: await employeeService.getEmployee(req.params.id) };
  });

  // Create
  app.post<{ Body: EmployeeBody }>('/api/employees', async (req, reply) => {
    validateCreate(req.body);
    const emp = await employeeService.createEmployee(
      req.body as Required<Pick<EmployeeBody, 'name' | 'modelId' | 'systemPrompt'>> & Partial<EmployeeBody>
    );
    return reply.status(201).send({ data: emp });
  });

  // Update
  app.put<{ Params: { id: string }; Body: EmployeeBody }>('/api/employees/:id', async (req) => {
    const result = await employeeService.updateEmployee(req.params.id, req.body);
    // Fire-and-forget: trigger change tests
    triggerChangeTests('employee_updated', req.params.id, { fields: Object.keys(req.body) })
      .catch(err => console.error('Change test trigger failed:', err));
    return { data: result };
  });

  // Delete
  app.delete<{ Params: { id: string } }>('/api/employees/:id', async (req) => {
    return { data: await employeeService.deleteEmployee(req.params.id) };
  });

  // Copy
  app.post<{ Params: { id: string } }>('/api/employees/:id/copy', async (req, reply) => {
    const emp = await employeeService.copyEmployee(req.params.id);
    return reply.status(201).send({ data: emp });
  });

  // Auto-assign tools to a single employee
  app.post<{ Params: { id: string } }>('/api/employees/:id/auto-assign-tools', async (req) => {
    return { data: await employeeService.autoAssignToolsForEmployee(req.params.id) };
  });

}
