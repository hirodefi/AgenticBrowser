import { launchBrowser, getPage, closeBrowser, updateConfig } from '../src/index.js';

updateConfig({ headless: true, persistentProfile: false });
await launchBrowser();
const page = await getPage();

page.on('console', (msg) => console.log('[page]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[page-error]', err.message));
page.on('worker', (w) => {
  console.log('[worker created]', w.url().slice(0, 80));
  w.on('console' as any, (msg: any) => console.log('[worker console]', msg.type(), msg.text()));
});

const result = await page.evaluate(() => new Promise<any>((resolve) => {
  const log: string[] = [];
  log.push('Worker is patched: ' + (Worker.toString().includes('Worker') ? 'yes-ish' : 'no'));
  log.push('Worker.toString: ' + Worker.toString().slice(0, 80));
  try {
    const blob = new Blob([
      'try { self.postMessage({webdriver: self.navigator.webdriver, ua: self.navigator.userAgent.slice(0,40)}); } catch(e) { self.postMessage({error: e.message}); }'
    ], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    log.push('blob url: ' + url.slice(0, 60));
    const w = new Worker(url);
    const t = setTimeout(() => resolve({ log, err: 'timeout' }), 3000);
    w.onmessage = (e) => { clearTimeout(t); resolve({ log, msg: e.data }); };
    w.onerror = (e: any) => { clearTimeout(t); resolve({ log, err: e.message || String(e) }); };
  } catch (e: any) { resolve({ log, err: e.message }); }
}));
console.log(JSON.stringify(result, null, 2));
await closeBrowser();
