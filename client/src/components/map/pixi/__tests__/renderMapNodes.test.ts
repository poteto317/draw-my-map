import { renderMapNodes } from "@/components/map/pixi/renderMapNodes";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import type { Texture } from "pixi.js";

const node: Node = createTestNode({
  id: 1, parentId: null, x: 50, y: 30,
  width: 100, height: 60, label: "",
});

function render(overrides: Partial<{
  selectedNodeIds: readonly number[];
  editingNodeId: number | null;
  connectionTargetNodeId: number | null;
  onNodePointerDown: jest.Mock;
  visibleKeys: ReadonlySet<string>;
  highlightNodeIds: ReadonlySet<number>;
  pinnedNodeIds: ReadonlySet<number>;
}> = {}) {
  const harness = createPixiTestHarness();
  const onNodePointerDown = overrides.onNodePointerDown ?? jest.fn();
  renderMapNodes(harness.app.stage as never, harness.constructors as never, {
    nodes: [node],
    selectedNodeIds: overrides.selectedNodeIds ?? [],
    editingNodeId: overrides.editingNodeId ?? null,
    connectionTargetNodeId: overrides.connectionTargetNodeId ?? null,
    siblingReorderSourceNodeId: null,
    onNodePointerDown,
    visibleKeys: overrides.visibleKeys ?? new Set(["node:1"]),
    highlightNodeIds: overrides.highlightNodeIds ?? new Set<number>(),
    pinnedNodeIds: overrides.pinnedNodeIds ?? new Set<number>(),
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


  it("複数 ID を選択スタイルにし、非選択は通常スタイルのままにする", () => {
    const second = createTestNode({
      id: 2, parentId: null, x: 200, y: 30, width: 100, height: 60, label: "二番目",
    });
    const third = createTestNode({
      id: 3, parentId: null, x: 350, y: 30, width: 100, height: 60, label: "三番目",
    });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      nodes: [node, second, third],
      selectedNodeIds: [1, 3],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1", "node:2", "node:3"]),
    });
    const [firstShape, secondShape, thirdShape] = harness.Graphics.mock.results.map(
      (result) => result.value as { fill: jest.Mock; stroke: jest.Mock },
    );

    expect(firstShape.fill).toHaveBeenCalledWith({ color: 0xeff6ff });
    expect(firstShape.stroke).toHaveBeenCalledWith({ width: 3, color: 0x2563eb });
    expect(secondShape.fill).toHaveBeenCalledWith({ color: 0xffffff });
    expect(secondShape.stroke).toHaveBeenCalledWith({ width: 2, color: 0x3b82f6 });
    expect(thirdShape.fill).toHaveBeenCalledWith({ color: 0xeff6ff });
    expect(thirdShape.stroke).toHaveBeenCalledWith({ width: 3, color: 0x2563eb });
  });

  it("uses selected styling and omits text while editing", () => {
    const { Graphics, Text } = render({ selectedNodeIds: [1], editingNodeId: 1 });
    const rectangle = Graphics.mock.results[0].value;

    expect(rectangle.fill).toHaveBeenCalledWith({ color: 0xeff6ff });
    expect(rectangle.stroke).toHaveBeenCalledWith({ width: 3, color: 0x2563eb });
    expect(Text).not.toHaveBeenCalled();
  });

  it("接続先候補を選択状態より優先して強調表示する", () => {
    const { Graphics } = render({
      selectedNodeIds: [1],
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

  it("強調集合が空なら contentAlpha は通常のまま", () => {
    const { stage, Graphics } = render({ highlightNodeIds: new Set<number>() });
    const container = stage.addChild.mock.calls[0][0] as { addChild: jest.Mock; eventMode: string };
    const shape = Graphics.mock.results[0].value as { alpha?: number };

    expect(shape.alpha).toBe(1);
    expect(container.eventMode).toBe("static");
  });

  it("非強調の論理可視ノードは contentAlpha を DIM にし、ヒットテストは維持する", () => {
    const second = createTestNode({
      id: 2, parentId: null, x: 200, y: 30, width: 100, height: 60, label: "他",
    });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      nodes: [node, second],
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1", "node:2"]),
      highlightNodeIds: new Set([1]),
      pinnedNodeIds: new Set<number>(),
    });
    const containers = harness.stage.addChild.mock.calls.map(
      ([container]: [unknown]) => container as { addChild: jest.Mock; eventMode: string },
    );
    const shapeAlpha = (index: number) => (
      containers[index].addChild.mock.calls[0][0] as { alpha: number }
    ).alpha;

    expect(shapeAlpha(0)).toBe(1);
    expect(shapeAlpha(1)).toBe(0.25);
    expect(containers[1].eventMode).toBe("static");
  });

  it("node keyのvisibility targetでPixi表示とinteractionを制御する", () => {
    const harness = createPixiTestHarness();
    const targets = renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      nodes: [node], selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null, onNodePointerDown: jest.fn(), visibleKeys: new Set(["node:1"]),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
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

  describe("イラスト", () => {
    const IMAGE = "data:image/jpeg;base64,AAAA";
    const illustratedNode: Node = createTestNode({
      id: 1, parentId: null, x: 10, y: 20, width: 100,
      height: ILLUSTRATED_NODE_HEIGHT, label: "予算", importance: "medium", illustration: IMAGE,
    });

    function renderIllustrated(illustrationTextures?: ReadonlyMap<string, Texture>) {
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [illustratedNode], selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null, onNodePointerDown: jest.fn(), illustrationTextures,
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set<number>(),
      });
      return harness;
    }

    it("テクスチャがあるとき、ノードの上部の中央にスプライトを置く", () => {
      const texture = {} as Texture;
      const { Sprite, Graphics, Text, stage } = renderIllustrated(new Map([[IMAGE, texture]]));

      expect(Sprite).toHaveBeenCalledWith(texture);
      const sprite = Sprite.mock.results[0].value;
      expect(sprite).toMatchObject({ x: 10 + (100 - 48) / 2, y: 20 + 8, width: 48, height: 48 });
      const container = stage.addChild.mock.calls[0][0] as { addChild: jest.Mock };
      expect(container.addChild.mock.calls.map(([child]: [unknown]) => child))
        .toEqual([Graphics.mock.results[0].value, sprite, Text.mock.results[0].value]);
    });

    it("テクスチャが未読み込みでも、テキストはイラスト用の位置に置く（スプライトは作らない）", () => {
      const { Sprite, Text } = renderIllustrated();

      expect(Sprite).not.toHaveBeenCalled();
      expect(Text.mock.results[0].value.y).toBe(20 + 116 / 2 + 56 / 2);
    });
  });

  describe("並べ替えのドラッグ中のノード", () => {
    const IMAGE = "data:image/jpeg;base64,AAAA";
    const firstNode = createTestNode({
      id: 1, parentId: null, x: 50, y: 30, width: 100, height: 60, label: "先頭",
    });
    const draggedNode = createTestNode({
      id: 2, parentId: null, x: 50, y: 130, width: 100,
      height: ILLUSTRATED_NODE_HEIGHT, label: "ドラッグ中", illustration: IMAGE,
    });

    function renderReorder(siblingReorderSourceNodeId: number | null) {
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [firstNode, draggedNode], selectedNodeIds: [2], editingNodeId: null,
        connectionTargetNodeId: null, siblingReorderSourceNodeId, onNodePointerDown: jest.fn(),
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set<number>(),
        illustrationTextures: new Map([[IMAGE, {} as Texture]]),
      });
      const containers = harness.stage.addChild.mock.calls.map(
        ([container]: [unknown]) => container as { alpha: number; addChild: jest.Mock },
      );
      const childrenOf = (index: number) => containers[index].addChild.mock.calls.map(
        ([child]: [unknown]) => child as { alpha?: number },
      );
      return { ...harness, containers, childrenOf };
    }

    it("ドラッグ中のノードの枠・イラスト・ラベルだけを半透明にし、Containerのalphaは変えない", () => {
      const { containers, childrenOf, Graphics, Sprite, Text } = renderReorder(2);
      const [shape, sprite, label] = childrenOf(1);

      expect([shape, sprite, label]).toEqual([
        Graphics.mock.results[1].value, Sprite.mock.results[0].value, Text.mock.results[1].value,
      ]);
      expect(shape.alpha).toBe(0.5);
      expect(sprite.alpha).toBe(0.5);
      expect(label.alpha).toBe(0.5);
      expect(containers[1].alpha).toBe(1);
      expect(Graphics.mock.results[1].value.stroke).toHaveBeenCalledWith({ width: 3, color: 0x2563eb });
      for (const child of childrenOf(0)) expect(child.alpha ?? 1).toBe(1);
      expect(containers[0].alpha).toBe(1);
    });

    it("nullではどのノードも半透明にしない", () => {
      const { containers, childrenOf } = renderReorder(null);

      for (const index of [0, 1]) {
        expect(containers[index].alpha).toBe(1);
        for (const child of childrenOf(index)) expect(child.alpha ?? 1).toBe(1);
      }
    });
  });

  describe("リンクありの印", () => {
    const linkedNode = createTestNode({
      id: 2, parentId: null, x: 200, y: 30, width: 120, height: 60, label: "資料", links: ["https://example.com/"],
    });

    function renderWithLinks(siblingReorderSourceNodeId: number | null = null) {
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [node, linkedNode], selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
        siblingReorderSourceNodeId, onNodePointerDown: jest.fn(),
        visibleKeys: new Set(["node:1", "node:2"]),
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set<number>(),
      });
      const containers = harness.stage.addChild.mock.calls.map(
        ([container]: [unknown]) => container as { addChild: jest.Mock },
      );
      const childrenOf = (index: number) => containers[index].addChild.mock.calls.map(
        ([child]: [unknown]) => child as { alpha?: number },
      );
      return { ...harness, childrenOf };
    }

    it("URL を持つノードにだけ、右上の角を中心に半径 6 の青い円（白い縁）を最前面に描く", () => {
      const { Graphics, Text, childrenOf } = renderWithLinks();

      // 枠 2 つと印 1 つ
      expect(Graphics).toHaveBeenCalledTimes(3);
      expect(childrenOf(0)).toEqual([Graphics.mock.results[0].value, Text.mock.results[0].value]);
      const marker = Graphics.mock.results[2].value;
      expect(childrenOf(1)).toEqual([Graphics.mock.results[1].value, Text.mock.results[1].value, marker]);
      expect(marker.circle).toHaveBeenCalledWith(320, 30, 6);
      expect(marker.fill).toHaveBeenCalledWith({ color: 0x3b82f6 });
      expect(marker.stroke).toHaveBeenCalledWith({ width: 2, color: 0xffffff });
    });

    it("並べ替えのドラッグ中のノードでは、印も同じく半透明にする", () => {
      const { childrenOf } = renderWithLinks(2);

      expect(childrenOf(1).map((child) => child.alpha)).toEqual([0.5, 0.5, 0.5]);
    });

    it("ラベルの編集中も印は描く（クリックはノードの Container が受ける）", () => {
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [linkedNode], selectedNodeIds: [2], editingNodeId: 2, connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null, onNodePointerDown: jest.fn(), visibleKeys: new Set(["node:2"]),
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set<number>(),
      });

      expect(harness.Graphics).toHaveBeenCalledTimes(2);
      expect(harness.Graphics.mock.results[1].value.circle).toHaveBeenCalledWith(320, 30, 6);
    });
  });

  describe("編集ロックのヒント", () => {
    it("locked ノードは zinc 色の枠と右下の印を描く", () => {
      const locked = createTestNode({
        id: 2,
        parentId: null,
        x: 200,
        y: 40,
        width: 120,
        height: 60,
        label: "ロック",
        locked: true,
      });
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [node, locked],
        selectedNodeIds: [],
        editingNodeId: null,
        connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null,
        onNodePointerDown: jest.fn(),
        visibleKeys: new Set(["node:1", "node:2"]),
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set<number>(),
      });

      const secondShape = harness.Graphics.mock.results[1].value as {
        stroke: jest.Mock;
      };
      expect(secondShape.stroke).toHaveBeenCalledWith({
        width: 2,
        color: 0x71717a,
      });

      const marker = harness.Graphics.mock.results[2].value;
      expect(marker.circle).toHaveBeenCalledWith(320, 100, 6);
      expect(marker.fill).toHaveBeenCalledWith({ color: 0x71717a });
      expect(marker.stroke).toHaveBeenCalledWith({ width: 2, color: 0xffffff });
    });
  });

  describe("ノードピンの印", () => {
    it("ピン済みノードだけ左上に琥珀色の円（白い縁）を描く", () => {
      const pinned = createTestNode({
        id: 2, parentId: null, x: 200, y: 40, width: 120, height: 60, label: "ピン",
      });
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [node, pinned],
        selectedNodeIds: [],
        editingNodeId: null,
        connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null,
        onNodePointerDown: jest.fn(),
        visibleKeys: new Set(["node:1", "node:2"]),
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set([2]),
      });

      // 枠 2 + ピン印 1
      expect(harness.Graphics).toHaveBeenCalledTimes(3);
      const marker = harness.Graphics.mock.results[2].value;
      expect(marker.circle).toHaveBeenCalledWith(200, 40, 6);
      expect(marker.fill).toHaveBeenCalledWith({ color: 0xf59e0b });
      expect(marker.stroke).toHaveBeenCalledWith({ width: 2, color: 0xffffff });
    });
  });
});
