import { test, expect } from '@playwright/test';

// Helper: set locale by navigating first, then setting localStorage
async function setLocale(page, locale) {
  await page.goto('/');
  await page.evaluate((l) => localStorage.setItem('locale', l), locale);
}

test.describe('i18n - Chinese locale', () => {
  test.beforeEach(async ({ page }) => {
    await setLocale(page, 'zh');
  });

  test('Models page shows Chinese text', async ({ page }) => {
    await page.goto('/models');
    await expect(page.locator('h2')).toHaveText('模型管理');
    await expect(page.locator('[data-testid="create-model-btn"]')).toContainText('添加模型');
  });

  test('Tools page shows Chinese text', async ({ page }) => {
    await page.goto('/tools');
    await expect(page.locator('h2')).toHaveText('工具管理');
    await expect(page.locator('[data-testid="create-tool-btn"]')).toContainText('添加工具');
  });

  test('Triggers page shows Chinese text', async ({ page }) => {
    await page.goto('/triggers');
    await expect(page.locator('h2')).toHaveText('触发器管理');
  });

  test('Teams page shows Chinese text', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('h2')).toHaveText('团队管理');
  });

  test('Tasks page shows Chinese text', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('h2')).toHaveText('任务管理');
  });
});

test.describe('i18n - English locale', () => {
  test.beforeEach(async ({ page }) => {
    await setLocale(page, 'en');
  });

  test('Models page shows English text', async ({ page }) => {
    await page.goto('/models');
    await expect(page.locator('h2')).toHaveText('Model Management');
    await expect(page.locator('[data-testid="create-model-btn"]')).toContainText('Add Model');
  });

  test('Tools page shows English text', async ({ page }) => {
    await page.goto('/tools');
    await expect(page.locator('h2')).toHaveText('Tool Management');
    await expect(page.locator('[data-testid="create-tool-btn"]')).toContainText('Add Tool');
  });

  test('Triggers page shows English text', async ({ page }) => {
    await page.goto('/triggers');
    await expect(page.locator('h2')).toHaveText('Trigger Management');
  });

  test('Teams page shows English text', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('h2')).toHaveText('Team Management');
  });

  test('Tasks page shows English text', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('h2')).toHaveText('Task Management');
  });
});

test.describe('i18n - locale toggle', () => {
  test('switching locale updates page text', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/models');
    await expect(page.locator('h2')).toHaveText('模型管理');

    // Click language toggle button
    await page.locator('aside button[title]').first().click();
    await expect(page.locator('h2')).toHaveText('Model Management');

    // Click again to switch back
    await page.locator('aside button[title]').first().click();
    await expect(page.locator('h2')).toHaveText('模型管理');
  });
});

test.describe('i18n - form dialogs', () => {
  test('Model form dialog shows Chinese labels', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/models');
    await page.locator('[data-testid="create-model-btn"]').click();
    await expect(page.locator('[data-testid="model-name-input"]')).toBeVisible();
    await expect(page.locator('label[for="model-name"]')).toHaveText('名称');
  });

  test('Model form dialog shows English labels', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/models');
    await page.locator('[data-testid="create-model-btn"]').click();
    await expect(page.locator('[data-testid="model-name-input"]')).toBeVisible();
    await expect(page.locator('label[for="model-name"]')).toHaveText('Name');
  });

  test('Tool form dialog shows Chinese labels', async ({ page }) => {
    await setLocale(page, 'zh');
    await page.goto('/tools');
    await page.locator('[data-testid="create-tool-btn"]').click();
    await expect(page.locator('[data-testid="tool-name-input"]')).toBeVisible();
  });

  test('Tool form dialog shows English labels', async ({ page }) => {
    await setLocale(page, 'en');
    await page.goto('/tools');
    await page.locator('[data-testid="create-tool-btn"]').click();
    await expect(page.locator('[data-testid="tool-name-input"]')).toBeVisible();
  });
});

test.describe('i18n - UI chrome has no Chinese in English mode', () => {
  // Only check UI chrome elements (h2 titles, button text, table headers),
  // NOT user-generated data from the database.
  const pages = [
    { path: '/models', title: 'Model Management', btn: '[data-testid="create-model-btn"]', btnText: 'Add Model' },
    { path: '/tools', title: 'Tool Management', btn: '[data-testid="create-tool-btn"]', btnText: 'Add Tool' },
    { path: '/triggers', title: 'Trigger Management' },
    { path: '/teams', title: 'Team Management' },
    { path: '/tasks', title: 'Task Management' },
  ];

  for (const p of pages) {
    test(`${p.path} UI chrome is English`, async ({ page }) => {
      await setLocale(page, 'en');
      await page.goto(p.path);
      await expect(page.locator('h2')).toHaveText(p.title);
      if (p.btn) {
        await expect(page.locator(p.btn)).toContainText(p.btnText!);
      }
      // Check table headers (th) have no Chinese
      const headers = await page.locator('th').allInnerTexts();
      for (const h of headers) {
        expect(/[\u4e00-\u9fff]/.test(h), `Table header "${h}" contains Chinese`).toBe(false);
      }
    });
  }
});
