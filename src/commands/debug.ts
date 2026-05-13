/**
 * Debug command.
 * Returns a diagnostic bundle.
 */

import { getPage, getCDP } from '../core/browser.js';
import { type DebugBundle, type ConsoleEntry, type NetworkEntry, type DomStats } from '../state-machine/types.js';

export interface DebugOptions {
  includeConsole: boolean;
  includeNetwork: boolean;
  includeScreenshot: boolean;
  includeHtml: boolean;
  includeCookies: boolean;
}

const DEFAULT_DEBUG_OPTIONS: DebugOptions = {
  includeConsole: true,
  includeNetwork: true,
  includeScreenshot: true,
  includeHtml: false,
  includeCookies: true,
};

export async function debugPage(options: Partial<DebugOptions> = {}): Promise<DebugBundle> {
  const opts = { ...DEFAULT_DEBUG_OPTIONS, ...options };
  const page = await getPage();

  // Collect console messages
  let consoleEntries: ConsoleEntry[] = [];
  if (opts.includeConsole) {
    consoleEntries = await getConsoleEntries(page);
  }

  // Collect network requests
  let networkEntries: NetworkEntry[] = [];
  if (opts.includeNetwork) {
    networkEntries = await getNetworkEntries(page);
  }

  // Take screenshot
  let screenshot: string | undefined;
  if (opts.includeScreenshot) {
    try {
      const buf = await page.screenshot({ type: 'jpeg', quality: 50, fullPage: false });
      screenshot = buf.toString('base64');
    } catch {}
  }

  // Get HTML
  let html: string | undefined;
  if (opts.includeHtml) {
    try {
      html = await page.content();
    } catch {}
  }

  // Get cookies
  let cookies: { name: string; domain: string; value: string }[] = [];
  if (opts.includeCookies) {
    try {
      const rawCookies = await page.context().cookies();
      cookies = rawCookies.map(c => ({ name: c.name, domain: c.domain, value: c.value }));
    } catch {}
  }

  // DOM stats
  const domStats = await getDomStats(page);

  const title = await page.title();

  return {
    url: page.url(),
    title,
    console: consoleEntries,
    network: networkEntries,
    domStats,
    screenshot,
    html,
    cookies,
  };
}

async function getConsoleEntries(page: any): Promise<ConsoleEntry[]> {
  // We can't retroactively get console messages, but we can get recent errors
  const entries: ConsoleEntry[] = [];

  try {
    // Get page errors from CDP
    const cdp = await page.context().newCDPSession(page);
    // This only captures future messages, but it's useful for ongoing debugging
    cdp.on('Log.entryAdded', (entry: any) => {
      entries.push({
        type: entry.entry.level === 'error' ? 'error' : entry.entry.level === 'warning' ? 'warn' : 'log',
        text: entry.entry.text,
        timestamp: entry.entry.timestamp,
      });
    });
  } catch {}

  // Also check for visible error text on page
  try {
    const errorTexts = await page.evaluate(() => {
      const errors: string[] = [];
      document.querySelectorAll('[class*="error"], [class*="warning"], [role="alert"]').forEach(el => {
        const text = el.textContent?.trim();
        if (text) errors.push(text);
      });
      return errors;
    });

    for (const text of errorTexts) {
      entries.push({ type: 'error', text, timestamp: Date.now() });
    }
  } catch {}

  return entries;
}

async function getNetworkEntries(page: any): Promise<NetworkEntry[]> {
  const entries: NetworkEntry[] = [];

  try {
    const cdp = await page.context().newCDPSession(page);
    // Get network entries from performance API
    const perfEntries = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map((e: any) => ({
        url: e.name,
        duration: Math.round(e.duration),
        size: e.transferSize || 0,
        type: e.initiatorType,
      }));
    });

    for (const e of perfEntries) {
      entries.push({
        url: e.url,
        method: 'GET',
        status: 0,
        mimeType: e.type,
        size: e.size,
        duration: e.duration,
      });
    }
  } catch {}

  return entries.slice(-50);
}

async function getDomStats(page: any): Promise<DomStats> {
  return page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    let maxDepth = 0;

    function getDepth(el: Element, depth: number): void {
      if (depth > maxDepth) maxDepth = depth;
      for (const child of Array.from(el.children)) {
        getDepth(child, depth + 1);
      }
    }
    getDepth(document.documentElement, 0);

    return {
      nodeCount: allElements.length,
      depth: maxDepth,
      iframeCount: document.querySelectorAll('iframe').length,
      scriptCount: document.querySelectorAll('script').length,
      stylesheetCount: document.querySelectorAll('link[rel="stylesheet"], style').length,
      imageSize: document.querySelectorAll('img').length,
    };
  });
}
