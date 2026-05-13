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
  const entries: ConsoleEntry[] = [];

  // Collect visible error/warning elements on the page
  try {
    const errorTexts = await page.evaluate(() => {
      const errors: { text: string; type: string }[] = [];
      document.querySelectorAll('[class*="error"], [class*="warning"], [role="alert"]').forEach((el: Element) => {
        const text = (el as HTMLElement).textContent?.trim();
        if (text && text.length < 500) {
          const cls = el.className || '';
          errors.push({
            text,
            type: cls.includes('error') ? 'error' : 'warn',
          });
        }
      });
      return errors;
    });

    for (const { text, type } of errorTexts) {
      entries.push({ type: type as any, text, timestamp: Date.now() });
    }
  } catch {}

  return entries;
}

async function getNetworkEntries(page: any): Promise<NetworkEntry[]> {
  const entries: NetworkEntry[] = [];

  try {
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

    // Iterative depth traversal to avoid stack overflow on deep DOMs
    const stack: [Element, number][] = [[document.documentElement, 0]];
    while (stack.length > 0) {
      const [el, depth] = stack.pop()!;
      if (depth > maxDepth) maxDepth = depth;
      for (const child of Array.from(el.children)) {
        stack.push([child, depth + 1]);
      }
    }

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
