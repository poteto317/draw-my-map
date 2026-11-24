import { renderMapRelations } from "@/components/map/pixi/renderMapRelations";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import { createTestNode } from "@/testing/createTestNode";
import type { MapRelation } from "@/types/mapRelation";

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return { kind: "related", directed: false, ...partial };
}

const nodes = [
  createTestNode({ id: 1, label: "a", x: 0, y: 0, width: 100, height: 60 }),
  createTestNode({ id: 2, parentId: 1, label: "b", x: 200, y: 0, width: 100, height: 60 }),
  createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 120, width: 100, height: 60 }),
];

describe("renderMapRelations", () => {
  it("両端が visibleNodeIds に含まれるときだけ描画し、kind 色・ヒットを付ける", () => {
    const harness = createPixiTestHarness();
    const onRelationPointerDown = jest.fn();
    const Graphics = jest.fn().mockImplementation(() => ({
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: 1,
      eventMode: "none",
      cursor: "default",
    }));

    renderMapRelations(
      harness.app.stage as never,
      { Graphics } as never,
      {
        relations: [
          relation({ id: 10, fromId: 1, toId: 2, kind: "dependency", directed: true }),
          relation({ id: 11, fromId: 2, toId: 3 }),
        ],
        nodes,
        visibleNodeIds: new Set([1, 2]),
        highlightNodeIds: new Set(),
        selectedRelationId: 10,
        onRelationPointerDown,
      },
    );

    // 1–2 のみ（2–3 は 3 が非可視）
    expect(Graphics).toHaveBeenCalledTimes(1);
    const g = Graphics.mock.results[0]!.value;
    expect(g.eventMode).toBe("static");
    expect(g.cursor).toBe("pointer");
    expect(g.stroke).toHaveBeenCalledWith(expect.objectContaining({ color: 0x2563eb, width: 4 }));
    expect(g.on).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(harness.stage.addChild).toHaveBeenCalledWith(g);
  });

  it("非可視の両端は描画しない", () => {
    const harness = createPixiTestHarness();
    const Graphics = jest.fn().mockImplementation(() => ({
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: 1,
      eventMode: "none",
      cursor: "default",
    }));

    renderMapRelations(
      harness.app.stage as never,
      { Graphics } as never,
      {
        relations: [relation({ id: 10, fromId: 1, toId: 2 })],
        nodes,
        visibleNodeIds: new Set([1]),
        highlightNodeIds: new Set(),
        selectedRelationId: null,
        onRelationPointerDown: jest.fn(),
      },
    );

    expect(Graphics).not.toHaveBeenCalled();
    expect(harness.stage.addChild).not.toHaveBeenCalled();
  });

  it("有向なら矢印 fill を描く", () => {
    const harness = createPixiTestHarness();
    const Graphics = jest.fn().mockImplementation(() => ({
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: 1,
      eventMode: "none",
      cursor: "default",
    }));

    renderMapRelations(
      harness.app.stage as never,
      { Graphics } as never,
      {
        relations: [relation({ id: 10, fromId: 1, toId: 2, kind: "conflict", directed: true })],
        nodes,
        visibleNodeIds: new Set([1, 2]),
        highlightNodeIds: new Set(),
        selectedRelationId: null,
        onRelationPointerDown: jest.fn(),
      },
    );

    const g = Graphics.mock.results[0]!.value;
    expect(g.fill).toHaveBeenCalledWith({ color: 0xdc2626 });
  });

  it("線分はノード外周で止まり、矢印 tip は対象ノード中心ではなく外周側にある", () => {
    // nodes[0]: (0,0)-(100,60) center(50,30); nodes[1]: (200,0)-(300,60) center(250,30)
    const harness = createPixiTestHarness();
    const Graphics = jest.fn().mockImplementation(() => ({
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      alpha: 1,
      eventMode: "none",
      cursor: "default",
    }));

    renderMapRelations(
      harness.app.stage as never,
      { Graphics } as never,
      {
        relations: [relation({ id: 10, fromId: 1, toId: 2, kind: "dependency", directed: true })],
        nodes,
        visibleNodeIds: new Set([1, 2]),
        highlightNodeIds: new Set(),
        selectedRelationId: null,
        onRelationPointerDown: jest.fn(),
      },
    );

    const g = Graphics.mock.results[0]!.value;
    // 可視ストロークは外周→外周（100,30）→（200,30）。中心同士（50,30）→（250,30）ではない
    expect(g.moveTo).toHaveBeenCalledWith(100, 30);
    expect(g.lineTo).toHaveBeenCalledWith(200, 30);
    expect(g.moveTo).not.toHaveBeenCalledWith(50, 30);
    expect(g.lineTo).not.toHaveBeenCalledWith(250, 30);
    // 矢印 tip は対象外周 (200,30)
    expect(g.moveTo).toHaveBeenCalledWith(200, 30);
  });
});
