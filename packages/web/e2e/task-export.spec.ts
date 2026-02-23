import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const COMPLETED_TASK_ID = 'd729773602cc0315';
const COMPLETED_TASK_ID_2 = '296862500b45d567';

test.describe('Task Export Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('locale', 'zh'));
  });

  test('completed task page shows 3 export buttons', async ({ page }) => {
    await page.goto(`/tasks/${COMPLETED_TASK_ID}`);
    await page.waitForSelector('text=任务完成');

    const pdfBtn = page.locator('button', { hasText: '导出 PDF' });
    const wordBtn = page.locator('button', { hasText: '导出 Word' });
    const excelBtn = page.locator('button', { hasText: '导出 Excel' });

    await expect(pdfBtn).toBeVisible();
    await expect(wordBtn).toBeVisible();
    await expect(excelBtn).toBeVisible();
  });

  test('export buttons trigger file download - PDF', async ({ page }) => {
    await page.goto(`/tasks/${COMPLETED_TASK_ID}`);
    await page.waitForSelector('text=任务完成');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button', { hasText: '导出 PDF' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('.pdf');
    const filePath = await download.path();
    expect(fs.statSync(filePath!).size).toBeGreaterThan(1000);
  });

  test('export buttons trigger file download - DOCX', async ({ page }) => {
    await page.goto(`/tasks/${COMPLETED_TASK_ID_2}`);
    await page.waitForSelector('text=任务完成');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button', { hasText: '导出 Word' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('.docx');
    const filePath = await download.path();
    expect(fs.statSync(filePath!).size).toBeGreaterThan(1000);
  });

  test('export buttons trigger file download - XLSX', async ({ page }) => {
    await page.goto(`/tasks/${COMPLETED_TASK_ID_2}`);
    await page.waitForSelector('text=任务完成');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button', { hasText: '导出 Excel' }).click(),
    ]);

    expect(download.suggestedFilename()).toContain('.xlsx');
    const filePath = await download.path();
    expect(fs.statSync(filePath!).size).toBeGreaterThan(1000);
  });

  test('english locale shows english button text', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('locale', 'en'));
    await page.goto(`/tasks/${COMPLETED_TASK_ID}`);
    await page.waitForSelector('text=Task Completed');

    await expect(page.locator('button', { hasText: 'Export PDF' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Export Word' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Export Excel' })).toBeVisible();
  });
});
