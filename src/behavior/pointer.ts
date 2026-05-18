/**
 * Pointer movement.
 *
 * Cubic Bezier path with random control points, ease-in-out, micro-wobble
 * proportional to distance, burst-pause cadence (humans move in
 * accelerate-pause-accelerate spurts), and optional overshoot. Pure CDP
 * dispatch via Playwright's mouse — events carry isTrusted=true.
 */

import type { Page } from 'playwright';
import type { BehaviorConfig } from './config.js';
import { sleep, rand, randRange, randInt } from './timing.js';

interface Pt { x: number; y: number; }

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const uu = u * u, uuu = uu * u;
  const tt = t * t, ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function controlPoints(start: Pt, end: Pt): [Pt, Pt] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const b1 = (Math.random() - 0.5) * 0.6 * dist;
  const b2 = (Math.random() - 0.5) * 0.6 * dist;
  return [
    { x: start.x + dx * 0.25 + nx * b1, y: start.y + dy * 0.25 + ny * b1 },
    { x: start.x + dx * 0.75 + nx * b2, y: start.y + dy * 0.75 + ny * b2 },
  ];
}

let lastPointer: Pt = { x: 50, y: 50 };

export async function pointerTo(page: Page, ex: number, ey: number, cfg: BehaviorConfig): Promise<void> {
  const start = { ...lastPointer };
  const end = { x: ex, y: ey };
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  if (dist < 1) { lastPointer = end; return; }

  const steps = Math.max(cfg.mouseMinSteps, Math.min(cfg.mouseMaxSteps, Math.round(dist / cfg.mouseStepsPerPx)));
  const [cp1, cp2] = controlPoints(start, end);

  let burstSize = randInt(cfg.mouseBurstSize);
  let burstCount = 0;

  for (let i = 1; i <= steps; i++) {
    const prog = i / steps;
    const t = easeInOut(prog);
    const pt = bezier(start, cp1, cp2, end, t);
    const wobAmp = Math.sin(Math.PI * prog) * cfg.mouseWobbleMaxPx;
    const wx = pt.x + (Math.random() - 0.5) * 2 * wobAmp;
    const wy = pt.y + (Math.random() - 0.5) * 2 * wobAmp;
    await page.mouse.move(wx, wy, { steps: 1 });

    burstCount++;
    if (burstCount >= burstSize && i < steps) {
      await sleep(randRange(cfg.mouseBurstPauseMs));
      burstCount = 0;
      burstSize = randInt(cfg.mouseBurstSize);
    }
  }

  if (Math.random() < cfg.mouseOvershootChance) {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const oDist = randRange(cfg.mouseOvershootPx);
    await page.mouse.move(end.x + Math.cos(angle) * oDist, end.y + Math.sin(angle) * oDist, { steps: 1 });
    await sleep(rand(30, 80));
    await page.mouse.move(end.x + (Math.random() - 0.5) * 3, end.y + (Math.random() - 0.5) * 3, { steps: 1 });
  }

  lastPointer = end;
}

export interface ClickTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  isInput?: boolean;
}

export async function clickAt(page: Page, target: ClickTarget, cfg: BehaviorConfig): Promise<void> {
  let xFrac: number, yFrac: number;
  if (target.isInput) {
    xFrac = randRange(cfg.clickInputXFrac);
    yFrac = rand(0.30, 0.70);
  } else {
    xFrac = rand(0.35, 0.65);
    yFrac = rand(0.35, 0.65);
  }
  const tx = target.x + target.width * xFrac;
  const ty = target.y + target.height * yFrac;
  await pointerTo(page, tx, ty, cfg);
  await sleep(target.isInput ? randRange(cfg.clickAimDelayInputMs) : randRange(cfg.clickAimDelayBtnMs));
  await page.mouse.down();
  await sleep(target.isInput ? randRange(cfg.clickHoldInputMs) : randRange(cfg.clickHoldBtnMs));
  await page.mouse.up();
}

export async function hoverAt(page: Page, target: ClickTarget, cfg: BehaviorConfig): Promise<void> {
  const tx = target.x + target.width * rand(0.35, 0.65);
  const ty = target.y + target.height * rand(0.35, 0.65);
  await pointerTo(page, tx, ty, cfg);
}

export function pointerLast(): Pt {
  return { ...lastPointer };
}

export function pointerReset(x = 50, y = 50): void {
  lastPointer = { x, y };
}
