import {
  resolveLayoutSpacingHeaderControl,
  resolveLayoutStyleHeaderControl,
  resolveTreeDirectionHeaderControl,
} from "@/domain/map/mapLayoutStyleAvailability";

describe("resolveLayoutStyleHeaderControl (N1)", () => {
  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    layoutMode: "auto" as const,
  };

  it("マップ・auto で有効", () => {
    expect(resolveLayoutStyleHeaderControl(base)).toEqual({
      visible: true,
      disabled: false,
    });
  });

  it("アウトラインでは非表示", () => {
    expect(resolveLayoutStyleHeaderControl({ ...base, viewMode: "outline" })).toEqual({
      visible: false,
      disabled: false,
    });
  });

  it("保護・競合・外部削除・関連線・グループ・manual で disabled", () => {
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      isProtectedMode: true,
    }).disabled).toBe(true);
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      hasConflict: true,
    }).disabled).toBe(true);
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      isExternallyDeleted: true,
    }).disabled).toBe(true);
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      canvasSelection: { type: "relation", id: 1 },
    }).disabled).toBe(true);
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      canvasSelection: { type: "group", id: 1 },
    }).disabled).toBe(true);
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      layoutMode: "manual",
    }).disabled).toBe(true);
  });
});

describe("resolveTreeDirectionHeaderControl (N2)", () => {
  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    layoutMode: "auto" as const,
    layoutStyle: undefined as "orthogonal" | "radial" | undefined,
  };

  it("radial 中は disabled（値保持・表示は維持）", () => {
    expect(resolveTreeDirectionHeaderControl({
      ...base,
      layoutStyle: "radial",
    })).toMatchObject({ visible: true, disabled: true, disabledReason: "radial" });
  });

  it("manual / 保護でも disabled（理由は真因を返す）", () => {
    expect(resolveTreeDirectionHeaderControl({
      ...base,
      layoutMode: "manual",
    })).toMatchObject({ disabled: true, disabledReason: "manual" });
    expect(resolveTreeDirectionHeaderControl({
      ...base,
      isProtectedMode: true,
    })).toMatchObject({ disabled: true, disabledReason: "blocked" });
  });

  it("保護かつ radial でも理由は blocked（放射を推測しない）", () => {
    expect(resolveTreeDirectionHeaderControl({
      ...base,
      isProtectedMode: true,
      layoutStyle: "radial",
    }).disabledReason).toBe("blocked");
  });
});

describe("resolveLayoutSpacingHeaderControl (N3)", () => {
  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    layoutMode: "auto" as const,
  };

  it("auto なら有効（radial でも様式は引数に不要）", () => {
    expect(resolveLayoutSpacingHeaderControl(base)).toMatchObject({
      visible: true,
      disabled: false,
    });
  });

  it("manual では disabled", () => {
    expect(resolveLayoutSpacingHeaderControl({
      ...base,
      layoutMode: "manual",
    }).disabled).toBe(true);
  });
});
