import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = process.cwd();
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(root, 'design', 'component-map', 'inventory-component-map.html')).href, { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(root, 'design', 'component-map', 'inventory-component-map.png'), fullPage: true });
await browser.close();
