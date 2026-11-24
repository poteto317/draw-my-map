import {
  isNodeTargetOperationBlocked,
  relationSelection,
  groupSelection,
} from "@/domain/map/mapCanvasSelectionGuards";
import {
  resolveLayoutStyleHeaderControl,
  resolveTreeDirectionHeaderControl,
  resolveLayoutSpacingHeaderControl,
} from "@/domain/map/mapLayoutStyleAvailability";

/**
 * Task4 RED/GREEN: inventory 代表経路で様式入口 N1（および関連 N2/N3）が
 * disabled／拒否になること。
 */
describe("layoutStyle guards (inventory representatives)", () => {
  const base = {
    viewMode: "map" as const,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    layoutMode: "auto" as const,
    layoutStyle: undefined as "orthogonal" | "radial" | undefined,
  };

  it("関連線／グループ選択中はノード対象操作ブロック（U41 代表）", () => {
    expect(isNodeTargetOperationBlocked(relationSelection(10))).toBe(true);
    expect(isNodeTargetOperationBlocked(groupSelection(10))).toBe(true);
  });

  it("アウトラインでは様式コントロールが非表示", () => {
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      viewMode: "outline",
    }).visible).toBe(false);
  });

  it("保護モードでは様式が disabled", () => {
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      isProtectedMode: true,
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("競合では様式が disabled", () => {
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      hasConflict: true,
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("関連線／グループ選択中は様式が disabled", () => {
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      canvasSelection: relationSelection(1),
    })).toMatchObject({ visible: true, disabled: true });
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      canvasSelection: groupSelection(1),
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("manual では様式 UI disabled（値保持）", () => {
    expect(resolveLayoutStyleHeaderControl({
      ...base,
      layoutMode: "manual",
    })).toMatchObject({ visible: true, disabled: true });
  });

  it("radial 中は treeDirection disabled、spacing は有効", () => {
    expect(resolveTreeDirectionHeaderControl({
      ...base,
      layoutStyle: "radial",
    })).toMatchObject({ visible: true, disabled: true });
    expect(resolveLayoutSpacingHeaderControl(base)).toMatchObject({
      visible: true,
      disabled: false,
    });
  });
});
