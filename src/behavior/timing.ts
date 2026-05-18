export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));
}

export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randRange(range: readonly [number, number]): number {
  return rand(range[0], range[1]);
}

export function randInt(range: readonly [number, number]): number {
  return Math.floor(rand(range[0], range[1] + 1));
}

export function gauss(mean: number, sigma: number): number {
  // Box-Muller
  const u1 = Math.max(Number.MIN_VALUE, Math.random());
  const u2 = Math.random();
  return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
