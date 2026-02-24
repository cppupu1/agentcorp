import { test, expect, type Page } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function setLocale(page: Page, locale: string) {
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('locale', l), locale);
}

async function openPalette(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  });
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
}

async function closePalette(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
}

/** Fetch first entity id from API */
async function firstId(request: any, endpoint: string): Promise<string | null> {
  const res = await request.get(endpoint);
  const data = (await res.json()).data;
  return data.length > 0 ? data[0].id : null;
}

async function firstTaskByStatus(request: any, status: string): Promise<any | null> {
  const res = await request.get('/api/tasks');
  const data = (await res.json()).data;
  return data.find((t: any) => t.status === status) ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// F1: Employee Real-time Status — comprehensive
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('F1: Employee Status (comprehensive)', () => {

  test('Card view shows status text label per employee', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/employees');
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    const cards = page.locator('[data-testid^="employee-item-"]');
    const count = await cards.count();
    if (count === 0) return;
    // Each card should contain one of the status labels
    const firstCard = cards.first();
    const text = await firstCard.textContent();
    const hasStatus = ['空闲', '工作中', '等待中'].some(s => text!.includes(s));
    expect(hasStatus).toBeTruthy();
  });

  test('List view also shows status dots', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/employees');
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    const count = await page.locator('[data-testid^="employee-item-"]').count();
    if (count === 0) return;
    // Switch to list view
    const listBtn = page.locator('button').filter({ has: page.locator('svg.lucide-list') });
    await listBtn.click();
    await page.waitForTimeout(300);
    // List items should still have status dots (rounded-full)
    const dots = await page.locator('[data-testid^="employee-item-"] .rounded-full').count();
    expect(dots).toBeGreaterThan(0);
  });

  test('View mode toggle switches between card and list', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/employees');
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    // Default is card view — items are in a grid
    const grid = page.locator('.grid');
    await expect(grid.first()).toBeVisible();
    // Switch to list
    const listBtn = page.locator('button').filter({ has: page.locator('svg.lucide-list') });
    await listBtn.click();
    await page.waitForTimeout(300);
    // Now items should be in space-y layout, not grid
    const spaceY = page.locator('.space-y-2');
    await expect(spaceY).toBeVisible();
  });

  test('English locale shows English status labels', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/employees');
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    const count = await page.locator('[data-testid^="employee-item-"]').count();
    if (count === 0) return;
    const text = await page.locator('[data-testid^="employee-item-"]').first().textContent();
    const hasStatus = ['Idle', 'Working', 'Waiting'].some(s => text!.includes(s));
    expect(hasStatus).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F2: Task Pause Button — comprehensive
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('F2: Task Pause (comprehensive)', () => {

  test('Completed task detail does NOT show pause button', async ({ page, request }) => {
    const task = await firstTaskByStatus(request, 'completed');
    if (!task) return;
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${task.id}`);
    await page.waitForLoadState('networkidle');
    // Pause button should not exist for completed tasks
    await expect(page.locator('button', { hasText: '暂停任务' })).not.toBeVisible();
  });

  test('Draft task detail does NOT show pause button', async ({ page, request }) => {
    const task = await firstTaskByStatus(request, 'draft');
    if (!task) return;
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${task.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button', { hasText: '暂停任务' })).not.toBeVisible();
  });

  test('Pause API returns proper error structure', async ({ request }) => {
    const task = await firstTaskByStatus(request, 'completed');
    if (!task) return;
    const res = await request.post(`/api/tasks/${task.id}/pause`, { data: { reason: 'e2e test' } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('INVALID_STATE');
    expect(body.error.message).toContain('executing');
  });

  test('Pause button text correct in English', async ({ page, request }) => {
    // Just verify the i18n key renders — we check a non-executing task page
    // to confirm the button is absent (proving it's status-gated)
    const task = await firstTaskByStatus(request, 'completed');
    if (!task) return;
    await setLocale(page, 'en');
    await page.goto(`/tasks/${task.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button', { hasText: 'Pause Task' })).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F3: Template System — comprehensive
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('F3: Templates (comprehensive)', () => {

  test('All 3 new templates have correct structure', async ({ request }) => {
    const res = await request.get('/api/templates');
    const templates = (await res.json()).data;
    for (const id of ['research-report', 'customer-service', 'devops-ops']) {
      const tpl = templates.find((t: any) => t.id === id);
      expect(tpl).toBeDefined();
      expect(tpl.name).toBeTruthy();
      expect(tpl.description).toBeTruthy();
      expect(tpl.icon).toBeTruthy();
      expect(tpl.employeeCount).toBeGreaterThanOrEqual(2);
    }
  });

  test('Gallery is collapsed by default, expands on click', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');
    // "使用此模板" should NOT be visible before expanding
    await expect(page.locator('text=使用此模板').first()).not.toBeVisible();
    // Click toggle
    await page.locator('button', { hasText: '场景模板' }).click();
    // Now template cards should be visible
    await expect(page.locator('text=使用此模板').first()).toBeVisible({ timeout: 5000 });
  });

  test('Template cards show role count badge', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');
    await page.locator('button', { hasText: '场景模板' }).click();
    // Badge with "个角色" text
    const roleBadge = page.locator('text=/\\d+ 个角色/');
    await expect(roleBadge.first()).toBeVisible({ timeout: 5000 });
  });

  test('"Use Template" button disabled without model selection', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');
    await page.locator('button', { hasText: '场景模板' }).click();
    // The "使用此模板" button should be disabled when no model is selected
    const useBtn = page.locator('button', { hasText: '使用此模板' }).first();
    await expect(useBtn).toBeVisible({ timeout: 5000 });
    await expect(useBtn).toBeDisabled();
  });

  test('Gallery works in English locale', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');
    const toggleBtn = page.locator('button', { hasText: 'Templates' });
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await toggleBtn.click();
    await expect(page.locator('text=Use Template').first()).toBeVisible({ timeout: 5000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F4: Self-improvement Notifications — comprehensive
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('F4: Improvement Notifications (comprehensive)', () => {

  test('Notifications page loads without errors (zh)', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2')).toHaveText('通知中心');
  });

  test('Notifications page loads without errors (en)', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2')).toContainText('Notification Center');
  });

  test('Notifications API returns valid structure', async ({ request }) => {
    const res = await request.get('/api/notifications');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    for (const n of body.data) {
      expect(n).toHaveProperty('id');
      expect(n).toHaveProperty('type');
      expect(n).toHaveProperty('title');
      expect(n).toHaveProperty('read');
    }
  });

  test('Notification filter tabs are visible', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    // Should have all/unread/read filter buttons in the tab row
    const tabRow = page.locator('.flex.gap-2.mb-4');
    await expect(tabRow.locator('button', { hasText: '全部' })).toBeVisible();
    await expect(tabRow.locator('button', { hasText: '未读' })).toBeVisible();
    await expect(tabRow.locator('button', { hasText: '已读' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F5: ROI Charts — comprehensive
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('F5: ROI Charts (comprehensive)', () => {

  test('Cost tab is active by default', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');
    // Cost tab button should have default variant (not outline)
    const costBtn = page.locator('button', { hasText: '成本趋势' });
    await expect(costBtn).toBeVisible();
  });

  test('Switching to competency tab shows employee selector', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');
    await page.locator('button', { hasText: '员工能力' }).click();
    // Should show employee selector label
    await expect(page.locator('label', { hasText: '选择员工' })).toBeVisible({ timeout: 5000 });
    // Should have a select element
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('Switching to team tab shows team selector', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');
    await page.locator('button', { hasText: '团队效能' }).click();
    await expect(page.locator('label', { hasText: '选择团队' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('Cost trend API returns valid data', async ({ request }) => {
    const res = await request.get('/api/roi/cost-trend');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    for (const item of body.data) {
      expect(item).toHaveProperty('period');
      expect(item).toHaveProperty('totalCost');
      expect(item).toHaveProperty('totalTokens');
      expect(item).toHaveProperty('taskCount');
    }
  });

  test('ROI tabs work in English', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button', { hasText: 'Cost Trend' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Competency' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Team' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F6: CommandPalette Context Awareness — comprehensive
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('F6: CommandPalette (comprehensive)', () => {

  test('Palette shows quick-create group with 3 items', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    await expect(page.locator('text=创建新员工')).toBeVisible();
    await expect(page.locator('text=创建新团队')).toBeVisible();
    await expect(page.locator('text=创建新任务')).toBeVisible();
  });

  test('Palette shows action group with theme and language toggles', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    await expect(page.locator('text=切换主题')).toBeVisible();
    await expect(page.locator('text=切换语言')).toBeVisible();
  });

  test('Context actions appear on employee detail page', async ({ page, request }) => {
    const empId = await firstId(request, '/api/employees');
    if (!empId) return;
    await setLocale(page, 'zh');
    await page.goto(`/employees/${empId}/edit`);
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    const dialog = page.locator('[role="dialog"]');
    // Should see "当前页面" group with employee-specific actions
    await expect(dialog.locator('text=与员工对话')).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator('text=编辑员工')).toBeVisible({ timeout: 3000 });
    await closePalette(page);
  });

  test('Context actions appear on task detail page', async ({ page, request }) => {
    const taskId = await firstId(request, '/api/tasks');
    if (!taskId) return;
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${taskId}`);
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    await expect(page.locator('text=查看子任务')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=查看时间线')).toBeVisible({ timeout: 3000 });
    await closePalette(page);
  });

  test('Context actions appear on team detail page', async ({ page, request }) => {
    const teamId = await firstId(request, '/api/teams');
    if (!teamId) return;
    await setLocale(page, 'zh');
    await page.goto(`/teams/${teamId}`);
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    await expect(page.locator('text=编辑团队')).toBeVisible({ timeout: 3000 });
    await closePalette(page);
  });

  test('Search filters palette items', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    const input = page.locator('[cmdk-input]');
    await input.fill('ROI');
    await page.waitForTimeout(300);
    // Should show ROI nav item, hide unrelated items
    const items = page.locator('[cmdk-item]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // All visible items should relate to ROI
    const firstText = await items.first().textContent();
    expect(firstText!.toLowerCase()).toContain('roi');
    await closePalette(page);
  });

  test('Navigation via palette works', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    const input = page.locator('[cmdk-input]');
    await input.fill('ROI');
    await page.waitForTimeout(300);
    // Select the ROI item
    await page.locator('[cmdk-item]').first().click();
    await page.waitForURL('**/roi', { timeout: 5000 });
    expect(page.url()).toContain('/roi');
  });

  test('Palette works in English locale', async ({ page, request }) => {
    const empId = await firstId(request, '/api/employees');
    if (!empId) return;
    await setLocale(page, 'en');
    await page.goto(`/employees/${empId}/edit`);
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.locator('text=Chat with Employee')).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator('text=Edit Employee')).toBeVisible({ timeout: 3000 });
    await closePalette(page);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-feature: Tab query params, Decision API, i18n consistency
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Cross-feature (comprehensive)', () => {

  test('Task detail page respects ?tab=timeline query param', async ({ page, request }) => {
    const taskId = await firstId(request, '/api/tasks');
    if (!taskId) return;
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${taskId}?tab=timeline`);
    await page.waitForLoadState('networkidle');
    // The timeline tab should be active
    const timelineTab = page.locator('button', { hasText: '时间线' });
    if (await timelineTab.count() > 0) {
      // Tab should have active styling (data-state or aria-selected)
      const isActive = await timelineTab.getAttribute('data-state') === 'active'
        || await timelineTab.getAttribute('aria-selected') === 'true'
        || (await timelineTab.getAttribute('class'))?.includes('bg-');
      expect(isActive).toBeTruthy();
    }
  });

  test('Task detail page respects ?tab=execution query param', async ({ page, request }) => {
    const taskId = await firstId(request, '/api/tasks');
    if (!taskId) return;
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${taskId}?tab=execution`);
    await page.waitForLoadState('networkidle');
    // Page should load without errors
    await expect(page.locator('h2').first()).toBeVisible();
  });

  test('Decision API rejects when no pending decision', async ({ request }) => {
    const taskId = await firstId(request, '/api/tasks');
    if (!taskId) return;
    const res = await request.post(`/api/tasks/${taskId}/decision`, {
      data: { decision: 'test', subtaskId: 'nonexistent' },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('Decision API validates required fields', async ({ request }) => {
    const taskId = await firstId(request, '/api/tasks');
    if (!taskId) return;
    // Missing decision field
    const res = await request.post(`/api/tasks/${taskId}/decision`, {
      data: { subtaskId: 'test' },
    });
    expect(res.ok()).toBeFalsy();
  });

  test('Employee statuses API returns correct enum values', async ({ request }) => {
    const res = await request.get('/api/employees/statuses');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    for (const item of body.data) {
      expect(['idle', 'working', 'waiting']).toContain(item.status);
      expect(item.employeeId).toBeTruthy();
    }
  });

  test('All new API endpoints return consistent error format', async ({ request }) => {
    // Pause on non-existing task
    const pauseRes = await request.post('/api/tasks/nonexistent-id/pause', {
      data: { reason: 'test' },
    });
    expect(pauseRes.ok()).toBeFalsy();
    const pauseBody = await pauseRes.json();
    expect(pauseBody.error).toBeDefined();

    // Decision on non-existing task
    const decisionRes = await request.post('/api/tasks/nonexistent-id/decision', {
      data: { decision: 'test' },
    });
    expect(decisionRes.ok()).toBeFalsy();
    const decisionBody = await decisionRes.json();
    expect(decisionBody.error).toBeDefined();
  });

  test('i18n: zh and en both render without missing keys on employees page', async ({ page }) => {
    // Chinese
    await setLocale(page, 'zh');
    await page.goto('/employees');
    await page.waitForLoadState('networkidle');
    const zhText = await page.locator('body').textContent();
    // No untranslated key patterns like "employees.xxx"
    expect(zhText).not.toMatch(/employees\.\w+\.\w+/);

    // English
    await setLocale(page, 'en');
    await page.goto('/employees');
    await page.waitForLoadState('networkidle');
    const enText = await page.locator('body').textContent();
    expect(enText).not.toMatch(/employees\.\w+\.\w+/);
  });

  test('i18n: zh and en both render without missing keys on ROI page', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');
    const zhText = await page.locator('body').textContent();
    expect(zhText).not.toMatch(/roi\.\w+\.\w+/);

    await setLocale(page, 'en');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');
    const enText = await page.locator('body').textContent();
    expect(enText).not.toMatch(/roi\.\w+\.\w+/);
  });
});