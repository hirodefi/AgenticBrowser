/**
 * Recover command.
 * Tries alternative access methods when the page is blocked/broken.
 */

import { type Page } from 'playwright';
import { getPage } from '../core/browser.js';
import { classifyAccessState } from '../state-machine/classifier.js';
import { AccessState, type AccessResult } from '../state-machine/types.js';
import { autoSolveChallenges } from '../solver/solver.js';
import { readPage } from '../reading/engine.js';

export interface RecoverResult {
  recovered: boolean;
  method: string;
  accessState: AccessState;
  content?: string;
  attempts: string[];
}

export async function recoverAccess(goal?: string): Promise<RecoverResult> {
  const page = await getPage();
  const attempts: string[] = [];
  let current = await classifyAccessState(page);

  // Strategy 1: Reload
  attempts.push('reload');
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);
  current = await classifyAccessState(page);
  if (isAccessible(current)) {
    return { recovered: true, method: 'reload', accessState: current.state, attempts };
  }

  // Strategy 2: Re-solve challenges
  attempts.push('re_solve_challenges');
  const solveResult = await autoSolveChallenges(page, 2);
  current = await classifyAccessState(page);
  if (isAccessible(current)) {
    return { recovered: true, method: 'challenge_solved', accessState: current.state, attempts };
  }

  // Strategy 3: Try reader mode URL
  attempts.push('reader_mode');
  const readerContent = await tryReaderMode(page);
  if (readerContent) {
    return {
      recovered: true,
      method: 'reader_mode',
      accessState: AccessState.READABLE,
      content: readerContent,
      attempts,
    };
  }

  // Strategy 4: Try print version
  attempts.push('print_version');
  const printContent = await tryPrintVersion(page);
  if (printContent) {
    return {
      recovered: true,
      method: 'print_version',
      accessState: AccessState.READABLE,
      content: printContent,
      attempts,
    };
  }

  // Strategy 5: Try mobile viewport
  attempts.push('mobile_viewport');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(2000);
  current = await classifyAccessState(page);
  if (isAccessible(current)) {
    // Reset viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    return { recovered: true, method: 'mobile_viewport', accessState: current.state, attempts };
  }
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Strategy 6: Wait and retry (for rate limits)
  attempts.push('wait_retry');
  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);
  current = await classifyAccessState(page);
  if (isAccessible(current)) {
    return { recovered: true, method: 'wait_retry', accessState: current.state, attempts };
  }

  // Strategy 7: Scroll to trigger lazy loading
  attempts.push('scroll_load');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(2000);
  current = await classifyAccessState(page);
  if (isAccessible(current)) {
    return { recovered: true, method: 'scroll_load', accessState: current.state, attempts };
  }

  return {
    recovered: false,
    method: 'all_strategies_exhausted',
    accessState: current.state,
    attempts,
  };
}

function isAccessible(result: AccessResult): boolean {
  return result.state === AccessState.READABLE || result.state === AccessState.INTERACTIVE;
}

async function tryReaderMode(page: Page): Promise<string | null> {
  // Try to extract content using readability even if page appears blocked
  try {
    const result = await readPage(page, { scope: 'article', format: 'markdown' });
    if (result.confidence > 0.3 && result.content.length > 100) {
      return result.content;
    }
  } catch {}
  return null;
}

async function tryPrintVersion(page: Page): Promise<string | null> {
  try {
    const url = page.url();
    // Try adding print query param
    const printUrl = url + (url.includes('?') ? '&' : '?') + 'print=1';
    await page.goto(printUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const result = await readPage(page, { scope: 'full_page', format: 'markdown' });
    if (result.confidence > 0.3 && result.content.length > 100) {
      return result.content;
    }
  } catch {}
  return null;
}
