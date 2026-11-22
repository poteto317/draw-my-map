import { isValidMapId } from "@/domain/mapLibrary/mapIndex";
import { isPlainRecord } from "@/domain/shared/unknownRecord";
import {
  createEmptyNodePinsStore,
  MAX_PINS_PER_MAP,
  type NodePin,
  type NodePinsStore,
} from "./pinsModel";

export type DecodeNodePinsStoreResult =
  | { readonly status: "ok"; readonly store: NodePinsStore; readonly repaired: boolean }
  | { readonly status: "corrupt" };

function decodePin(value: unknown): NodePin | null {
  if (!isPlainRecord(value)) return null;
  if (typeof value.nodeId !== "number" || !Number.isSafeInteger(value.nodeId)) return null;
  if (typeof value.createdAt !== "string" || value.createdAt.length === 0) return null;
  return { nodeId: value.nodeId, createdAt: value.createdAt };
}

function decodeMapPins(value: unknown): { pins: NodePin[]; repaired: boolean } | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_PINS_PER_MAP) return null;

  const pins: NodePin[] = [];
  const seen = new Set<number>();
  let repaired = false;

  for (const entry of value) {
    const pin = decodePin(entry);
    if (pin === null) {
      repaired = true;
      continue;
    }
    if (seen.has(pin.nodeId)) {
      repaired = true;
      continue;
    }
    seen.add(pin.nodeId);
    pins.push(pin);
  }

  return { pins, repaired };
}

export function decodeNodePinsStore(raw: string | null): DecodeNodePinsStoreResult {
  if (raw === null) {
    return { status: "ok", store: createEmptyNodePinsStore(), repaired: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }

  if (!isPlainRecord(parsed) || parsed.version !== 1 || !isPlainRecord(parsed.maps)) {
    return { status: "corrupt" };
  }

  const maps: Record<string, NodePin[]> = {};
  let repaired = false;

  for (const [mapId, value] of Object.entries(parsed.maps)) {
    if (!isValidMapId(mapId)) {
      repaired = true;
      continue;
    }
    const decoded = decodeMapPins(value);
    if (decoded === null) {
      return { status: "corrupt" };
    }
    if (decoded.repaired) repaired = true;
    if (decoded.pins.length > 0) {
      maps[mapId] = decoded.pins;
    } else if (Array.isArray(value) && value.length > 0) {
      // 全エントリ不正で空になった場合もマップキーは落とす
      repaired = true;
    }
  }

  return {
    status: "ok",
    store: { version: 1, maps },
    repaired,
  };
}

export function encodeNodePinsStore(store: NodePinsStore): string {
  return JSON.stringify({
    version: 1,
    maps: store.maps,
  });
}

export function pinsForMap(store: NodePinsStore, mapId: string): NodePin[] {
  const pins = store.maps[mapId];
  return pins === undefined ? [] : [...pins];
}

export function withMapPins(
  store: NodePinsStore,
  mapId: string,
  pins: readonly NodePin[],
): NodePinsStore {
  const maps: Record<string, readonly NodePin[]> = { ...store.maps };
  if (pins.length === 0) {
    delete maps[mapId];
  } else {
    maps[mapId] = [...pins];
  }
  return { version: 1, maps };
}
