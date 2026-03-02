import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import * as systemService from '../services/system.js';
import { resetBuiltinEmployees } from '../services/builtin-employees.js';

export function registerSystemRoutes(app: FastifyInstance) {
  // Get system status
  app.get('/api/system/status', async () => {
    return { data: { status: systemService.getSystemStatus() } };
  });

  // Emergency stop
  app.post('/api/system/emergency-stop', async () => {
    await systemService.emergencyStop();
    return { data: { status: 'frozen' } };
  });

  // Emergency resume
  app.post('/api/system/emergency-resume', async () => {
    await systemService.emergencyResume();
    return { data: { status: 'normal' } };
  });

  // Get all settings
  app.get('/api/system/settings', async () => {
    return { data: systemService.getSettings() };
  });

  // Get single setting
  app.get<{ Params: { key: string } }>('/api/system/settings/:key', async (req) => {
    const value = systemService.getSetting(req.params.key);
    if (value === null) throw new AppError('NOT_FOUND', `设置项 ${req.params.key} 不存在`);
    return { data: { key: req.params.key, value } };
  });

  // Update setting
  app.put<{ Params: { key: string }; Body: { value: string } }>('/api/system/settings/:key', async (req) => {
    const { value } = req.body;
    if (value === undefined || value === null) {
      throw new AppError('VALIDATION_ERROR', 'value 必填', {
        details: [{ field: 'value', rule: 'required', message: 'value 必填' }],
      });
    }
    systemService.updateSetting(req.params.key, String(value));
    return { data: { key: req.params.key, value: String(value) } };
  });

  // Reset employees and teams to factory defaults
  app.post<{ Body: { confirm: string } }>('/api/system/reset-employees', async (req) => {
    const { confirm } = req.body ?? {};
    if (confirm !== 'RESET') {
      throw new AppError('VALIDATION_ERROR', '请传入 confirm: "RESET" 以确认操作');
    }
    const result = await resetBuiltinEmployees();
    return { data: result };
  });
}
