// randomUUID が使えない環境では、時刻と乱数を 36 進数でつないだ id にする。
export function generateMapId(
  source: {
    randomUUID?: (() => string) | null;
    now?: () => number;
    random?: () => number;
  } = {},
): string {
  const randomUUID =
    source.randomUUID === undefined
      ? globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
      : source.randomUUID;
  if (randomUUID) {
    return randomUUID();
  }
  const now = source.now ?? Date.now;
  const random = source.random ?? Math.random;
  return `${now().toString(36)}-${random().toString(36).slice(2, 10)}`;
}
