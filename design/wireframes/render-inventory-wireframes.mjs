import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = process.cwd();
const htmlPath = path.join(root, 'design', 'wireframes', 'inventory-mobile-low-fi.html');
const groups = ['warehouse', 'intake', 'manage', 'compatibility'];
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1420, height: 1000 }, deviceScaleFactor: 1 });

for (const group of groups) {
  await page.goto(`${pathToFileURL(htmlPath).href}?group=${group}`, { waitUntil: 'networkidle' });
  const overflow = await page.$$eval('.board', (boards) => boards
    .filter((board) => getComputedStyle(board).display !== 'none')
    .map((board) => {
      const screen = board.querySelector('.screen');
      return {
        title: board.querySelector('.board-title')?.textContent?.trim(),
        overflow: screen ? screen.scrollHeight - screen.clientHeight : 0,
        scrollable: screen ? getComputedStyle(screen).overflowY === 'auto' : false,
      };
    })
    .filter((item) => item.overflow > 1 && !item.scrollable));
  if (overflow.length) {
    throw new Error(`Unintended phone overflow in ${group}: ${JSON.stringify(overflow)}`);
  }
  await page.screenshot({
    path: path.join(root, 'design', 'wireframes', `inventory-${group}-low-fi.png`),
    fullPage: true,
  });
}

await browser.close();
