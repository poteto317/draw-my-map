export type SlidingWindowLimiter = {
  allow(key: string, nowMs: number): boolean;
};

export function createSlidingWindowLimiter(options: {
  limit: number;
  windowMs: number;
}): SlidingWindowLimiter {
  const hits = new Map<string, number[]>();

  return {
    allow(key, nowMs) {
      const prev = hits.get(key) ?? [];
      const next = prev.filter((t) => nowMs - t < options.windowMs);
      if (next.length >= options.limit) {
        hits.set(key, next);
        return false;
      }
      next.push(nowMs);
      hits.set(key, next);
      return true;
    },
  };
}
