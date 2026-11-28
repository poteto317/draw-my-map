import {
  createDefaultDockLayout,
  type DockLayoutPrefs,
} from "@/domain/dock/defaultDockLayout";

export const DEFAULT_WHEEL_ZOOM_SENSITIVITY = 0.0025;
export const MIN_WHEEL_ZOOM_SENSITIVITY = 0.0005;
export const MAX_WHEEL_ZOOM_SENSITIVITY = 0.006;
export const WHEEL_ZOOM_SENSITIVITY_STEP = 0.0001;

export type { DockLayoutPrefs };

export type UiPrefsV1 = {
  readonly version: 1;
  readonly wheelZoomSensitivity: number;
  /** 読込欠落時も normalize で補完され、常に正規化済み */
  readonly dockLayout: DockLayoutPrefs;
};

export function clampWheelZoomSensitivity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_WHEEL_ZOOM_SENSITIVITY;
  }
  return Math.min(
    MAX_WHEEL_ZOOM_SENSITIVITY,
    Math.max(MIN_WHEEL_ZOOM_SENSITIVITY, value),
  );
}

export function createDefaultUiPrefs(): UiPrefsV1 {
  return {
    version: 1,
    wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
    dockLayout: createDefaultDockLayout(),
  };
}
