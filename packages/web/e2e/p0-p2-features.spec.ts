import { test, expect } from '@playwright/test';

async function setLocale(page, locale: string) {
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('locale', l), locale);
}

// F1: Employee Real-time Status
test.describe('F1: Employee Status', () => {
  test('GET /api/employees/statuses returns valid status array', async ({ request }) => {
    const res = await request.get('/api/employees/statuses');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    for (const item of body.data) {
      expect(item).toHaveProperty('employeeId');
      expect(item).toHaveProperty('status');
      expect(['idle', 'working', 'waiting']).toContain(item.status);
    }
  });

  test('Employees page renders status dots on cards', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/employees');
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    // If employees exist, check for status dot elements
    const cards = await page.locator('[data-testid^="employee-item-"]').count();
    if (cards > 0) {
      // Status dot is a span with rounded-full class inside the card
      const dots = await page.locator('[data-testid^="employee-item-"] .rounded-full').count();
      expect(dots).toBeGreaterThan(0);
    }
  });
});

// F2: Task Pause Button
test.describe('F2: Task Pause', () => {
  test('POST /api/tasks/:id/pause rejects non-executing task', async ({ request }) => {
    // First get a task list
    const listRes = await request.get('/api/tasks');
    const tasks = (await listRes.json()).data;
    if (tasks.length === 0) return; // skip if no tasks
    const nonExecuting = tasks.find((t: any) => t.status !== 'executing');
    if (!nonExecuting) return;
    const res = await request.post(`/api/tasks/${nonExecuting.id}/pause`, {
      data: { reason: 'test' },
    });
    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_STATE');
  });
});

// F3: Template System
test.describe('F3: Templates', () => {
  test('GET /api/templates returns template list', async ({ request }) => {
    const res = await request.get('/api/templates');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    // Check new templates exist
    const names = body.data.map((t: any) => t.id);
    expect(names).toContain('research-report');
    expect(names).toContain('customer-service');
    expect(names).toContain('devops-ops');
  });

  test('Team create page shows template gallery', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/teams/new');
    // Template gallery toggle button should exist
    const toggleBtn = page.locator('button', { hasText: '场景模板' });
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    // Click to expand
    await toggleBtn.click();
    // Should see template cards
    await expect(page.locator('text=使用此模板').first()).toBeVisible({ timeout: 5000 });
  });
});

// F5: ROI Charts
test.describe('F5: ROI Charts', () => {
  test('ROI page loads without errors (zh)', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/roi');
    await expect(page.locator('h2')).toHaveText('ROI 复盘');
  });

  test('ROI page loads without errors (en)', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/roi');
    await expect(page.locator('h2')).toHaveText('ROI Review');
  });

  test('ROI page has cost/competency/team tabs', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/roi');
    await expect(page.locator('button', { hasText: '成本趋势' })).toBeVisible();
    await expect(page.locator('button', { hasText: '员工能力' })).toBeVisible();
    await expect(page.locator('button', { hasText: '团队效能' })).toBeVisible();
  });
});

// F6: CommandPalette Context Awareness
test.describe('F6: CommandPalette', () => {
  test('Ctrl+K opens command palette', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Dispatch KeyboardEvent directly since Playwright headless may not trigger modifiers correctly
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
  });

  test('Command palette shows navigation items', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[cmdk-item]').first()).toBeVisible();
  });

  test('Escape closes command palette', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
  });
});

// Cross-feature: Decision API contract
test.describe('Decision API', () => {
  test('POST /api/tasks/:id/decision rejects when no pending decision', async ({ request }) => {
    const listRes = await request.get('/api/tasks');
    const tasks = (await listRes.json()).data;
    if (tasks.length === 0) return;
    const res = await request.post(`/api/tasks/${tasks[0].id}/decision`, {
      data: { decision: 'test', subtaskId: 'nonexistent' },
    });
    expect(res.ok()).toBeFalsy();
  });
});
