/**
 * Scrolling.
 *
 * Wheel events in chunks with variable delays, occasional reverse-correct
 * micro-scrolls, and a settle pause at the target. Approximates the
 * trackpad-or-wheel pattern detection engines look for.
 */

import type { Page } from 'playwright';
import type { BehaviorConfig } from './config.js';
import { sleep, rand, randRange } from './timing.js';

export async function scrollBy(page: Page, totalDeltaY: number, cfg: BehaviorConfig): Promise<void> {
  const dir = totalDeltaY === 0 ? 0 : totalDeltaY > 0 ? 1 : -1;
  let remaining = Math.abs(totalDeltaY);
  while (remaining > 0) {
    const chunk = Math.min(remaining, Math.round(rand(cfg.scrollChunkMin, cfg.scrollChunkMax)));
    await page.mouse.wheel(0, dir * chunk);
    remaining -= chunk;
    if (remaining > 0) await sleep(randRange(cfg.scrollIntervalMs));

    // Occasional micro-correction in the opposite direction
    if (remaining > 0 && Math.random() < 0.08) {
      await page.mouse.wheel(0, -dir * Math.round(rand(20, 50)));
      await sleep(rand(60, 140));
    }
  }
  await sleep(randRange(cfg.scrollSettleMs));
}

export async function scrollTo(page: Page, targetY: number, cfg: BehaviorConfig): Promise<void> {
  const currentY = await page.evaluate(() => window.scrollY).catch(() => 0);
  await scrollBy(page, targetY - currentY, cfg);
}

export async function scrollToBottom(page: Page, cfg: BehaviorConfig): Promise<void> {
  const target = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight).catch(() => 0);
  await scrollTo(page, target, cfg);
}
