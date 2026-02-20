import {
  db, knowledgeBases, knowledgeDocuments, knowledgeChunks,
  employeeKnowledgeBases, generateId, now,
} from '@agentcorp/db';
import { eq, sql, and, like, inArray } from 'drizzle-orm';
import { AppError } from '../errors.js';

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

// ---- Knowledge Bases ----

export async function listKnowledgeBases() {
  const docCountSq = db
    .select({
      knowledgeBaseId: knowledgeDocuments.knowledgeBaseId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(knowledgeDocuments)
    .groupBy(knowledgeDocuments.knowledgeBaseId)
    .as('dc');

  const rows = await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      documentCount: sql<number>`coalesce(${docCountSq.count}, 0)`,
      createdAt: knowledgeBases.createdAt,
      updatedAt: knowledgeBases.updatedAt,
    })
    .from(knowledgeBases)
    .leftJoin(docCountSq, eq(knowledgeBases.id, docCountSq.knowledgeBaseId))
    .orderBy(knowledgeBases.createdAt);

  return rows.map(r => ({ ...r, documentCount: Number(r.documentCount) }));
}

export async function getKnowledgeBase(id: string) {
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
  if (!kb) throw new AppError('NOT_FOUND', `知识库 ${id} 不存在`);

  const docs = await db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      mimeType: knowledgeDocuments.mimeType,
      chunkCount: knowledgeDocuments.chunkCount,
      createdAt: knowledgeDocuments.createdAt,
      updatedAt: knowledgeDocuments.updatedAt,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.knowledgeBaseId, id))
    .orderBy(knowledgeDocuments.createdAt);

  return { ...kb, documents: docs };
}

export async function createKnowledgeBase(data: { name: string; description?: string }) {
  const id = generateId();
  const timestamp = now();
  await db.insert(knowledgeBases).values({
    id,
    name: data.name,
    description: data.description ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return getKnowledgeBase(id);
}

export async function updateKnowledgeBase(id: string, data: { name?: string; description?: string }) {
  const [existing] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `知识库 ${id} 不存在`);

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;

  await db.update(knowledgeBases).set(updates).where(eq(knowledgeBases.id, id));
  return getKnowledgeBase(id);
}

export async function deleteKnowledgeBase(id: string) {
  const [existing] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `知识库 ${id} 不存在`);

  // Cascade: delete chunks -> documents -> employee assignments -> KB (atomic)
  db.transaction((tx) => {
    const docIds = tx.select({ id: knowledgeDocuments.id })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.knowledgeBaseId, id))
      .all()
      .map(d => d.id);

    if (docIds.length > 0) {
      tx.delete(knowledgeChunks).where(inArray(knowledgeChunks.documentId, docIds)).run();
      tx.delete(knowledgeDocuments).where(eq(knowledgeDocuments.knowledgeBaseId, id)).run();
    }
    tx.delete(employeeKnowledgeBases).where(eq(employeeKnowledgeBases.knowledgeBaseId, id)).run();
    tx.delete(knowledgeBases).where(eq(knowledgeBases.id, id)).run();
  });
  return { id };
}

// ---- Documents ----

function chunkText(text: string, maxChars = 500): string[] {
  // Split by paragraphs first, then merge small ones / split large ones
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length + 1 > maxChars && buffer.length > 0) {
      chunks.push(buffer.trim());
      buffer = '';
    }
    if (para.length > maxChars) {
      // Split long paragraph by sentences
      if (buffer.length > 0) { chunks.push(buffer.trim()); buffer = ''; }
      let remaining = para;
      while (remaining.length > maxChars) {
        let splitIdx = remaining.lastIndexOf('。', maxChars);
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf('. ', maxChars);
        if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(' ', maxChars);
        if (splitIdx <= 0) splitIdx = maxChars;
        chunks.push(remaining.slice(0, splitIdx + 1).trim());
        remaining = remaining.slice(splitIdx + 1);
      }
      if (remaining.trim()) buffer = remaining;
    } else {
      buffer += (buffer ? '\n\n' : '') + para;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks.length > 0 ? chunks : [text.trim() || ''];
}

export async function addDocument(kbId: string, title: string, content: string, mimeType?: string) {
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  if (!kb) throw new AppError('NOT_FOUND', `知识库 ${kbId} 不存在`);

  const docId = generateId();
  const timestamp = now();
  const chunks = chunkText(content);

  db.transaction((tx) => {
    tx.insert(knowledgeDocuments).values({
      id: docId,
      knowledgeBaseId: kbId,
      title,
      content,
      mimeType: mimeType ?? 'text/plain',
      chunkCount: chunks.length,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    for (let i = 0; i < chunks.length; i++) {
      tx.insert(knowledgeChunks).values({
        id: generateId(),
        documentId: docId,
        content: chunks[i],
        sortOrder: i,
        createdAt: timestamp,
      }).run();
    }

    tx.update(knowledgeBases).set({ updatedAt: timestamp }).where(eq(knowledgeBases.id, kbId)).run();
  });

  return getDocument(docId);
}

export async function getDocument(id: string) {
  const [doc] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  if (!doc) throw new AppError('NOT_FOUND', `文档 ${id} 不存在`);

  const chunks = await db
    .select({ id: knowledgeChunks.id, content: knowledgeChunks.content, sortOrder: knowledgeChunks.sortOrder })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, id))
    .orderBy(knowledgeChunks.sortOrder);

  return { ...doc, chunks };
}

export async function deleteDocument(id: string) {
  const [doc] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  if (!doc) throw new AppError('NOT_FOUND', `文档 ${id} 不存在`);

  db.transaction((tx) => {
    tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, id)).run();
    tx.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).run();
    tx.update(knowledgeBases).set({ updatedAt: now() }).where(eq(knowledgeBases.id, doc.knowledgeBaseId)).run();
  });

  return { id };
}

// ---- Search ----

export async function searchKnowledge(kbId: string, query: string, limit = 10) {
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  if (!kb) throw new AppError('NOT_FOUND', `知识库 ${kbId} 不存在`);

  const pattern = `%${escapeLike(query)}%`;
  const results = await db
    .select({
      chunkId: knowledgeChunks.id,
      chunkContent: knowledgeChunks.content,
      documentId: knowledgeDocuments.id,
      documentTitle: knowledgeDocuments.title,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(and(
      eq(knowledgeDocuments.knowledgeBaseId, kbId),
      like(knowledgeChunks.content, pattern),
    ))
    .limit(limit);

  return results;
}

// ---- Employee KB assignments ----

export async function getEmployeeKnowledgeBases(employeeId: string) {
  const rows = await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
    })
    .from(employeeKnowledgeBases)
    .innerJoin(knowledgeBases, eq(employeeKnowledgeBases.knowledgeBaseId, knowledgeBases.id))
    .where(eq(employeeKnowledgeBases.employeeId, employeeId));

  return rows;
}

export async function assignKnowledgeBase(employeeId: string, kbId: string) {
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  if (!kb) throw new AppError('NOT_FOUND', `知识库 ${kbId} 不存在`);

  try {
    await db.insert(employeeKnowledgeBases).values({ employeeId, knowledgeBaseId: kbId });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      throw new AppError('CONFLICT', '该知识库已分配给此员工');
    }
    throw err;
  }
  return { employeeId, knowledgeBaseId: kbId };
}

export async function removeKnowledgeBase(employeeId: string, kbId: string) {
  await db.delete(employeeKnowledgeBases).where(
    and(
      eq(employeeKnowledgeBases.employeeId, employeeId),
      eq(employeeKnowledgeBases.knowledgeBaseId, kbId),
    )
  );
  return { employeeId, knowledgeBaseId: kbId };
}

export async function getRelevantKnowledge(employeeId: string, query: string, limit = 10) {
  // Get all KB IDs assigned to this employee
  const assignments = await db
    .select({ kbId: employeeKnowledgeBases.knowledgeBaseId })
    .from(employeeKnowledgeBases)
    .where(eq(employeeKnowledgeBases.employeeId, employeeId));

  if (assignments.length === 0) return [];

  const kbIds = assignments.map(a => a.kbId);
  const pattern = `%${escapeLike(query)}%`;

  const results = await db
    .select({
      chunkId: knowledgeChunks.id,
      chunkContent: knowledgeChunks.content,
      documentId: knowledgeDocuments.id,
      documentTitle: knowledgeDocuments.title,
      knowledgeBaseId: knowledgeDocuments.knowledgeBaseId,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
    .where(and(
      inArray(knowledgeDocuments.knowledgeBaseId, kbIds),
      like(knowledgeChunks.content, pattern),
    ))
    .limit(limit);

  return results;
}
