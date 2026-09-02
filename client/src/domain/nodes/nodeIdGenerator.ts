export function createMonotonicIdGenerator(
  now: () => number = Date.now,
): () => number {
  let previousId: number | null = null;

  return () => {
    const currentTime = now();
    const id = previousId === null
      ? currentTime
      : Math.max(currentTime, previousId + 1);
    previousId = id;
    return id;
  };
}
