import { chromium } from 'playwright';

const BASE = 'http://localhost:5177';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

let pass = 0, fail = 0;
function ok(t) { pass++; console.log(`  ✅ ${t}`); }
function no(t) { fail++; console.log(`  ❌ ${t}`); }

const themeBtn = 'aside [data-testid="theme-toggle"]';
const nav = (h) => `aside a[href="${h}"]`;

// 1. Home page loads
console.log('\n=== 1. Home Page ===');
await page.goto(BASE);
await page.waitForLoadState('networkidle');
(await page.locator('aside').isVisible()) ? ok('Sidebar visible') : no('Sidebar');
(await page.locator(themeBtn).isVisible()) ? ok('Theme toggle visible') : no('Theme toggle');

// 2. Theme toggle
console.log('\n=== 2. Theme Toggle ===');
const hasDarkBefore = await page.evaluate(() => document.documentElement.classList.contains('dark'));
console.log(`  ℹ️  Dark before: ${hasDarkBefore}`);
// Cycle: system→light→dark. Need 2 clicks from default 'system' to reach 'dark'
await page.click(themeBtn);
await page.waitForTimeout(300);
await page.click(themeBtn);
await page.waitForTimeout(500);
const hasDarkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark'));
console.log(`  ℹ️  Dark after: ${hasDarkAfter}`);
(hasDarkBefore !== hasDarkAfter) ? ok('Theme toggled') : no('Theme did NOT toggle');

// Sidebar color check
const sidebarColor = await page.locator('aside').evaluate(el => getComputedStyle(el).color);
console.log(`  ℹ️  Sidebar text color: ${sidebarColor}`);
sidebarColor ? ok('Sidebar has text color') : no('Sidebar missing text color');

// 3. All pages load
console.log('\n=== 3. Page Navigation ===');
const pages = [['/employees','Employees'],['/teams','Teams'],['/tasks','Tasks'],['/models','Models'],['/tools','Tools'],['/settings','Settings']];
for (const [href, name] of pages) {
  await page.click(nav(href));
  await page.waitForLoadState('networkidle');
  (await page.locator('main, [class*="flex-1"]').first().isVisible()) ? ok(name) : no(name);
}

// 4. Sidebar collapse/expand
console.log('\n=== 4. Sidebar Collapse/Expand ===');
const w1 = await page.locator('aside').evaluate(el => el.offsetWidth);
await page.locator('aside button[title="Collapse"]').click();
await page.waitForTimeout(500);
const w2 = await page.locator('aside').evaluate(el => el.offsetWidth);
(w2 < w1) ? ok(`Collapsed ${w1}→${w2}px`) : no('Collapse failed');
await page.locator('aside button[title="Expand"]').click();
await page.waitForTimeout(500);
const w3 = await page.locator('aside').evaluate(el => el.offsetWidth);
(w3 > w2) ? ok(`Expanded ${w2}→${w3}px`) : no('Expand failed');

// 5. Hardcoded color audit (check rendered DOM, not stylesheet)
console.log('\n=== 5. Hardcoded Color Audit ===');
const bad = ['bg-blue-50','bg-violet-50','bg-emerald-50','border-amber-200','bg-amber-50','bg-gray-300','bg-gray-400'];
for (const href of ['/','/employees','/teams','/tasks']) {
  await page.goto(BASE + href);
  await page.waitForLoadState('networkidle');
  const found = await page.evaluate((colors) => {
    const all = document.querySelectorAll('*');
    const hits = [];
    for (const el of all) {
      for (const c of colors) { if (el.className?.includes?.(c)) hits.push(c); }
    }
    return [...new Set(hits)];
  }, bad);
  found.length === 0 ? ok(`${href}: clean`) : no(`${href}: ${found.join(', ')}`);
}

// 6. Responsive grid check
console.log('\n=== 6. Responsive Grid ===');
await page.goto(BASE);
await page.waitForLoadState('networkidle');
const hasResponsiveGrid = await page.evaluate(() => {
  const el = document.querySelector('.grid.sm\\:grid-cols-3');
  return !!el;
});
hasResponsiveGrid ? ok('Quick actions responsive grid') : no('Missing responsive grid');

// Summary
console.log(`\n========== SUMMARY ==========`);
console.log(`✅ Passed: ${pass}`);
console.log(`❌ Failed: ${fail}`);
await browser.close();
