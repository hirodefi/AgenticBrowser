/**
 * Behavior tuning.
 *
 * Distributions sourced from movement-traces in real human studies, not
 * folklore. Two presets: `relaxed` (default — passes Cloudflare-grade
 * behavioral checks) and `careful` (slower, used when a page is hostile and
 * we need extra confidence).
 */

export interface BehaviorConfig {
  // Mouse
  mouseMinSteps: number;
  mouseMaxSteps: number;
  mouseStepsPerPx: number;
  mouseWobbleMaxPx: number;
  mouseBurstSize: [number, number];
  mouseBurstPauseMs: [number, number];
  mouseOvershootChance: number;
  mouseOvershootPx: [number, number];

  // Click
  clickAimDelayBtnMs: [number, number];
  clickAimDelayInputMs: [number, number];
  clickHoldBtnMs: [number, number];
  clickHoldInputMs: [number, number];
  clickInputXFrac: [number, number];

  // Typing
  typeBaseDelayMs: [number, number];
  typeJitterFactor: number;
  typeBurstWordsMin: number;
  typeBurstWordsMax: number;
  typeWordPauseMs: [number, number];
  typeMistakeChance: number;
  typeBackspacePauseMs: [number, number];

  // Scroll
  scrollChunkMin: number;
  scrollChunkMax: number;
  scrollIntervalMs: [number, number];
  scrollSettleMs: [number, number];

  // Idle drift
  idleDriftPx: number;
  idlePauseMs: [number, number];
}

export const RELAXED: BehaviorConfig = {
  mouseMinSteps: 18,
  mouseMaxSteps: 60,
  mouseStepsPerPx: 7,
  mouseWobbleMaxPx: 1.4,
  mouseBurstSize: [6, 14],
  mouseBurstPauseMs: [18, 55],
  mouseOvershootChance: 0.22,
  mouseOvershootPx: [3, 14],

  clickAimDelayBtnMs: [60, 180],
  clickAimDelayInputMs: [40, 120],
  clickHoldBtnMs: [55, 120],
  clickHoldInputMs: [45, 95],
  clickInputXFrac: [0.18, 0.42],

  typeBaseDelayMs: [55, 165],
  typeJitterFactor: 0.45,
  typeBurstWordsMin: 2,
  typeBurstWordsMax: 5,
  typeWordPauseMs: [140, 380],
  typeMistakeChance: 0.012,
  typeBackspacePauseMs: [180, 380],

  scrollChunkMin: 90,
  scrollChunkMax: 320,
  scrollIntervalMs: [80, 220],
  scrollSettleMs: [400, 900],

  idleDriftPx: 4,
  idlePauseMs: [400, 1400],
};

export const CAREFUL: BehaviorConfig = {
  ...RELAXED,
  mouseMinSteps: 28,
  mouseMaxSteps: 110,
  mouseStepsPerPx: 5,
  mouseWobbleMaxPx: 1.8,
  mouseBurstPauseMs: [25, 75],
  mouseOvershootChance: 0.35,

  clickAimDelayBtnMs: [120, 320],
  clickHoldBtnMs: [70, 160],

  typeBaseDelayMs: [85, 230],
  typeJitterFactor: 0.6,
  typeMistakeChance: 0.02,

  scrollIntervalMs: [120, 320],
  scrollSettleMs: [600, 1400],
};

export type BehaviorPreset = 'relaxed' | 'careful';

export function resolvePreset(preset?: BehaviorPreset, overrides?: Partial<BehaviorConfig>): BehaviorConfig {
  const base = preset === 'careful' ? CAREFUL : RELAXED;
  return overrides ? { ...base, ...overrides } : base;
}
