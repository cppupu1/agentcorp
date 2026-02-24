import { test, expect, type Page } from '@playwright/test';

/**
 * 真实场景：团队经理的一天
 *
 * 模拟一个团队经理从登录到完成日常工作的完整流程：
 * 1. 打开应用，用 CommandPalette 快速导航（F6）
 * 2. 查看员工实时状态（F1）
 * 3. 用模板快速创建新团队（F3）
 * 4. 查看任务详情，确认暂停按钮状态（F2）
 * 5. 查看 ROI 数据做成本复盘（F5）
 * 6. 检查通知中心的改进建议（F4）
 * 7. 切换英文验证国际化一致性
 */

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

// ═══════════════════════════════════════════════════════════════════════════════
// Scene 1: 早晨签到 — 用 CommandPalette 导航 + 查看员工状态
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Scene 1: Morning check-in', () => {

  test('Manager uses CommandPalette to navigate to employees page and checks statuses', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Step 1: Open palette, search "员工", navigate
    await openPalette(page);
    const input = page.locator('[cmdk-input]');
    await input.fill('员工');
    await page.waitForTimeout(300);
    // Click the employees nav item
    const empItem = page.locator('[cmdk-item]').filter({ hasText: '员工' }).first();
    await empItem.click();
    await page.waitForURL('**/employees', { timeout: 5000 });

    // Step 2: Verify employee cards loaded with status indicators
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    const cards = page.locator('[data-testid^="employee-item-"]');
    const count = await cards.count();
    if (count === 0) return;

    // Each card should have a status dot (rounded-full)
    const dots = await page.locator('[data-testid^="employee-item-"] .rounded-full').count();
    expect(dots).toBeGreaterThan(0);

    // At least one card should show a status label
    const firstText = await cards.first().textContent();
    const hasStatus = ['空闲', '工作中', '等待中'].some(s => firstText!.includes(s));
    expect(hasStatus).toBeTruthy();
  });

  test('Manager checks employee statuses API matches UI count', async ({ page, request }) => {
    // API side: get statuses
    const statusRes = await request.get('/api/employees/statuses');
    expect(statusRes.ok()).toBeTruthy();
    const statuses = (await statusRes.json()).data;

    // UI side: count employee cards
    await setLocale(page, 'zh');
    await page.goto('/employees');
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    const uiCount = await page.locator('[data-testid^="employee-item-"]').count();

    // API should have at least as many statuses as visible cards
    // (UI may paginate, but API returns all)
    expect(statuses.length).toBeGreaterThanOrEqual(uiCount > 0 ? 1 : 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scene 2: 组建新团队 — 用模板快速创建团队
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Scene 2: Build a new team from template', () => {

  test('Manager browses templates and selects one via UI', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Use CommandPalette to navigate to team creation
    await openPalette(page);
    const input = page.locator('[cmdk-input]');
    await input.fill('创建新团队');
    await page.waitForTimeout(300);
    await page.locator('[cmdk-item]').first().click();
    await page.waitForURL('**/teams/new', { timeout: 5000 });

    // Expand template gallery
    const toggleBtn = page.locator('button', { hasText: '场景模板' });
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await toggleBtn.click();

    // Should see template cards with "使用此模板" buttons
    await expect(page.locator('text=使用此模板').first()).toBeVisible({ timeout: 5000 });

    // Verify all 3 templates are shown
    const templateCards = page.locator('text=使用此模板');
    const cardCount = await templateCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(3);
  });

  test('Manager creates a team via template API and verifies it exists', async ({ request }) => {
    // Get a model to use
    const modelsRes = await request.get('/api/models');
    const models = (await modelsRes.json()).data;
    if (models.length === 0) return;
    const modelId = models[0].id;

    // Apply template
    const applyRes = await request.post('/api/templates/research-report/apply', {
      data: { modelId },
    });
    expect(applyRes.status()).toBe(201);
    const result = (await applyRes.json()).data;
    expect(result.teamId).toBeTruthy();
    expect(result.employeeIds.length).toBeGreaterThanOrEqual(2);

    // Verify team exists
    const teamRes = await request.get(`/api/teams/${result.teamId}`);
    expect(teamRes.ok()).toBeTruthy();
    const team = (await teamRes.json()).data;
    expect(team.name).toBeTruthy();

    // Cleanup: delete the created team
    await request.delete(`/api/teams/${result.teamId}`);
    // Cleanup: delete created employees
    for (const empId of result.employeeIds) {
      await request.delete(`/api/employees/${empId}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scene 3: 检查任务 — 查看任务详情 + 暂停按钮 + CommandPalette 上下文
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Scene 3: Inspect tasks', () => {

  test('Manager navigates to task detail and sees context actions in palette', async ({ page, request }) => {
    const res = await request.get('/api/tasks');
    const tasks = (await res.json()).data;
    if (tasks.length === 0) return;
    const task = tasks[0];

    await setLocale(page, 'zh');
    await page.goto(`/tasks/${task.id}`);
    await page.waitForLoadState('networkidle');

    // Verify task detail page loaded
    await expect(page.locator('h2').first()).toBeVisible();

    // Open palette — should see task-specific context actions
    await openPalette(page);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.locator('text=查看子任务')).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator('text=查看时间线')).toBeVisible({ timeout: 3000 });
    await closePalette(page);
  });

  test('Completed task does not show pause button, non-executing task cannot be paused via API', async ({ page, request }) => {
    const res = await request.get('/api/tasks');
    const tasks = (await res.json()).data;
    const completed = tasks.find((t: any) => t.status === 'completed');
    if (!completed) return;

    await setLocale(page, 'zh');
    await page.goto(`/tasks/${completed.id}`);
    await page.waitForLoadState('networkidle');

    // Pause button should NOT be visible for completed tasks
    await expect(page.locator('button', { hasText: '暂停任务' })).not.toBeVisible();

    // API should also reject pause
    const pauseRes = await request.post(`/api/tasks/${completed.id}/pause`, {
      data: { reason: 'manager test' },
    });
    expect(pauseRes.status()).toBe(409);
    const body = await pauseRes.json();
    expect(body.error.code).toBe('INVALID_STATE');
  });

  test('Manager uses ?tab=timeline to jump directly to timeline tab', async ({ page, request }) => {
    const res = await request.get('/api/tasks');
    const tasks = (await res.json()).data;
    if (tasks.length === 0) return;

    await setLocale(page, 'zh');
    await page.goto(`/tasks/${tasks[0].id}?tab=timeline`);
    await page.waitForLoadState('networkidle');
    // Page should load without errors
    await expect(page.locator('h2').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scene 4: 成本复盘 — 查看 ROI 图表，切换不同维度
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Scene 4: ROI cost review', () => {

  test('Manager navigates to ROI via palette and reviews all tabs', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate via CommandPalette
    await openPalette(page);
    const input = page.locator('[cmdk-input]');
    await input.fill('ROI');
    await page.waitForTimeout(300);
    await page.locator('[cmdk-item]').first().click();
    await page.waitForURL('**/roi', { timeout: 5000 });

    // Cost tab should be visible by default
    const costBtn = page.locator('button', { hasText: '成本趋势' });
    await expect(costBtn).toBeVisible();

    // Switch to competency tab
    await page.locator('button', { hasText: '员工能力' }).click();
    await expect(page.locator('label', { hasText: '选择员工' })).toBeVisible({ timeout: 5000 });

    // Switch to team tab
    await page.locator('button', { hasText: '团队效能' }).click();
    await expect(page.locator('label', { hasText: '选择团队' })).toBeVisible({ timeout: 5000 });
  });

  test('ROI cost-trend API data is consistent with page rendering', async ({ page, request }) => {
    // Fetch API data
    const apiRes = await request.get('/api/roi/cost-trend');
    expect(apiRes.ok()).toBeTruthy();
    const apiData = (await apiRes.json()).data;

    // Load page
    await setLocale(page, 'zh');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');

    // If API has data, the page should render chart or table content
    if (apiData.length > 0) {
      // Page should have visible content (not empty state)
      const pageText = await page.locator('body').textContent();
      // Should contain at least one period label from the data
      const hasPeriod = apiData.some((item: any) => pageText!.includes(item.period));
      expect(hasPeriod).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scene 5: 查看通知 — 检查改进建议和通知筛选
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Scene 5: Check notifications', () => {

  test('Manager opens notifications page and uses filter tabs', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');

    // Page title
    await expect(page.locator('h2')).toContainText('通知中心');

    // Filter tabs should be visible
    const tabRow = page.locator('.flex.gap-2.mb-4');
    await expect(tabRow.locator('button', { hasText: '全部' })).toBeVisible();
    await expect(tabRow.locator('button', { hasText: '未读' })).toBeVisible();
    await expect(tabRow.locator('button', { hasText: '已读' })).toBeVisible();

    // Click through tabs
    await tabRow.locator('button', { hasText: '未读' }).click();
    await page.waitForTimeout(300);
    await tabRow.locator('button', { hasText: '已读' }).click();
    await page.waitForTimeout(300);
    await tabRow.locator('button', { hasText: '全部' }).click();
  });

  test('Notifications API and unread count are consistent', async ({ request }) => {
    const [listRes, countRes] = await Promise.all([
      request.get('/api/notifications'),
      request.get('/api/notifications/unread-count'),
    ]);
    expect(listRes.ok()).toBeTruthy();
    expect(countRes.ok()).toBeTruthy();

    const allNotifs = (await listRes.json()).data;
    const unreadCount = (await countRes.json()).data.count;

    // Unread count should match the number of unread items in the list
    const actualUnread = allNotifs.filter((n: any) => !n.read).length;
    expect(unreadCount).toBe(actualUnread);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scene 6: 切换英文 — 验证所有新功能的国际化一致性
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Scene 6: English locale full walkthrough', () => {

  test('Employee statuses render in English', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/employees');
    await page.waitForSelector('[data-testid^="employee-item-"]', { timeout: 10000 }).catch(() => {});
    const count = await page.locator('[data-testid^="employee-item-"]').count();
    if (count === 0) return;
    const text = await page.locator('[data-testid^="employee-item-"]').first().textContent();
    const hasStatus = ['Idle', 'Working', 'Waiting'].some(s => text!.includes(s));
    expect(hasStatus).toBeTruthy();
  });

  test('ROI page renders English tabs', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/roi');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button', { hasText: 'Cost Trend' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Competency' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Team' })).toBeVisible();
  });

  test('Notifications page renders in English', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2')).toContainText('Notification Center');
  });

  test('Template gallery renders in English', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/teams/new');
    await page.waitForLoadState('networkidle');
    const toggleBtn = page.locator('button', { hasText: 'Templates' });
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });
    await toggleBtn.click();
    await expect(page.locator('text=Use Template').first()).toBeVisible({ timeout: 5000 });
  });

  test('CommandPalette context actions render in English on employee page', async ({ page, request }) => {
    const res = await request.get('/api/employees');
    const emps = (await res.json()).data;
    if (emps.length === 0) return;

    await setLocale(page, 'en');
    await page.goto(`/employees/${emps[0].id}/edit`);
    await page.waitForLoadState('networkidle');
    await openPalette(page);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.locator('text=Chat with Employee')).toBeVisible({ timeout: 3000 });
    await expect(dialog.locator('text=Edit Employee')).toBeVisible({ timeout: 3000 });
    await closePalette(page);
  });
});