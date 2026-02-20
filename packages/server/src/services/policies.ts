import {
  db, policyPackages, policyPackageVersions, teamPolicies,
  teams, generateId, now,
} from '@agentcorp/db';
import { eq, desc, and, sql } from 'drizzle-orm';
import { AppError } from '../errors.js';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

// ---- List all packages with active version ----

export async function listPolicyPackages() {
  const activeVersionSq = db
    .select({
      packageId: policyPackageVersions.packageId,
      version: policyPackageVersions.version,
      versionId: policyPackageVersions.id,
    })
    .from(policyPackageVersions)
    .where(eq(policyPackageVersions.isActive, 1))
    .as('av');

  const versionCountSq = db
    .select({
      packageId: policyPackageVersions.packageId,
      count: sql<number>`count(*)`.as('version_count'),
    })
    .from(policyPackageVersions)
    .groupBy(policyPackageVersions.packageId)
    .as('vc');

  const rows = await db
    .select({
      id: policyPackages.id,
      name: policyPackages.name,
      description: policyPackages.description,
      scenario: policyPackages.scenario,
      isBuiltin: policyPackages.isBuiltin,
      activeVersion: activeVersionSq.version,
      activeVersionId: activeVersionSq.versionId,
      versionCount: sql<number>`coalesce(${versionCountSq.count}, 0)`,
      createdAt: policyPackages.createdAt,
      updatedAt: policyPackages.updatedAt,
    })
    .from(policyPackages)
    .leftJoin(activeVersionSq, eq(policyPackages.id, activeVersionSq.packageId))
    .leftJoin(versionCountSq, eq(policyPackages.id, versionCountSq.packageId))
    .orderBy(desc(policyPackages.createdAt));

  return rows.map(r => ({
    ...r,
    versionCount: Number(r.versionCount),
  }));
}

// ---- Get package with all versions ----

export async function getPolicyPackage(id: string) {
  const [pkg] = await db.select().from(policyPackages).where(eq(policyPackages.id, id));
  if (!pkg) throw new AppError('NOT_FOUND', `策略包 ${id} 不存在`);

  const versions = await db
    .select()
    .from(policyPackageVersions)
    .where(eq(policyPackageVersions.packageId, id))
    .orderBy(desc(policyPackageVersions.version));

  return {
    ...pkg,
    versions: versions.map(v => ({
      ...v,
      rules: safeJsonParse(v.rules, []),
    })),
  };
}

// ---- Create package + initial version ----

interface CreatePolicyInput {
  name: string;
  description?: string;
  scenario?: string;
  rules: unknown[];
}

export async function createPolicyPackage(input: CreatePolicyInput) {
  const id = generateId();
  const versionId = generateId();
  const timestamp = now();

  db.transaction((tx) => {
    tx.insert(policyPackages).values({
      id,
      name: input.name,
      description: input.description ?? null,
      scenario: input.scenario ?? null,
      isBuiltin: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    tx.insert(policyPackageVersions).values({
      id: versionId,
      packageId: id,
      version: 1,
      rules: JSON.stringify(input.rules),
      changelog: '初始版本',
      isActive: 1,
      createdAt: timestamp,
    }).run();
  });

  return getPolicyPackage(id);
}

// ---- Update package metadata ----

interface UpdatePolicyInput {
  name?: string;
  description?: string;
  scenario?: string;
}

export async function updatePolicyPackage(id: string, input: UpdatePolicyInput) {
  const [existing] = await db.select().from(policyPackages).where(eq(policyPackages.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `策略包 ${id} 不存在`);

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.scenario !== undefined) updates.scenario = input.scenario;

  await db.update(policyPackages).set(updates).where(eq(policyPackages.id, id));
  return getPolicyPackage(id);
}

// ---- Delete package (prevent builtins) ----

export async function deletePolicyPackage(id: string) {
  const [existing] = await db.select().from(policyPackages).where(eq(policyPackages.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `策略包 ${id} 不存在`);
  if (existing.isBuiltin) throw new AppError('CONFLICT', '内置策略包不可删除');

  // Atomic cascade: delete team assignments and versions before package
  db.transaction((tx) => {
    tx.delete(teamPolicies).where(eq(teamPolicies.packageId, id)).run();
    tx.delete(policyPackageVersions).where(eq(policyPackageVersions.packageId, id)).run();
    tx.delete(policyPackages).where(eq(policyPackages.id, id)).run();
  });
  return { id };
}

// ---- Create new version ----

export async function createPolicyVersion(packageId: string, rules: unknown[], changelog?: string) {
  const [pkg] = await db.select().from(policyPackages).where(eq(policyPackages.id, packageId));
  if (!pkg) throw new AppError('NOT_FOUND', `策略包 ${packageId} 不存在`);

  const versionId = generateId();
  const timestamp = now();

  db.transaction((tx) => {
    // Get max version inside transaction to prevent race conditions
    const [maxRow] = tx.select({ maxVer: sql<number>`coalesce(max(${policyPackageVersions.version}), 0)` })
      .from(policyPackageVersions)
      .where(eq(policyPackageVersions.packageId, packageId))
      .all();
    const nextVersion = Number(maxRow.maxVer) + 1;

    // Deactivate all existing versions
    tx.update(policyPackageVersions)
      .set({ isActive: 0 })
      .where(eq(policyPackageVersions.packageId, packageId))
      .run();

    // Insert new active version
    tx.insert(policyPackageVersions).values({
      id: versionId,
      packageId,
      version: nextVersion,
      rules: JSON.stringify(rules),
      changelog: changelog ?? null,
      isActive: 1,
      createdAt: timestamp,
    }).run();
  });

  return getPolicyPackage(packageId);
}

// ---- Activate version ----

export async function activateVersion(packageId: string, versionId: string) {
  const [ver] = await db.select().from(policyPackageVersions)
    .where(and(eq(policyPackageVersions.id, versionId), eq(policyPackageVersions.packageId, packageId)));
  if (!ver) throw new AppError('NOT_FOUND', `版本 ${versionId} 不存在`);

  db.transaction((tx) => {
    tx.update(policyPackageVersions)
      .set({ isActive: 0 })
      .where(eq(policyPackageVersions.packageId, packageId))
      .run();

    tx.update(policyPackageVersions)
      .set({ isActive: 1 })
      .where(eq(policyPackageVersions.id, versionId))
      .run();
  });

  return getPolicyPackage(packageId);
}

// ---- Rollback version (alias for activate) ----

export async function rollbackVersion(packageId: string, versionId: string) {
  return activateVersion(packageId, versionId);
}

// ---- Get team policies ----

export async function getTeamPolicies(teamId: string) {
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
  if (!team) throw new AppError('NOT_FOUND', `团队 ${teamId} 不存在`);

  const rows = await db
    .select({
      packageId: teamPolicies.packageId,
      versionId: teamPolicies.versionId,
      createdAt: teamPolicies.createdAt,
      packageName: policyPackages.name,
      packageDescription: policyPackages.description,
      scenario: policyPackages.scenario,
      isBuiltin: policyPackages.isBuiltin,
      version: policyPackageVersions.version,
      rules: policyPackageVersions.rules,
    })
    .from(teamPolicies)
    .innerJoin(policyPackages, eq(teamPolicies.packageId, policyPackages.id))
    .leftJoin(policyPackageVersions, eq(teamPolicies.versionId, policyPackageVersions.id))
    .where(eq(teamPolicies.teamId, teamId));

  return rows.map(r => ({
    ...r,
    rules: safeJsonParse(r.rules ?? null, []),
  }));
}

// ---- Assign policy to team ----

export async function assignPolicyToTeam(teamId: string, packageId: string) {
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
  if (!team) throw new AppError('NOT_FOUND', `团队 ${teamId} 不存在`);

  const [pkg] = await db.select().from(policyPackages).where(eq(policyPackages.id, packageId));
  if (!pkg) throw new AppError('NOT_FOUND', `策略包 ${packageId} 不存在`);

  // Find active version
  const [activeVer] = await db.select().from(policyPackageVersions)
    .where(and(eq(policyPackageVersions.packageId, packageId), eq(policyPackageVersions.isActive, 1)));

  const versionId = activeVer?.id ?? null;

  // Upsert
  const [existing] = await db.select().from(teamPolicies)
    .where(and(eq(teamPolicies.teamId, teamId), eq(teamPolicies.packageId, packageId)));

  if (existing) {
    await db.update(teamPolicies)
      .set({ versionId, createdAt: now() })
      .where(and(eq(teamPolicies.teamId, teamId), eq(teamPolicies.packageId, packageId)));
  } else {
    await db.insert(teamPolicies).values({
      teamId,
      packageId,
      versionId,
      createdAt: now(),
    });
  }

  return getTeamPolicies(teamId);
}

// ---- Remove policy from team ----

export async function removePolicyFromTeam(teamId: string, packageId: string) {
  await db.delete(teamPolicies)
    .where(and(eq(teamPolicies.teamId, teamId), eq(teamPolicies.packageId, packageId)));
  return { teamId, packageId };
}

// ---- Evaluate policies for a team ----

export async function evaluatePolicies(teamId: string, _context?: unknown) {
  const policies = await getTeamPolicies(teamId);
  const combined: { guardrails: unknown[]; quality: unknown[]; cost: unknown[]; other: unknown[] } = {
    guardrails: [],
    quality: [],
    cost: [],
    other: [],
  };

  for (const p of policies) {
    for (const rule of p.rules) {
      const r = rule as { type?: string };
      if (r.type === 'guardrail') combined.guardrails.push(rule);
      else if (r.type === 'quality') combined.quality.push(rule);
      else if (r.type === 'cost') combined.cost.push(rule);
      else combined.other.push(rule);
    }
  }

  return combined;
}

// ---- Seed built-in policies ----

export async function seedBuiltinPolicies() {
  const existing = await db.select({ id: policyPackages.id })
    .from(policyPackages)
    .where(eq(policyPackages.isBuiltin, 1));

  if (existing.length > 0) return;

  const builtins = [
    {
      name: '基础安全策略',
      description: '基本安全防护规则，防止危险操作',
      scenario: '通用',
      rules: [
        { type: 'guardrail', rule: '禁止执行删除操作', severity: 'critical' },
        { type: 'guardrail', rule: '敏感操作需要审批', severity: 'high' },
      ],
    },
    {
      name: '质量保证策略',
      description: '确保输出质量的规则集',
      scenario: '通用',
      rules: [
        { type: 'quality', rule: '输出必须包含结构化格式', severity: 'medium' },
        { type: 'quality', rule: '代码输出必须包含注释', severity: 'low' },
      ],
    },
    {
      name: '成本控制策略',
      description: '控制资源消耗的规则',
      scenario: '通用',
      rules: [
        { type: 'cost', rule: '单任务Token上限100万', severity: 'high', limit: 1000000 },
      ],
    },
  ];

  const timestamp = now();

  db.transaction((tx) => {
    for (const b of builtins) {
      const pkgId = generateId();
      const verId = generateId();

      tx.insert(policyPackages).values({
        id: pkgId,
        name: b.name,
        description: b.description,
        scenario: b.scenario,
        isBuiltin: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).run();

      tx.insert(policyPackageVersions).values({
        id: verId,
        packageId: pkgId,
        version: 1,
        rules: JSON.stringify(b.rules),
        changelog: '内置初始版本',
        isActive: 1,
        createdAt: timestamp,
      }).run();
    }
  });

  console.log('Seeded 3 built-in policy packages');
}
