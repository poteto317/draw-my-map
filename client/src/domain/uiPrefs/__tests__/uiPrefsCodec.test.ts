import {
  createDefaultUiPrefs,
  DEFAULT_WHEEL_ZOOM_SENSITIVITY,
} from "@/domain/uiPrefs/uiPrefsModel";
import { decodeUiPrefs, encodeUiPrefs } from "@/domain/uiPrefs/uiPrefsCodec";

describe("decodeUiPrefs", () => {
  it("nullのときは既定値を repaired: false で返す", () => {
    expect(decodeUiPrefs(null)).toEqual({
      prefs: createDefaultUiPrefs(),
      repaired: false,
      document: createDefaultUiPrefs(),
    });
  });

  it("正常なJSONを読み取れる", () => {
    const raw = JSON.stringify({
      version: 1,
      wheelZoomSensitivity: 0.004,
    });
    expect(decodeUiPrefs(raw)).toEqual({
      prefs: { version: 1, wheelZoomSensitivity: 0.004 },
      repaired: false,
      document: { version: 1, wheelZoomSensitivity: 0.004 },
    });
  });

  it("破損JSONは既定値へ repaired: true", () => {
    expect(decodeUiPrefs("{")).toEqual({
      prefs: createDefaultUiPrefs(),
      repaired: true,
      document: createDefaultUiPrefs(),
    });
  });

  it("未知のキーを保持する", () => {
    const raw = JSON.stringify({
      version: 1,
      wheelZoomSensitivity: 0.003,
      futureFlag: true,
    });
    const result = decodeUiPrefs(raw);
    expect(result.document).toEqual({
      version: 1,
      wheelZoomSensitivity: 0.003,
      futureFlag: true,
    });
    expect(encodeUiPrefs(result.document)).toBe(raw);
  });

  it("不正な感度は修復する", () => {
    const raw = JSON.stringify({
      version: 1,
      wheelZoomSensitivity: "fast",
      futureFlag: 1,
    });
    const result = decodeUiPrefs(raw);
    expect(result.repaired).toBe(true);
    expect(result.prefs.wheelZoomSensitivity).toBe(DEFAULT_WHEEL_ZOOM_SENSITIVITY);
    expect(result.document.futureFlag).toBe(1);
  });

  it("範囲外の有限値は clamp して repaired: true", () => {
    const raw = JSON.stringify({
      version: 1,
      wheelZoomSensitivity: 0.01,
    });
    const result = decodeUiPrefs(raw);
    expect(result.repaired).toBe(true);
    expect(result.prefs.wheelZoomSensitivity).toBe(0.006);
    expect(result.document.wheelZoomSensitivity).toBe(0.006);
  });
});