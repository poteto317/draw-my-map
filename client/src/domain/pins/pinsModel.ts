export const MAX_PINS_PER_MAP = 50;

export type NodePin = {
  readonly nodeId: number;
  readonly createdAt: string;
};

export type NodePinsStore = {
  readonly version: 1;
  readonly maps: Record<string, readonly NodePin[]>;
};

// 共有定数参照を避け、呼び出しごとに新しい配列を返す（L-461）
export function createEmptyNodePins(): NodePin[] {
  return [];
}

export function createEmptyNodePinsStore(): NodePinsStore {
  return { version: 1, maps: {} };
}

export function pruneAbsentNodePins(
  pins: readonly NodePin[],
  existingNodeIds: ReadonlySet<number>,
): { readonly pins: NodePin[]; readonly repaired: boolean } {
  const kept: NodePin[] = [];
  let repaired = false;
  for (const pin of pins) {
    if (!existingNodeIds.has(pin.nodeId)) {
      repaired = true;
      continue;
    }
    kept.push(pin);
  }
  return { pins: kept, repaired };
}
