"use client";

import { useCallback, useRef, useState } from "react";
import {
  clampWheelZoomSensitivity,
  type UiPrefsV1,
} from "@/domain/uiPrefs/uiPrefs";
import {
  readUiPrefs,
  writeUiPrefs,
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

type UseUiPrefsResult = {
  readonly prefs: UiPrefsV1;
  readonly setWheelZoomSensitivity: (value: number) => void;
};

export function useUiPrefs(
  storage: MapLibraryStorage = resolveUiPrefsStorage(),
): UseUiPrefsResult {
  const initial = readUiPrefs(storage);
  const [prefs, setPrefs] = useState<UiPrefsV1>(initial.prefs);
  const documentRef = useRef(initial.document);

  const setWheelZoomSensitivity = useCallback((value: number) => {
    const sensitivity = clampWheelZoomSensitivity(value);
    const nextPrefs: UiPrefsV1 = {
      version: 1,
      wheelZoomSensitivity: sensitivity,
    };
    const nextDocument: Record<string, unknown> = {
      ...documentRef.current,
      version: 1,
      wheelZoomSensitivity: sensitivity,
    };
    documentRef.current = nextDocument;
    setPrefs(nextPrefs);
    writeUiPrefs(storage, nextDocument);
  }, [storage]);

  return { prefs, setWheelZoomSensitivity };
}