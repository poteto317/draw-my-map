export type VisibilityTween = {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
};

export function sampleVisibilityTween(
  tween: VisibilityTween,
  now: number,
): { opacity: number; done: boolean } {
  const progress = Math.min(1, Math.max(0, (now - tween.startedAt) / tween.durationMs));
  if (progress === 0) return { opacity: tween.from, done: false };
  if (progress === 1) return { opacity: tween.to, done: true };

  const easedProgress = 1 - (1 - progress) ** 3;
  return {
    opacity: tween.from + (tween.to - tween.from) * easedProgress,
    done: false,
  };
}
