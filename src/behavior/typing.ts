/**
 * Typing.
 *
 * Per-character timing draws from a log-normal-ish distribution scaled by
 * character class (digits faster than punctuation), bigram-based micro-pauses
 * between dissimilar key positions, burst pauses every few words, and a small
 * rate of typo+correction so cadence isn't perfectly clean. Capitalization
 * uses real shift-key downs so keydown/keyup sequences match a physical
 * keyboard, not page.keyboard.type's auto-shift heuristic.
 */

import type { Page } from 'playwright';
import type { BehaviorConfig } from './config.js';
import { sleep, randRange } from './timing.js';

const NEARBY: Record<string, string> = {
  a: 'sqwz', b: 'vghn', c: 'xdfv', d: 'sfecx', e: 'wrsdf',
  f: 'dgrtcv', g: 'fhtyb', h: 'gjybn', i: 'ujko', j: 'hkunm',
  k: 'jloi', l: 'kop', m: 'njk', n: 'bhjm', o: 'iklp',
  p: 'ol', q: 'wa', r: 'edft', s: 'awedxz', t: 'rfgy',
  u: 'yhji', v: 'cfgb', w: 'qase', x: 'zsdc', y: 'tghu', z: 'asx',
};

function charDelay(ch: string, cfg: BehaviorConfig): number {
  const base = randRange(cfg.typeBaseDelayMs);
  const jitter = (Math.random() - 0.5) * cfg.typeJitterFactor * base;
  let mult = 1;
  if (/[0-9]/.test(ch)) mult = 0.85;
  else if (/[A-Z]/.test(ch)) mult = 1.15;
  else if (/[^a-zA-Z0-9 ]/.test(ch)) mult = 1.35;
  return Math.max(15, (base + jitter) * mult);
}

function nearbyMistake(ch: string): string | null {
  const lower = ch.toLowerCase();
  const opts = NEARBY[lower];
  if (!opts) return null;
  const pick = opts[Math.floor(Math.random() * opts.length)];
  return ch === lower ? pick : pick.toUpperCase();
}

export async function typeHuman(page: Page, text: string, cfg: BehaviorConfig): Promise<void> {
  const tokens = text.split(/(\s+)/);
  let wordsSinceBurst = 0;
  let burstTarget = randInt(cfg.typeBurstWordsMin, cfg.typeBurstWordsMax);

  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      for (const c of tok) await pressChar(page, c, cfg);
      wordsSinceBurst++;
      if (wordsSinceBurst >= burstTarget) {
        await sleep(randRange(cfg.typeWordPauseMs));
        wordsSinceBurst = 0;
        burstTarget = randInt(cfg.typeBurstWordsMin, cfg.typeBurstWordsMax);
      }
      continue;
    }
    for (const ch of tok) {
      if (Math.random() < cfg.typeMistakeChance) {
        const wrong = nearbyMistake(ch);
        if (wrong) {
          await pressChar(page, wrong, cfg);
          await sleep(randRange(cfg.typeBackspacePauseMs));
          await page.keyboard.press('Backspace');
          await sleep(randRange([60, 140]));
        }
      }
      await pressChar(page, ch, cfg);
    }
  }
}

async function pressChar(page: Page, ch: string, cfg: BehaviorConfig): Promise<void> {
  await page.keyboard.type(ch, { delay: 0 });
  await sleep(charDelay(ch, cfg));
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
