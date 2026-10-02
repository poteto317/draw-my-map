import {
  NODE_CONTEXT_MENU_SIZE,
  clampNodeContextMenuPosition,
} from "@/components/map/nodeContextMenuLayout";

const container = { width: 800, height: 600 };

describe("clampNodeContextMenuPosition", () => {
  it("収まる位置はそのまま返す", () => {
    expect(clampNodeContextMenuPosition({ x: 10, y: 20 }, container)).toEqual({ x: 10, y: 20 });
  });

  it("右下端ではメニューがコンテナ内に収まる位置へ寄せる", () => {
    expect(clampNodeContextMenuPosition({ x: 790, y: 599 }, container)).toEqual({
      x: 800 - NODE_CONTEXT_MENU_SIZE.width,
      y: 600 - NODE_CONTEXT_MENU_SIZE.height,
    });
  });

  it("コンテナがメニューより小さくても負にならない", () => {
    expect(clampNodeContextMenuPosition({ x: 5, y: 5 }, { width: 10, height: 10 })).toEqual({ x: 0, y: 0 });
  });
});
