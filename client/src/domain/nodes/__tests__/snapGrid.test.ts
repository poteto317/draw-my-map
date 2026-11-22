import {
  clampGridStep,
  DEFAULT_GRID_STEP,
  DEFAULT_LAYOUT_SNAP_PREFS,
  snapToGrid,
} from "@/domain/nodes/snapGrid";

describe("snapGrid", () => {
  describe("snapToGrid", () => {
    it("step の倍数へ丸める", () => {
      expect(snapToGrid(17, 8)).toBe(16);
      expect(snapToGrid(19, 8)).toBe(16);
      expect(snapToGrid(20, 8)).toBe(24);
    });

    it("負座標も同じ式で丸める", () => {
      expect(snapToGrid(-17, 8)).toBe(-16);
      expect(snapToGrid(-20, 8)).toBe(-16);
    });

    it("0 はそのまま", () => {
      expect(snapToGrid(0, 8)).toBe(0);
    });
  });

  describe("clampGridStep", () => {
    it("4〜64 の 4 の倍数にクリップする", () => {
      expect(clampGridStep(3)).toBe(4);
      expect(clampGridStep(65)).toBe(64);
      expect(clampGridStep(10)).toBe(12);
      expect(clampGridStep(7)).toBe(8);
    });

    it("既定 step は 8", () => {
      expect(DEFAULT_LAYOUT_SNAP_PREFS.gridStep).toBe(DEFAULT_GRID_STEP);
    });
  });
});