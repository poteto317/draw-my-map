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

export function removeStoredMapJson(
  storage: Pick<Storage, "removeItem">,
): MapDocumentResult<void> {
  try {
    storage.removeItem(MAP_STORAGE_KEY);
    return { ok: true, value: undefined };
  } catch {
    return {
      ok: false,
      error: "ブラウザの保存データを削除できませんでした。",
    };
  }
}

// 移行のやり直しが失敗したときに、消した旧キーを元の文字列のまま書き戻す。
export function restoreStoredMapJson(
  storage: Pick<Storage, "setItem">,
  raw: string,
): MapDocumentResult<void> {
  try {
    storage.setItem(MAP_STORAGE_KEY, raw);
    return { ok: true, value: undefined };
  } catch {
    return {
      ok: false,
      error: "ブラウザへ保存できませんでした。",
    };
  }
}
