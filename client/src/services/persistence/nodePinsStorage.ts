import {
  decodeNodePinsStore,
  encodeNodePinsStore,
  pinsForMap,
  withMapPins,
} from "@/domain/pins/pinsCodec";
import type { NodePin } from "@/domain/pins/pinsModel";
import {
  isQuotaExceededError,
  type MapLibraryStorage,
} from "./mapLibraryStorage";

export const NODE_PINS_STORAGE_KEY = "draw-my-map.node-pins.v1";

export type NodePinsReadResult =
  | { readonly status: "ok"; readonly pins: NodePin[]; readonly repaired: boolean }
  | { readonly status: "corrupt" }
  | { readonly status: "read-error" };

export type NodePinsWriteResult =
  | { readonly status: "ok" }
  | { readonly status: "quota-exceeded" }
  | { readonly status: "write-error" };

// マップ単位のピンを読む。破損・読取不能・空を区別し、失敗を空成功にしない（L-002）
export function readPins(
  storage: MapLibraryStorage,
  mapId: string,
): NodePinsReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(NODE_PINS_STORAGE_KEY);
  } catch {
    return { status: "read-error" };
  }
  const decoded = decodeNodePinsStore(raw);
  if (decoded.status !== "ok") return decoded;
  return {
    status: "ok",
    pins: pinsForMap(decoded.store, mapId),
    repaired: decoded.repaired,
  };
}

// 最新ストアを読んで当該マップだけ差し替え、書き戻す（L-921）
export function writePins(
  storage: MapLibraryStorage,
  mapId: string,
  pins: readonly NodePin[],
): NodePinsWriteResult {
  let raw: string | null;
  try {
    raw = storage.getItem(NODE_PINS_STORAGE_KEY);
  } catch {
    return { status: "write-error" };
  }
  const decoded = decodeNodePinsStore(raw);
  if (decoded.status !== "ok") {
    return { status: "write-error" };
  }

  const nextStore = withMapPins(decoded.store, mapId, pins);
  try {
    storage.setItem(NODE_PINS_STORAGE_KEY, encodeNodePinsStore(nextStore));
    return { status: "ok" };
  } catch (error) {
    return {
      status: isQuotaExceededError(error) ? "quota-exceeded" : "write-error",
    };
  }
}
