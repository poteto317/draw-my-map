import { renderMapNodes } from "@/components/map/pixi/renderMapNodes";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

const node: Node = createTestNode({
  id: 1, parentId: null, x: 50, y: 30,
  width: 100, height: 60, label: "",
});

function render(overrides: Partial<{
  selectedNodeId: number | null;
  editingNodeId: number | null;
  connectionTargetNodeId: number | null;
  onNodePointerDown: jest.Mock;
  visibleKeys: ReadonlySet<string>;
}> = {}) {
  const harness = createPixiTestHarness();
  const onNodePointerDown = overrides.onNodePointerDown ?? jest.fn();
  renderMapNodes(harness.app.stage as never, harness.constructors as never, {
    nodes: [node],
    selectedNodeId: overrides.selectedNodeId ?? null,
    editingNodeId: overrides.editingNodeId ?? null,
    connectionTargetNodeId: overrides.connectionTargetNodeId ?? null,
    onNodePointerDown,
    visibleKeys: overrides.visibleKeys ?? new Set(["node:1"]),
  });
  return { ...harness, onNodePointerDown };
}

describe("renderMapNodes", () => {
  it("draws a node rectangle and centered default label", () => {
    const { stage, Graphics, Text } = render();
    const container = stage.addChild.mock.calls[0][0] as { addChild: jest.Mock };
    const rectangle = Graphics.mock.results[0].value;
    const text = Text.mock.results[0].value;

    expect(rectangle.rect).toHaveBeenCalledWith(50, 30, 100, 60);
    expect(rectangle.fill).toHaveBeenCalledWith({ color: 0xffffff });
    expect(rectangle.stroke).toHaveBeenCalledWith({ width: 2, color: 0x3b82f6 });
    expect(Text).toHaveBeenCalledWith({
      text: "新しいノード",
      style: { fontSize: 14, fill: 0x27272a, wordWrap: true, wordWrapWidth: 84, align: "center" },
    });
    expect(text.anchor.set).toHaveBeenCalledWith(0.5);
    expect(text).toMatchObject({ x: 100, y: 60 });
    expect(container.addChild.mock.calls.map(([child]: [unknown]) => child))
      .toEqual([rectangle, text]);
  });

  it("uses selected styling and omits text while editing", () => {
    const { Graphics, Text } = render({ selectedNodeId: 1, editingNodeId: 1 });
    const rectangle = Graphics.mock.results[0].value;

    expect(rectangle.fill).toHaveBeenCalledWith({ color: 0xeff6ff });
    expect(rectangle.stroke).toHaveBeenCalledWith({ width: 3, color: 0x2563eb });
    expect(Text).not.toHaveBeenCalled();
  });

  it("接続先候補を選択状態より優先して強調表示する", () => {
    const { Graphics } = render({
      selectedNodeId: 1,
      connectionTargetNodeId: 1,
    });
    const rectangle = Graphics.mock.results[0].value;

    expect(rectangle.fill).toHaveBeenCalledWith({ color: 0xecfdf5 });
    expect(rectangle.stroke).toHaveBeenCalledWith({ width: 3, color: 0x10b981 });
  });

  it("forwards pointer events with the node ID", () => {
    const { containerHandlers, onNodePointerDown } = render();
    const event = { globalX: 100, globalY: 60 };

    containerHandlers[0].pointerdown(event);

    expect(onNodePointerDown).toHaveBeenCalledWith(1, event);
  });

  it("非表示ノードは即時に非描画・非インタラクティブにする", () => {
    const { stage } = render({ visibleKeys: new Set() });
    const container = stage.addChild.mock.calls[0][0] as {
      alpha: number;
      visible: boolean;
      eventMode: string;
      cursor: string;
    };

    expect(container).toMatchObject({
      alpha: 0,
      visible: false,
      eventMode: "none",
      cursor: "default",
    });
  });

  it("node keyのvisibility targetでPixi表示とinteractionを制御する", () => {
    const harness = createPixiTestHarness();
    const targets = renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      nodes: [node], selectedNodeId: null, editingNodeId: null, connectionTargetNodeId: null,
      onNodePointerDown: jest.fn(), visibleKeys: new Set(["node:1"]),
    });
    const container = harness.stage.addChild.mock.calls[0][0] as {
      alpha: number; visible: boolean; eventMode: string; cursor: string;
    };
    const target = targets.get("node:1")!;

    expect(container).toMatchObject({
      alpha: 1,
      visible: true,
      eventMode: "static",
      cursor: "pointer",
    });

    target.setOpacity(0.5);
    target.setRendered(false);
    target.setInteractive(false);

    expect(container).toMatchObject({ alpha: 0.5, visible: false, eventMode: "none" });
  });
});
