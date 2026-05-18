/**
 * Deterministic per-launch fingerprint seed.
 *
 * A single 64-bit seed drives every randomized surface (canvas, audio, WebGL,
 * font ordering, plugin index, hardware values). Same seed produces an
 * identical fingerprint across the entire session — so a site can't catch us
 * by sampling twice and noticing the values drift.
 */

import { randomBytes } from 'crypto';

export interface SeedRng {
  next(): number;
  intRange(min: number, max: number): number;
  floatRange(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  bool(probability: number): boolean;
  fork(label: string): SeedRng;
}

/** xoshiro256** — fast, statistically strong, deterministic. */
function makeRng(seed: bigint): SeedRng {
  let s0 = seed | 1n;
  let s1 = (seed ^ 0x9e3779b97f4a7c15n) | 1n;
  let s2 = (seed ^ 0xbf58476d1ce4e5b9n) | 1n;
  let s3 = (seed ^ 0x94d049bb133111ebn) | 1n;
  const mask = (1n << 64n) - 1n;
  const rotl = (x: bigint, k: bigint) => (((x << k) | (x >> (64n - k))) & mask);

  const nextU64 = (): bigint => {
    const result = (rotl((s1 * 5n) & mask, 7n) * 9n) & mask;
    const t = (s1 << 17n) & mask;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 45n);
    return result;
  };

  const next = (): number => {
    const v = nextU64();
    return Number(v >> 11n) / 2 ** 53;
  };

  return {
    next,
    intRange: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    floatRange: (min, max) => next() * (max - min) + min,
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)] as T,
    bool: (p) => next() < p,
    fork(label) {
      let h = seed;
      for (let i = 0; i < label.length; i++) {
        h = ((h ^ BigInt(label.charCodeAt(i))) * 0x100000001b3n) & mask;
      }
      return makeRng(h);
    },
  };
}

let cachedSeed: bigint | null = null;
let cachedRng: SeedRng | null = null;

export function freshSeed(): bigint {
  const buf = randomBytes(8);
  let s = 0n;
  for (let i = 0; i < 8; i++) s = (s << 8n) | BigInt(buf[i]);
  return s;
}

export function setLaunchSeed(seed: bigint): void {
  cachedSeed = seed;
  cachedRng = makeRng(seed);
}

export function launchSeed(): bigint {
  if (cachedSeed === null) {
    cachedSeed = freshSeed();
    cachedRng = makeRng(cachedSeed);
  }
  return cachedSeed;
}

export function rng(): SeedRng {
  if (!cachedRng) launchSeed();
  return cachedRng!;
}

export function seedHex(): string {
  return launchSeed().toString(16).padStart(16, '0');
}
