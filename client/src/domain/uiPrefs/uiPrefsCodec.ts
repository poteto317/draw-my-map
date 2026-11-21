import { isPlainRecord } from "@/domain/shared/unknownRecord";
import {
  clampWheelZoomSensitivity,
  createDefaultUiPrefs,
  DEFAULT_WHEEL_ZOOM_SENSITIVITY,
  type UiPrefsV1,
} from "./uiPrefsModel";

export type DecodeUiPrefsResult = {
  readonly prefs: UiPrefsV1;
  readonly repaired: boolean;
  readonly document: Record<string, unknown>;
};

function cloneOwnKeys(source: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    copy[key] = source[key];
  }
  return copy;
}

function defaultDocument(): Record<string, unknown> {
  const defaults = createDefaultUiPrefs();
  return { ...defaults };
}

function prefsFromDocument(document: Record<string, unknown>): UiPrefsV1 {
  const sensitivity = clampWheelZoomSensitivity(
    typeof document.wheelZoomSensitivity === "number"
      ? document.wheelZoomSensitivity
      : DEFAULT_WHEEL_ZOOM_SENSITIVITY,
  );
  return {
    version: 1,
    wheelZoomSensitivity: sensitivity,
  };
}

export function decodeUiPrefs(raw: string | null): DecodeUiPrefsResult {
  if (raw === null) {
    const document = defaultDocument();
    return { prefs: prefsFromDocument(document), repaired: false, document };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const document = defaultDocument();
    return { prefs: prefsFromDocument(document), repaired: true, document };
  }
  if (!isPlainRecord(parsed)) {
    const document = defaultDocument();
    return { prefs: prefsFromDocument(document), repaired: true, document };
  }

  const document = cloneOwnKeys(parsed);
  let repaired = false;
  if (document.version !== 1) {
    document.version = 1;
    repaired = true;
  }
  const rawSensitivity = document.wheelZoomSensitivity;
  if (typeof rawSensitivity !== "number" || !Number.isFinite(rawSensitivity)) {
    document.wheelZoomSensitivity = DEFAULT_WHEEL_ZOOM_SENSITIVITY;
    repaired = true;
  } else {
    const clamped = clampWheelZoomSensitivity(rawSensitivity);
    if (clamped !== rawSensitivity) {
      document.wheelZoomSensitivity = clamped;
      repaired = true;
    }
  }

  return {
    prefs: prefsFromDocument(document),
    repaired,
    document,
  };
}

export function encodeUiPrefs(document: Record<string, unknown>): string {
  const prefs = prefsFromDocument(document);
  return JSON.stringify({
    ...document,
    version: prefs.version,
    wheelZoomSensitivity: prefs.wheelZoomSensitivity,
  });
}