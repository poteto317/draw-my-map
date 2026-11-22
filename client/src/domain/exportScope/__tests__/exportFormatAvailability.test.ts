import {
  isExportFormatEnabled,
  resolveExportFormatControls,
} from "@/domain/exportScope/exportFormatAvailability";
import type { ExportScope } from "@/domain/exportScope/exportScope";

const formats = ["png", "svg", "markdown", "json", "bullets"] as const;

const expected: Record<ExportScope, Record<(typeof formats)[number], boolean>> = {
  all: { png: true, svg: true, markdown: true, json: true, bullets: true },
  visible: { png: true, svg: true, markdown: true, json: false, bullets: false },
  selection: { png: true, svg: false, markdown: true, json: true, bullets: false },
};

describe("isExportFormatEnabled", () => {
  for (const scope of Object.keys(expected) as ExportScope[]) {
    for (const format of formats) {
      it(`${scope} × ${format} → ${expected[scope][format]}`, () => {
        expect(isExportFormatEnabled(scope, format)).toBe(expected[scope][format]);
      });
    }
  }
});

describe("resolveExportFormatControls", () => {
  it("all かつノードありなら全形式を有効にする", () => {
    const controls = resolveExportFormatControls("all", 3);
    for (const format of formats) {
      expect(controls[format]).toEqual({ enabled: true, disabledReason: undefined });
    }
  });

  it("all はノード 0 件でも空理由で止めない（既存マップ全体書き出し）", () => {
    const controls = resolveExportFormatControls("all", 0);
    expect(controls.png.enabled).toBe(true);
    expect(controls.json.enabled).toBe(true);
    expect(controls.png.disabledReason).toBeUndefined();
  });

  it("visible でノード 0 件なら許可形式も空理由で無効にする", () => {
    const controls = resolveExportFormatControls("visible", 0);
    expect(controls.png).toEqual({
      enabled: false,
      disabledReason: "書き出すノードがありません",
    });
    expect(controls.json).toEqual({
      enabled: false,
      disabledReason: "この書き出し対象では使えません",
    });
  });

  it("selection でノードありなら許可外だけ対象理由で無効にする", () => {
    const controls = resolveExportFormatControls("selection", 2);
    expect(controls.png).toEqual({ enabled: true, disabledReason: undefined });
    expect(controls.svg).toEqual({
      enabled: false,
      disabledReason: "この書き出し対象では使えません",
    });
    expect(controls.bullets).toEqual({
      enabled: false,
      disabledReason: "この書き出し対象では使えません",
    });
  });
});
