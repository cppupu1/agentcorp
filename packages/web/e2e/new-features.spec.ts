import { test, expect } from '@playwright/test';

async function setLocale(page, locale) {
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('locale', l), locale);
}

test.describe('Feature 1: Magic Input', () => {
  test('Tasks page shows magic input box', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/tasks');
    const magic = page.locator('input[placeholder*="AI"]');
    await expect(magic).toBeVisible();
  });

  test('Teams page shows magic input box', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/teams');
    const magic = page.locator('input[placeholder*="AI"]');
    await expect(magic).toBeVisible();
  });

  test('Magic input has sparkles icon', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/tasks');
    // The Sparkles icon is an SVG inside the magic input container
    const container = page.locator('.relative.mb-5');
    await expect(container).toBeVisible();
    await expect(container.locator('svg')).toBeVisible();
  });
});

test.describe('Feature 3: Employee Growth Badges', () => {
  test('Employees page loads without errors', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/employees');
    await expect(page.locator('h2')).toHaveText('员工管理');
  });

  test('Employees page in English loads without errors', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/employees');
    await expect(page.locator('h2')).toHaveText('Employee Management');
  });
});

test.describe('Feature 4: Empty State Templates', () => {
  test('Policies page renders without errors', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/policies');
    await expect(page.locator('h2')).toHaveText('策略包管理');
  });

  test('Knowledge page renders without errors', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/knowledge');
    await expect(page.locator('h2')).toHaveText('知识库管理');
  });

  test('Policies page in English renders without errors', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/policies');
    await expect(page.locator('h2')).toHaveText('Policy Management');
  });

  test('Knowledge page in English renders without errors', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/knowledge');
    await expect(page.locator('h2')).toHaveText('Knowledge Base Management');
  });
});
