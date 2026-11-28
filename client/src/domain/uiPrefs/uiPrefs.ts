export {
  clampWheelZoomSensitivity,
  createDefaultUiPrefs,
  DEFAULT_WHEEL_ZOOM_SENSITIVITY,
  MAX_WHEEL_ZOOM_SENSITIVITY,
  MIN_WHEEL_ZOOM_SENSITIVITY,
  WHEEL_ZOOM_SENSITIVITY_STEP,
  type DockLayoutPrefs,
  type UiPrefsV1,
} from "./uiPrefsModel";

export {
  decodeUiPrefs,
  encodeUiPrefs,
  type DecodeUiPrefsResult,
} from "./uiPrefsCodec";