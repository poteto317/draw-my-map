import {
  resolveAutomaticResolutionLevel,
  resolveResolutionLevel,
} from "@/domain/nodes/nodeResolutionLevel";

describe("node resolution level", () => {
  it.each([
    [0.25, null, "high"], [0.599, null, "high"],
    [0.6, null, "medium"], [0.999, null, "medium"],
    [1, null, "all"],
    [0.64, "high", "high"], [0.65, "high", "medium"],
    [1.05, "high", "all"],
    [0.55, "medium", "medium"], [0.549, "medium", "high"],
    [1.04, "medium", "medium"], [1.05, "medium", "all"],
    [0.95, "all", "all"], [0.949, "all", "medium"],
    [0.549, "all", "high"],
  ] as const)("scale=%s previous=%s => %s", (scale, previous, expected) => {
    expect(resolveAutomaticResolutionLevel(scale, previous)).toBe(expected);
  });

  it.each([
    ["high", 0.25, "all"],
    ["medium", 4, "all"],
    ["all", 0.25, "high"],
  ] as const)("手動モード%sはscale=%sとprevious=%sを無視する", (mode, scale, previous) => {
    expect(resolveResolutionLevel(mode, scale, previous)).toBe(mode);
  });

  it("自動モードでは現在のscaleから表示レベルを再判定する", () => {
    expect(resolveResolutionLevel("auto", 0.65, "high")).toBe("medium");
  });

  it("手動モードから自動へ戻すと現在のscaleに対応する最終レベルを返す", () => {
    expect(resolveResolutionLevel("auto", 1.05, "high")).toBe("all");
  });
});
