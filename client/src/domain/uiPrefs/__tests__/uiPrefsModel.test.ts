import { createDefaultDockLayout } from "@/domain/dock/defaultDockLayout";
import {
  clampWheelZoomSensitivity,
  createDefaultUiPrefs,
  DEFAULT_WHEEL_ZOOM_SENSITIVITY,
  MAX_WHEEL_ZOOM_SENSITIVITY,
  MIN_WHEEL_ZOOM_SENSITIVITY,
} from "@/domain/uiPrefs/uiPrefsModel";

describe("clampWheelZoomSensitivity", () => {
  it("既定値の範囲内ではそのまま返す", () => {
    expect(clampWheelZoomSensitivity(DEFAULT_WHEEL_ZOOM_SENSITIVITY))
      .toBe(DEFAULT_WHEEL_ZOOM_SENSITIVITY);
  });

  it.each([MIN_WHEEL_ZOOM_SENSITIVITY, MAX_WHEEL_ZOOM_SENSITIVITY])(
    "境界値 %s を返す",
    (value) => {
      expect(clampWheelZoomSensitivity(value)).toBe(value);
    },
  );

  it("範囲外はクランプする", () => {
    expect(clampWheelZoomSensitivity(0.0001)).toBe(MIN_WHEEL_ZOOM_SENSITIVITY);
    expect(clampWheelZoomSensitivity(1)).toBe(MAX_WHEEL_ZOOM_SENSITIVITY);
  });

  it("非有限値は既定値にする", () => {
    expect(clampWheelZoomSensitivity(Number.NaN)).toBe(DEFAULT_WHEEL_ZOOM_SENSITIVITY);
    expect(clampWheelZoomSensitivity(Number.POSITIVE_INFINITY))
      .toBe(DEFAULT_WHEEL_ZOOM_SENSITIVITY);
  });
});

describe("createDefaultUiPrefs", () => {
  it("version 1 と既定感度を返す", () => {
    expect(createDefaultUiPrefs()).toEqual({
      version: 1,
      wheelZoomSensitivity: DEFAULT_WHEEL_ZOOM_SENSITIVITY,
      dockLayout: createDefaultDockLayout(),
    });
  });
});