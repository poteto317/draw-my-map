import type { MapDocumentResult } from "@/types/mapDocument";

export const MAP_STORAGE_KEY = "draw-my-map.map.v1";

export function readStoredMapJson(
  storage: Pick<Storage, "getItem">,
): MapDocumentResult<string | null> {
  try {
    return { ok: true, value: storage.getItem(MAP_STORAGE_KEY) };
  } catch {
    return {
      ok: false,
      error: "ブラウザの保存データを読み取れませんでした。",
    };
  }
}

export function writeStoredMapJson(
  storage: Pick<Storage, "setItem">,
  json: string,
): MapDocumentResult<void> {
  try {
    storage.setItem(MAP_STORAGE_KEY, json);
    return { ok: true, value: undefined };
  } catch {
    return {
      ok: false,
      error: "ブラウザへ自動保存できませんでした。",
    };
  }
}
