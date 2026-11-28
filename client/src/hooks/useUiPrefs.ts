"use client";

import { useCallback, useRef, useState, type MutableRefObject } from "react";
import {
  normalizeDockLayout,
  type DockLayoutPrefs,
} from "@/domain/dock/defaultDockLayout";
import {
  clampWheelZoomSensitivity,
  type UiPrefsV1,
} from "@/domain/uiPrefs/uiPrefs";
import {
  readUiPrefs,
  writeUiPrefs,
  type UiPrefsWriteResult,
} from "@/services/persistence/uiPrefsStorage";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";

function resolveUiPrefsStorage(): MapLibraryStorage {
  try {
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      get length() {
        return memory.size;
      },
      key(index: number) {
        return [...memory.keys()][index] ?? null;
      },
      getItem(key: string) {
        return memory.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        memory.set(key, value);
      },
      removeItem(key: string) {
        memory.delete(key);
      },
    };
  }
}

export type SetDockLayoutResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

type UseUiPrefsResult = {
  readonly prefs: UiPrefsV1;
  readonly setWheelZoomSensitivity: (value: number) => void;
  readonly setDockLayout: (layout: DockLayoutPrefs) => SetDockLayoutResult;
};

function writeResultToDockResult(result: UiPrefsWriteResult): SetDockLayoutResult {
  if (result.ok) return { ok: true };
  return {
    ok: false,
    message: "Dock の設定を保存できませんでした。",
  };
}

/**
 * prefs / document の組み立てとストレージ反映を一箇所に寄せる。
 * 感度更新は書き込み失敗でもメモリ上 prefs を進める（既存契約）。
 * dockLayout 更新は成功時のみ state を進める。
 */
function buildUiPrefsDocument(input: {
  readonly documentRef: MutableRefObject<Record<string, unknown>>;
  readonly wheelZoomSensitivity: number;
  readonly dockLayout: DockLayoutPrefs;
}): { readonly nextPrefs: UiPrefsV1; readonly nextDocument: Record<string, unknown> } {
  const nextPrefs: UiPrefsV1 = {
    version: 1,
    wheelZoomSensitivity: input.wheelZoomSensitivity,
    dockLayout: input.dockLayout,
  };
  const nextDocument: Record<string, unknown> = {
    ...input.documentRef.current,
    version: 1,
    wheelZoomSensitivity: input.wheelZoomSensitivity,
    dockLayout: {
      visibleSlotIds: [...input.dockLayout.visibleSlotIds],
    },
  };
  return { nextPrefs, nextDocument };
}

function commitWheelZoomSensitivity(input: {
  readonly documentRef: MutableRefObject<Record<string, unknown>>;
  readonly storage: MapLibraryStorage;
  readonly setPrefs: (prefs: UiPrefsV1) => void;
  readonly wheelZoomSensitivity: number;
  readonly dockLayout: DockLayoutPrefs;
}): void {
  const { nextPrefs, nextDocument } = buildUiPrefsDocument(input);
  // 感度は書き込み成否に関わらず UI へ即反映する
  input.documentRef.current = nextDocument;
  input.setPrefs(nextPrefs);
  writeUiPrefs(input.storage, nextDocument);
}

function commitDockLayout(input: {
  readonly documentRef: MutableRefObject<Record<string, unknown>>;
  readonly storage: MapLibraryStorage;
  readonly setPrefs: (prefs: UiPrefsV1) => void;
  readonly wheelZoomSensitivity: number;
  readonly dockLayout: DockLayoutPrefs;
}): UiPrefsWriteResult {
  const { nextPrefs, nextDocument } = buildUiPrefsDocument(input);
  const result = writeUiPrefs(input.storage, nextDocument);
  if (!result.ok) return result;
  input.documentRef.current = nextDocument;
  input.setPrefs(nextPrefs);
  return result;
}

export function useUiPrefs(
  storage: MapLibraryStorage = resolveUiPrefsStorage(),
): UseUiPrefsResult {
  const initial = readUiPrefs(storage);
  const [prefs, setPrefs] = useState<UiPrefsV1>(initial.prefs);
  const documentRef = useRef(initial.document);

  const setWheelZoomSensitivity = useCallback((value: number) => {
    const sensitivity = clampWheelZoomSensitivity(value);
    const dockLayout = normalizeDockLayout(documentRef.current.dockLayout);
    commitWheelZoomSensitivity({
      documentRef,
      storage,
      setPrefs,
      wheelZoomSensitivity: sensitivity,
      dockLayout,
    });
  }, [storage]);

  const setDockLayout = useCallback((layout: DockLayoutPrefs): SetDockLayoutResult => {
    const dockLayout = normalizeDockLayout(layout);
    const sensitivity = clampWheelZoomSensitivity(
      typeof documentRef.current.wheelZoomSensitivity === "number"
        ? documentRef.current.wheelZoomSensitivity
        : prefs.wheelZoomSensitivity,
    );
    return writeResultToDockResult(
      commitDockLayout({
        documentRef,
        storage,
        setPrefs,
        wheelZoomSensitivity: sensitivity,
        dockLayout,
      }),
    );
  }, [prefs.wheelZoomSensitivity, storage]);

  return { prefs, setWheelZoomSensitivity, setDockLayout };
}
