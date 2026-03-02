import { db, models, modelPricing, employees, generateId, now } from '@agentcorp/db';
import { eq, like } from 'drizzle-orm';
import { AppError } from '../errors.js';

// Omit apiKey from response, attach pricing
function omitApiKey(model: typeof models.$inferSelect, pricing?: { inputPricePerMToken: number | null; outputPricePerMToken: number | null } | null) {
  const { apiKey, ...rest } = model;
  return {
    ...rest,
    inputPricePerMToken: pricing?.inputPricePerMToken ?? null,
    outputPricePerMToken: pricing?.outputPricePerMToken ?? null,
  };
}

export async function listModels() {
  const rows = await db
    .select({ model: models, pricing: modelPricing })
    .from(models)
    .leftJoin(modelPricing, eq(models.id, modelPricing.modelId))
    .orderBy(models.createdAt);
  return rows.map(r => omitApiKey(r.model, r.pricing));
}

export async function getModel(id: string) {
  const [row] = await db
    .select({ model: models, pricing: modelPricing })
    .from(models)
    .leftJoin(modelPricing, eq(models.id, modelPricing.modelId))
    .where(eq(models.id, id));
  if (!row) throw new AppError('NOT_FOUND', `模型 ${id} 不存在`);
  return omitApiKey(row.model, row.pricing);
}

export async function getModelWithKey(id: string) {
  const [row] = await db.select().from(models).where(eq(models.id, id));
  if (!row) throw new AppError('NOT_FOUND', `模型 ${id} 不存在`);
  return row;
}

interface CreateModelInput {
  name: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  notes?: string;
}

export async function createModel(input: CreateModelInput) {
  const id = generateId();
  const timestamp = now();
  const [row] = await db.insert(models).values({
    id,
    name: input.name,
    baseUrl: input.baseUrl,
    modelId: input.modelId,
    apiKey: input.apiKey,
    notes: input.notes ?? '',
    status: 'untested',
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning();
  return omitApiKey(row);
}

interface UpdateModelInput {
  name?: string;
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
  notes?: string;
}

export async function updateModel(id: string, input: UpdateModelInput) {
  // Check exists
  await getModel(id);

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.baseUrl !== undefined) updates.baseUrl = input.baseUrl;
  if (input.modelId !== undefined) updates.modelId = input.modelId;
  if (input.apiKey !== undefined && input.apiKey !== '') updates.apiKey = input.apiKey;
  if (input.notes !== undefined) updates.notes = input.notes;

  await db.update(models).set(updates).where(eq(models.id, id));
  return getModel(id);
}

export async function deleteModel(id: string) {
  // Check exists
  await getModel(id);

  // Check references
  const refs = await db.select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.modelId, id));

  if (refs.length > 0) {
    throw new AppError('CONFLICT', `该模型被 ${refs.length} 个员工引用，无法删除`, {
      references: refs.map(r => ({ type: 'employee', id: r.id, name: r.name })),
    });
  }

  await db.delete(models).where(eq(models.id, id));
  return { id };
}

export async function updateModelStatus(id: string, status: string) {
  await db.update(models).set({ status, updatedAt: now() }).where(eq(models.id, id));
}
