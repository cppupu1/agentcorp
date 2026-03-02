import { test, expect } from '@playwright/test';

async function setLocale(page, locale: string) {
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('locale', l), locale);
}

test.describe('Review Dashboard Page', () => {
  test('renders dashboard title (zh)', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/reviews');
    await expect(page.locator('h2')).toHaveText('复盘总览');
  });

  test('renders dashboard title (en)', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/reviews');
    await expect(page.locator('h2')).toHaveText('Review Dashboard');
  });

  test('overview tab shows stat cards', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/reviews');
    const cards = page.locator('.rounded-2xl.bg-card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });

  test('findings tab renders with filters', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/reviews');
    // Click findings tab button (custom Tabs, no role="tab")
    await page.locator('button', { hasText: '问题列表' }).click();
    await expect(page.locator('select').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Task Detail - Review Tab', () => {
  const completedTaskId = '0772e244683e6e1c';
  const failedTaskId = '8bc90298a7c2e332';

  test('completed task shows review tab (zh)', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${completedTaskId}`);
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 8000 });
    // Custom Tabs: plain <button> with text "复盘"
    const reviewTab = page.locator('button', { hasText: '复盘' });
    await expect(reviewTab).toBeVisible({ timeout: 5000 });
  });

  test('failed task shows review tab', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${failedTaskId}`);
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 8000 });
    const reviewTab = page.locator('button', { hasText: '复盘' });
    await expect(reviewTab).toBeVisible({ timeout: 5000 });
  });

  test('clicking review tab shows panel content', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto(`/tasks/${completedTaskId}`);
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 8000 });
    // Click the review tab
    await page.locator('button', { hasText: '复盘' }).click();
    await page.waitForTimeout(2000);
    // Should show "开始复盘" button or review content or analyzing state
    const startBtn = page.getByText('开始复盘');
    const reviewTitle = page.getByText('执行复盘');
    const analyzing = page.getByText('正在分析');
    const anyVisible = await Promise.all([
      startBtn.isVisible().catch(() => false),
      reviewTitle.isVisible().catch(() => false),
      analyzing.isVisible().catch(() => false),
    ]);
    expect(anyVisible.some(Boolean)).toBeTruthy();
  });

  test('review tab in English', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto(`/tasks/${completedTaskId}`);
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 8000 });
    const reviewTab = page.locator('button', { hasText: 'Review' });
    await expect(reviewTab).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Review Navigation', () => {
  test('sidebar has review link', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    const reviewLink = page.locator('a[href="/reviews"]');
    await expect(reviewLink).toBeVisible({ timeout: 5000 });
  });

  test('sidebar link navigates to dashboard', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/');
    await page.locator('a[href="/reviews"]').click();
    await expect(page).toHaveURL(/\/reviews/);
    await expect(page.locator('h2')).toHaveText('复盘总览');
  });
});

test.describe('Review Data Rendering', () => {
  test('dashboard overview shows real stat numbers', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/reviews');
    // Stat cards should show non-zero values
    const cards = page.locator('.rounded-2xl.bg-card');
    await expect(cards).toHaveCount(4, { timeout: 5000 });
    // At least one card should have a number > 0
    const texts = await cards.allTextContents();
    const hasData = texts.some(t => /[1-9]/.test(t));
    expect(hasData).toBeTruthy();
  });

  test('dashboard category breakdown shows items', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/reviews');
    // Category breakdown has an h3 heading
    const heading = page.locator('h3');
    await expect(heading).toBeVisible({ timeout: 5000 });
    // Grid items under the category section
    const gridItems = page.locator('.grid.grid-cols-2 > div');
    const count = await gridItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('findings tab shows actual findings', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/reviews');
    await page.locator('button', { hasText: '问题列表' }).click();
    await page.waitForTimeout(1000);
    // Should show finding cards
    const findingCards = page.locator('.rounded-2xl.bg-muted\\/40');
    const count = await findingCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('findings show severity badges', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/reviews');
    await page.locator('button', { hasText: '问题列表' }).click();
    await page.waitForTimeout(1000);
    // Should have Badge elements
    const badges = page.locator('.rounded-2xl.bg-muted\\/40 [class*="badge"], .rounded-2xl.bg-muted\\/40 span.text-xs');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);
  });

  test('task review panel shows completed review', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/tasks/0772e244683e6e1c');
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 8000 });
    await page.locator('button', { hasText: '复盘' }).click();
    await page.waitForTimeout(2000);
    // Should show review title "执行复盘" and re-trigger button
    await expect(page.getByText('执行复盘')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('重新复盘')).toBeVisible();
  });

  test('review panel shows findings list', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/tasks/0772e244683e6e1c');
    await expect(page.locator('h2').first()).toBeVisible({ timeout: 8000 });
    await page.locator('button', { hasText: '复盘' }).click();
    await page.waitForTimeout(2000);
    // Should have finding items with severity icons
    const findings = page.locator('.rounded-2xl.bg-muted\\/40');
    const count = await findings.count();
    expect(count).toBeGreaterThan(0);
  });
});
