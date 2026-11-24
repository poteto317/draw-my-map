import { renderMapGroups } from "@/components/map/pixi/renderMapGroups";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import { createTestNode } from "@/testing/createTestNode";
import type { MapGroup } from "@/types/mapGroup";

function group(partial: Partial<MapGroup> & Pick<MapGroup, "id" | "nodeIds">): MapGroup {
  return { label: "", ...partial };
}

const nodes = [
  createTestNode({ id: 1, label: "a", x: 0, y: 0, width: 100, height: 60 }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200, y: 0, width: 100, height: 60 }),
  createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 120, width: 100, height: 60 }),
];

describe("renderMapGroups", () => {
  it("AABB+余白の角丸を背面相当で描き、空ラベルは「グループ」を表示する", () => {
    const harness = createPixiTestHarness();
    const onGroupPointerDown = jest.fn();
    const Graphics = jest.fn().mockImplementation(() => ({
      roundRect: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: 1,
      eventMode: "none",
      cursor: "default",
    }));
    const Text = jest.fn().mockImplementation((options: { text?: string }) => ({
      options,
      text: options.text,
      anchor: { set: jest.fn() },
      x: 0,
      y: 0,
      eventMode: "none",
    }));
    const Container = jest.fn().mockImplementation(() => ({
      addChild: jest.fn(),
      eventMode: "none",
      cursor: "default",
      on: jest.fn().mockReturnThis(),
    }));

    renderMapGroups(
      harness.app.stage as never,
      { Graphics, Text, Container } as never,
      {
        groups: [group({ id: 20, nodeIds: [1, 2], label: "" })],
        nodes,
        visibleNodeIds: new Set([1, 2, 3]),
        selectedGroupId: 20,
        onGroupPointerDown,
      },
    );

    expect(Graphics).toHaveBeenCalledTimes(1);
    expect(Text).toHaveBeenCalledWith(expect.objectContaining({ text: "グループ" }));
    const g = Graphics.mock.results[0]!.value;
    expect(g.roundRect).toHaveBeenCalled();
    expect(g.eventMode).toBe("static");
    expect(harness.stage.addChild).toHaveBeenCalled();
  });

  it("可視メンバーが2未満なら描画しない", () => {
    const harness = createPixiTestHarness();
    const Graphics = jest.fn().mockImplementation(() => ({
      roundRect: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: 1,
      eventMode: "none",
      cursor: "default",
    }));

    renderMapGroups(
      harness.app.stage as never,
      { Graphics, Text: jest.fn(), Container: jest.fn() } as never,
      {
        groups: [group({ id: 20, nodeIds: [1, 2] })],
        nodes,
        visibleNodeIds: new Set([1]),
        selectedGroupId: null,
        onGroupPointerDown: jest.fn(),
      },
    );

    expect(Graphics).not.toHaveBeenCalled();
  });

  it("重なるグループは面積が大きい方を先に描き、小さい方がヒット優先になる", () => {
    const harness = createPixiTestHarness();
    const Graphics = jest.fn().mockImplementation(() => ({
      roundRect: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: 1,
      eventMode: "none",
      cursor: "default",
    }));
    const Text = jest.fn().mockImplementation((options: { text?: string }) => ({
      options,
      text: options.text,
      anchor: { set: jest.fn() },
      x: 0,
      y: 0,
      eventMode: "none",
    }));
    const added: unknown[] = [];
    const Container = jest.fn().mockImplementation(() => {
      const c = { addChild: jest.fn(), eventMode: "none", cursor: "default", on: jest.fn() };
      return c;
    });
    harness.stage.addChild.mockImplementation((child: unknown): number => {
      added.push(child);
      return 0;
    });

    // 大きい: 1+2+3 / 小さい: 2+3（入れ子相当）
    renderMapGroups(
      harness.app.stage as never,
      { Graphics, Text, Container } as never,
      {
        groups: [
          group({ id: 21, nodeIds: [2, 3], label: "小" }),
          group({ id: 20, nodeIds: [1, 2, 3], label: "大" }),
        ],
        nodes,
        visibleNodeIds: new Set([1, 2, 3]),
        selectedGroupId: null,
        onGroupPointerDown: jest.fn(),
      },
    );

    expect(Container).toHaveBeenCalledTimes(2);
    expect(Text.mock.calls.map((call) => call[0].text)).toEqual(["大", "小"]);
    // 後から addChild された方が Pixi で手前＝ヒット優先
    expect(added).toHaveLength(2);
  });
});
