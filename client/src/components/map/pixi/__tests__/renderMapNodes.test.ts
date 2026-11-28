import { LEARN_LABEL_PLACEHOLDER } from "@/domain/map/mapLearnMode";
import {
  COMMENT_BADGE_RADIUS,
  EMPTY_COMMENT_NODE_COUNTS,
  formatCommentBadgeText,
  renderMapNodes,
} from "@/components/map/pixi/renderMapNodes";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import {
  ILLUSTRATION_AREA_HEIGHT,
  ILLUSTRATED_NODE_HEIGHT,
  RECT_HEIGHT,
} from "@/config/shapes";
import {
  NODE_LABEL_HORIZONTAL_PADDING,
  NODE_LABEL_VERTICAL_PADDING,
  ellipsizeWrappedLabel,
  fitNodeHeightToLabel,
  measureWrappedLabelBodyHeight,
  nodeLabelContentHeightBudget,
} from "@/domain/nodes/nodeLabelLayout";
import type { Texture } from "pixi.js";

/** 本文上限を超えて省略が必要な長さ（nodeLabelLayout 契約と同じ） */
const OVERFLOW_LABEL =
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん".repeat(
    8,
  );

const emptyTaskProgress = new Map<number, { percent: number; remaining: number }>();
const inactiveLearnDisplay = { learningActive: false, revealedNodeIds: new Set<number>() };

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
    commentNodeCounts: new Map(),
    nodes: [node],
    learnDisplay: inactiveLearnDisplay,
    taskProgress: emptyTaskProgress,
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
  it("学習中の未開示だけプレースホルダを描き、実ラベル幅を維持する", () => {
    const labeled = createTestNode({ id: 1, label: "とても長いラベル" });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      nodes: [labeled],
      learnDisplay: { learningActive: true, revealedNodeIds: new Set<number>() },
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
    });
    const calls = harness.Text.mock.calls as Array<[{ text: string }]>;
    const measureText = ellipsizeWrappedLabel({
      text: "とても長いラベル",
      fontSize: 14,
      contentWidth: labeled.width - NODE_LABEL_HORIZONTAL_PADDING,
      maxContentHeight: nodeLabelContentHeightBudget(labeled),
    }).text;
    expect(calls.some(([arg]) => arg.text === LEARN_LABEL_PLACEHOLDER)).toBe(true);
    expect(calls.some(([arg]) => arg.text === measureText)).toBe(true);
    const placeholder = harness.Text.mock.results[calls.findIndex(([arg]) => arg.text === LEARN_LABEL_PLACEHOLDER)].value as { width: number };
    const real = harness.Text.mock.results[calls.findIndex(([arg]) => arg.text === measureText)].value as { width: number };
    expect(placeholder.width).toBe(real.width);
  });

  it("学習モード外は revealed があっても実ラベル", () => {
    const labeled = createTestNode({ id: 1, label: "秘密" });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      nodes: [labeled],
      learnDisplay: { learningActive: false, revealedNodeIds: new Set([1]) },
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
    });
    const calls = harness.Text.mock.calls as Array<[{ text: string }]>;
    expect(calls.every(([arg]) => arg.text !== LEARN_LABEL_PLACEHOLDER)).toBe(true);
    expect(calls.some(([arg]) => arg.text === "秘密")).toBe(true);
  });

  it("編集中は対象親の進捗だけを隠し、終了時に戻す", () => {
    const draw = (editingNodeId: number | null) => {
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        commentNodeCounts: new Map(),
        nodes: [node, createTestNode({ id: 2, x: 200 })],
        learnDisplay: inactiveLearnDisplay,
        taskProgress: new Map([[1, { percent: 33, remaining: 2 }], [2, { percent: 100, remaining: 0 }]]),
        selectedNodeIds: [], editingNodeId, connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null, onNodePointerDown: jest.fn(),
        highlightNodeIds: new Set(), pinnedNodeIds: new Set(),
      });
      return harness.Text.mock.calls.map(([options]) => options.text);
    };
    expect(draw(null)).toContain("33% 残2");
    expect(draw(1)).not.toContain("33% 残2");
    expect(draw(1)).toContain("100% 残0");
    expect(draw(null)).toContain("33% 残2");
  });

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
      style: {
        fontSize: 14,
        fontWeight: "normal",
        fill: 0x27272a,
        wordWrap: false,
        align: "center",
      },
    });
    expect(text.anchor.set).toHaveBeenCalledWith(0.5);
    expect(text).toMatchObject({ x: 100, y: 60 });
    expect(container.addChild.mock.calls.map(([child]: [unknown]) => child))
      .toEqual([rectangle, text]);
  });

  it("labelFontSize / Bold を Text に反映し、Underline は Graphics 水平線をラベル直下に描く", () => {
    const styled = createTestNode({
      id: 1,
      parentId: null,
      x: 50,
      y: 30,
      width: 100,
      height: 60,
      label: "装飾",
      labelFontSize: 18,
      labelBold: true,
      labelUnderline: true,
    });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      nodes: [styled],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1"]),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
    });

    expect(harness.Text).toHaveBeenCalledWith({
      text: "装飾",
      style: {
        fontSize: 18,
        fontWeight: "bold",
        fill: 0x27272a,
        wordWrap: false,
        align: "center",
      },
    });

    const text = harness.Text.mock.results[0].value as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const underline = harness.Graphics.mock.results[1].value;
    const container = harness.stage.addChild.mock.calls[0][0] as { addChild: jest.Mock };
    expect(container.addChild.mock.calls.map(([child]: [unknown]) => child))
      .toEqual([harness.Graphics.mock.results[0].value, text, underline]);
    expect(underline.moveTo).toHaveBeenCalledWith(
      text.x - text.width / 2,
      text.y + text.height / 2 + 1,
    );
    expect(underline.lineTo).toHaveBeenCalledWith(
      text.x + text.width / 2,
      text.y + text.height / 2 + 1,
    );
    expect(underline.stroke).toHaveBeenCalledWith({ width: 1, color: 0x27272a });
  });

  it("空ラベルのフォールバックにも fontSize / Bold / Underline を適用する", () => {
    // fontSize 24 では既定高さでは折り返し省略されるため、確定 fit 後の高さを使う
    const emptyStyled = fitNodeHeightToLabel(
      createTestNode({
        id: 1,
        parentId: null,
        x: 50,
        y: 30,
        width: 100,
        height: 60,
        label: "",
        labelFontSize: 24,
        labelBold: true,
        labelUnderline: true,
      }),
      "commit",
    );
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      nodes: [emptyStyled],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1"]),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
    });

    const expectedText = ellipsizeWrappedLabel({
      text: "",
      fontSize: 24,
      contentWidth: emptyStyled.width - NODE_LABEL_HORIZONTAL_PADDING,
      maxContentHeight: nodeLabelContentHeightBudget(emptyStyled),
    }).text;
    expect(harness.Text).toHaveBeenCalledWith({
      text: expectedText,
      style: expect.objectContaining({
        fontSize: 24,
        fontWeight: "bold",
        wordWrap: false,
      }),
    });
    expect(harness.Graphics).toHaveBeenCalledTimes(2);
  });

  it("上限超過ラベルは都度 ellipsize し、Node に表示文字列を保存せず矩形内に収める", () => {
    const fitted = fitNodeHeightToLabel(
      createTestNode({
        id: 1,
        x: 50,
        y: 30,
        width: 100,
        height: RECT_HEIGHT,
        label: OVERFLOW_LABEL,
      }),
      "commit",
    );
    expect(fitted.height).toBe(RECT_HEIGHT * 4);
    expect(fitted.label).toBe(OVERFLOW_LABEL);

    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      commentNodeCounts: EMPTY_COMMENT_NODE_COUNTS,
      nodes: [fitted],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1"]),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
    });

    const contentWidth = fitted.width - NODE_LABEL_HORIZONTAL_PADDING;
    const maxContentHeight =
      fitted.height - NODE_LABEL_VERTICAL_PADDING;
    const expectedDisplay = ellipsizeWrappedLabel({
      text: OVERFLOW_LABEL,
      fontSize: 14,
      contentWidth,
      maxContentHeight,
    });
    expect(expectedDisplay.truncated).toBe(true);
    expect(expectedDisplay.text.endsWith("…")).toBe(true);
    expect(expectedDisplay.text).not.toBe(OVERFLOW_LABEL);

    const labelCall = (harness.Text.mock.calls as Array<[{ text: string }]>).find(
      ([arg]) => typeof arg.text === "string" && arg.text.includes("…"),
    );
    expect(labelCall).toBeDefined();
    expect(labelCall![0].text).toBe(expectedDisplay.text);
    expect(labelCall![0]).toEqual(
      expect.objectContaining({
        style: expect.objectContaining({ wordWrap: false }),
      }),
    );
    // 永続フィールドを読まない: Node.label は全文のまま
    expect(fitted.label).toBe(OVERFLOW_LABEL);
    expect(
      (fitted as Node & { displayLabel?: string }).displayLabel,
    ).toBeUndefined();

    expect(
      measureWrappedLabelBodyHeight({
        text: labelCall![0].text,
        fontSize: 14,
        contentWidth,
      }),
    ).toBeLessThanOrEqual(maxContentHeight);
  });

  it("短いラベルも domain wrap 結果を描き常に wordWrap:false", () => {
    const short = createTestNode({
      id: 1,
      x: 50,
      y: 30,
      width: 100,
      height: RECT_HEIGHT,
      label: "短い",
    });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      commentNodeCounts: EMPTY_COMMENT_NODE_COUNTS,
      nodes: [short],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1"]),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
    });
    expect(harness.Text).toHaveBeenCalledWith({
      text: "短い",
      style: expect.objectContaining({ wordWrap: false }),
    });
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
      commentNodeCounts: new Map(),
      nodes: [node, second, third],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: emptyTaskProgress,
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

  it("ノード Container に pointerType 対応の hitArea を設定する", () => {
    const { stage } = render();
    const container = stage.addChild.mock.calls[0][0] as { hitArea: { contains: (x: number, y: number) => boolean } };
    expect(container.hitArea.contains(50, 30)).toBe(true);
    expect(container.hitArea.contains(49, 30)).toBe(false);
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
      commentNodeCounts: new Map(),
      nodes: [node, second],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: emptyTaskProgress,
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
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes: [node], taskProgress: emptyTaskProgress, selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
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
        commentNodeCounts: new Map(),
        learnDisplay: inactiveLearnDisplay,
        nodes: [illustratedNode], taskProgress: emptyTaskProgress, selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
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
        commentNodeCounts: new Map(),
        learnDisplay: inactiveLearnDisplay,
        nodes: [firstNode, draggedNode], taskProgress: emptyTaskProgress, selectedNodeIds: [2], editingNodeId: null,
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
        commentNodeCounts: new Map(),
        learnDisplay: inactiveLearnDisplay,
        nodes: [node, linkedNode], taskProgress: emptyTaskProgress, selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
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
        commentNodeCounts: new Map(),
        learnDisplay: inactiveLearnDisplay,
        nodes: [linkedNode], taskProgress: emptyTaskProgress, selectedNodeIds: [2], editingNodeId: 2, connectionTargetNodeId: null,
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
        commentNodeCounts: new Map(),
        nodes: [node, locked],
        learnDisplay: inactiveLearnDisplay,
        taskProgress: emptyTaskProgress,
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
        commentNodeCounts: new Map(),
        nodes: [node, pinned],
        learnDisplay: inactiveLearnDisplay,
        taskProgress: emptyTaskProgress,
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

  describe("icon / kind", () => {
    it("kind があるとき左端 4px の色バーを描き、glow（filter 等）は付けない", () => {
      const withKind = createTestNode({
        id: 1, parentId: null, x: 50, y: 30, width: 100, height: 60, label: "疑問", kind: "question",
      });
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        commentNodeCounts: new Map(),
        nodes: [withKind],
        learnDisplay: inactiveLearnDisplay,
        taskProgress: emptyTaskProgress,
        selectedNodeIds: [],
        editingNodeId: null,
        connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null,
        onNodePointerDown: jest.fn(),
        visibleKeys: new Set(["node:1"]),
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set<number>(),
      });

      const bar = harness.Graphics.mock.results[1].value;
      expect(bar.rect).toHaveBeenCalledWith(50, 30, 4, 60);
      expect(bar.fill).toHaveBeenCalledWith({ color: 0x3b82f6 });
      expect(bar.stroke).not.toHaveBeenCalled();
      expect(bar).not.toHaveProperty("filters");
    });

    it("icon を約 16px でラベル左に描く", () => {
      const withIcon = createTestNode({
        id: 1, parentId: null, x: 50, y: 30, width: 100, height: 60, label: "目標", icon: "🎯",
      });
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        commentNodeCounts: new Map(),
        nodes: [withIcon],
        learnDisplay: inactiveLearnDisplay,
        taskProgress: emptyTaskProgress,
        selectedNodeIds: [],
        editingNodeId: null,
        connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null,
        onNodePointerDown: jest.fn(),
        visibleKeys: new Set(["node:1"]),
        highlightNodeIds: new Set<number>(),
        pinnedNodeIds: new Set<number>(),
      });

      expect(harness.Text).toHaveBeenCalledWith({
        text: "🎯",
        style: expect.objectContaining({ fontSize: 16 }),
      });
      const label = harness.Text.mock.results[0].value as {
        x: number; y: number; width: number;
      };
      const icon = harness.Text.mock.results[1].value as {
        x: number; y: number; anchor: { set: jest.Mock };
      };
      // ラベル Text が先、icon はラベル左（中央基準）
      expect(harness.Text.mock.calls[0][0]).toMatchObject({ text: "目標" });
      expect(icon.anchor.set).toHaveBeenCalledWith(0.5);
      expect(icon.x).toBe(label.x - label.width / 2 - 4 - 8);
      expect(icon.y).toBe(label.y);
    });

    it("icon も kind も無いときは追加の Text / バーを作らない", () => {
      const { Graphics, Text } = render();
      expect(Graphics).toHaveBeenCalledTimes(1);
      expect(Text).toHaveBeenCalledTimes(1);
    });
  });

  it("イラスト・アイコン・下線・3種の角印と進捗下段が重ならないよう上段を縮小して配置する", () => {
    const IMAGE = "data:image/jpeg;base64,AAAA";
    const decorated = createTestNode({
      id: 1,
      parentId: null,
      x: 20,
      y: 30,
      width: 120,
      height: ILLUSTRATED_NODE_HEIGHT,
      label: "装飾親",
      illustration: IMAGE,
      icon: "🎯",
      labelUnderline: true,
      links: ["https://example.com/"],
      locked: true,
    });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      nodes: [decorated],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: new Map([[1, { percent: 33, remaining: 2 }]]),
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1"]),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set([1]),
      illustrationTextures: new Map([[IMAGE, {} as Texture]]),
    });

    const progressCall = harness.Text.mock.calls.find(([options]) => options.text === "33% 残2");
    expect(progressCall).toBeDefined();
    const badge = harness.Text.mock.results[harness.Text.mock.calls.indexOf(progressCall!)].value as { y: number };
    const bandTop = decorated.y + decorated.height - Math.min(16, (decorated.height - ILLUSTRATION_AREA_HEIGHT) / 3);
    expect(badge.y).toBeGreaterThanOrEqual(bandTop - 2);

    const upper = harness.containers.find((container) => container.scale.set.mock.calls.length > 0);
    expect(upper).toBeDefined();
    const ratio = upper!.scale.set.mock.calls[0][0] as number;
    expect(ratio).toBeLessThanOrEqual(1);

    const labelIndex = harness.Text.mock.calls.findIndex(([options]) => options.text === "装飾親");
    const label = harness.Text.mock.results[labelIndex].value as { y: number; height: number };
    const upperCenterY = upper!.position.set.mock.calls[0][1] as number;
    const scaledBottom = upperCenterY + ratio * (label.y + label.height / 2);
    expect(scaledBottom).toBeLessThan(badge.y);
  });
});

describe("コメント件数バッジ", () => {
  type MockText = { options: { text: string }; x: number; y: number; width: number; height: number; alpha?: number; anchor: { set: jest.Mock } };
  type MockGraphics = { circle: jest.Mock; fill: jest.Mock; alpha?: number };

  function renderWithComments(options: {
    nodes: readonly Node[];
    commentNodeCounts: ReadonlyMap<number, number>;
    taskProgress?: ReadonlyMap<number, { percent: number; remaining: number }>;
    visibleKeys?: ReadonlySet<string>;
    highlightNodeIds?: ReadonlySet<number>;
    illustrationTextures?: ReadonlyMap<string, Texture>;
  }) {
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      nodes: options.nodes,
      learnDisplay: inactiveLearnDisplay,
      taskProgress: options.taskProgress ?? emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: options.visibleKeys ?? new Set(options.nodes.map((n) => `node:${n.id}`)),
      highlightNodeIds: options.highlightNodeIds ?? new Set<number>(),
      pinnedNodeIds: new Set<number>(),
      illustrationTextures: options.illustrationTextures,
      commentNodeCounts: options.commentNodeCounts,
    });
    const texts = harness.Text.mock.results.map((result) => result.value as MockText);
    const graphics = harness.Graphics.mock.results.map((result) => result.value as MockGraphics);
    const commentTexts = (text: string) => texts.filter((t) => t.options.text === text);
    const badgeCircles = graphics.filter((g) => g.circle.mock.calls.some(
      ([, , radius]: [number, number, number]) => radius === COMMENT_BADGE_RADIUS,
    ));
    const containers = harness.stage.addChild.mock.calls.map(
      ([container]: [unknown]) => container as { addChild: jest.Mock },
    );
    const childrenOf = (index: number) => containers[index].addChild.mock.calls.map(([child]: [unknown]) => child);
    return { ...harness, texts, commentTexts, badgeCircles, childrenOf };
  }

  it("formatCommentBadgeText は 1–9 をそのまま、10 以上を 9+ にする", () => {
    expect(formatCommentBadgeText(1)).toBe("1");
    expect(formatCommentBadgeText(9)).toBe("9");
    expect(formatCommentBadgeText(10)).toBe("9+");
    expect(formatCommentBadgeText(123)).toBe("9+");
  });

  it("EMPTY_COMMENT_NODE_COUNTS は空で、渡すとバッジを描かない", () => {
    expect(EMPTY_COMMENT_NODE_COUNTS.size).toBe(0);
    const { badgeCircles, Text } = renderWithComments({
      nodes: [createTestNode({ id: 1 })],
      commentNodeCounts: EMPTY_COMMENT_NODE_COUNTS,
    });
    expect(badgeCircles).toHaveLength(0);
    expect(Text).toHaveBeenCalledTimes(1);
  });

  it("件数があるノードにだけ、左下の角を中心に円と件数の Text を 1 組足す", () => {
    const first = createTestNode({ id: 1, x: 50, y: 30, width: 100, height: 60 });
    const second = createTestNode({ id: 2, x: 200, y: 40, width: 140, height: 60 });
    const { badgeCircles, commentTexts, childrenOf } = renderWithComments({
      nodes: [first, second],
      commentNodeCounts: new Map([[2, 3]]),
    });

    expect(badgeCircles).toHaveLength(1);
    expect(badgeCircles[0].circle).toHaveBeenCalledWith(200, 100, COMMENT_BADGE_RADIUS);
    expect(badgeCircles[0].fill).toHaveBeenCalledWith({ color: 0x2563eb });
    const [count] = commentTexts("3");
    expect(count).toBeDefined();
    expect(count.anchor.set).toHaveBeenCalledWith(0.5);
    expect(count).toMatchObject({ x: 200, y: 100 });
    expect(count.options).toMatchObject({ style: { fontSize: 9, fill: 0xffffff } });
    expect(childrenOf(0)).not.toContain(badgeCircles[0]);
    expect(childrenOf(1)).toEqual(expect.arrayContaining([badgeCircles[0], count]));
  });

  it("0 や負の件数・キー無しのノードには描かない", () => {
    const nodes = [1, 2, 3].map((id) => createTestNode({ id, x: id * 200 }));
    const { badgeCircles, Text } = renderWithComments({
      nodes,
      commentNodeCounts: new Map([[1, 0], [2, -1]]),
    });
    expect(badgeCircles).toHaveLength(0);
    expect(Text).toHaveBeenCalledTimes(3);
  });

  it("10 以上は 9+ と描く", () => {
    const { commentTexts } = renderWithComments({
      nodes: [createTestNode({ id: 1 })],
      commentNodeCounts: new Map([[1, 12]]),
    });
    expect(commentTexts("9+")).toHaveLength(1);
    expect(commentTexts("12")).toHaveLength(0);
  });

  it("表示されていないノードには描かない", () => {
    const { badgeCircles } = renderWithComments({
      nodes: [createTestNode({ id: 1 })],
      commentNodeCounts: new Map([[1, 2]]),
      visibleKeys: new Set<string>(),
    });
    expect(badgeCircles).toHaveLength(0);
  });

  it("円と件数の alpha はノード内容の alpha に揃える", () => {
    const { badgeCircles, commentTexts } = renderWithComments({
      nodes: [createTestNode({ id: 1 }), createTestNode({ id: 2, x: 200 })],
      commentNodeCounts: new Map([[1, 2]]),
      highlightNodeIds: new Set([2]),
    });
    expect(badgeCircles[0].alpha).toBeLessThan(1);
    expect(commentTexts("2")[0].alpha).toBe(badgeCircles[0].alpha);
  });

  it("リンク・ピン・ロックの角印と中心が一致せず、円同士も交差しない", () => {
    const decorated = createTestNode({
      id: 1, x: 50, y: 30, width: 100, height: 60, label: "角印", links: ["https://example.com/"], locked: true,
    });
    const harness = createPixiTestHarness();
    renderMapNodes(harness.app.stage as never, harness.constructors as never, {
      nodes: [decorated],
      learnDisplay: inactiveLearnDisplay,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      onNodePointerDown: jest.fn(),
      visibleKeys: new Set(["node:1"]),
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set([1]),
      commentNodeCounts: new Map([[1, 2]]),
    });
    const circles = harness.Graphics.mock.results
      .map(({ value }) => value as { circle: jest.Mock })
      .flatMap((graphics) => graphics.circle.mock.calls as Array<[number, number, number]>);
    const badge = circles.filter(([, , radius]) => radius === COMMENT_BADGE_RADIUS);
    const cornerMarkers = circles.filter(([, , radius]) => radius !== COMMENT_BADGE_RADIUS);
    expect(badge).toHaveLength(1);
    expect(cornerMarkers).toHaveLength(3);
    const [bx, by, br] = badge[0];
    for (const [mx, my, mr] of cornerMarkers) {
      expect([mx, my]).not.toEqual([bx, by]);
      expect(Math.hypot(bx - mx, by - my)).toBeGreaterThan(br + mr);
    }
  });

  it.each([
    { label: "標準", node: createTestNode({ id: 1, x: 50, y: 30, width: 100, height: 60, label: "親" }) },
    { label: "幅広・高い", node: createTestNode({ id: 1, x: -40, y: 10, width: 260, height: 120, label: "幅の広い親" }) },
    { label: "細い", node: createTestNode({ id: 1, x: 0, y: 0, width: 60, height: 40, label: "細" }) },
    {
      label: "イラストあり",
      node: createTestNode({
        id: 1, x: 20, y: 30, width: 120, height: ILLUSTRATED_NODE_HEIGHT, label: "絵", illustration: "data:image/jpeg;base64,AAAA",
      }),
    },
  ])("進捗バッジと同時に出ても両方あり、互いに重ならない（$label）", ({ node: target }) => {
    const textures = target.illustration === undefined
      ? undefined
      : new Map([[target.illustration, {} as Texture]]);
    const { badgeCircles, commentTexts } = renderWithComments({
      nodes: [target],
      commentNodeCounts: new Map([[1, 4]]),
      taskProgress: new Map([[1, { percent: 50, remaining: 1 }]]),
      illustrationTextures: textures,
    });
    const [progress] = commentTexts("50% 残1");
    expect(progress).toBeDefined();
    expect(badgeCircles).toHaveLength(1);
    expect(commentTexts("4")).toHaveLength(1);

    const [cx, cy, radius] = badgeCircles[0].circle.mock.calls[0] as [number, number, number];
    expect([cx, cy]).toEqual([target.x, target.y + target.height]);
    // 描画は進捗バッジを内側の幅（width - 16）まで縮小する。テスト用 Text には scale が無いので、その上限を幅に反映する
    const progressWidth = Math.min(progress.width, target.width - 16);
    const rect = {
      left: progress.x - progressWidth / 2,
      right: progress.x + progressWidth / 2,
      top: progress.y - progress.height / 2,
      bottom: progress.y + progress.height / 2,
    };
    const nearestX = Math.min(Math.max(cx, rect.left), rect.right);
    const nearestY = Math.min(Math.max(cy, rect.top), rect.bottom);
    expect(Math.hypot(cx - nearestX, cy - nearestY)).toBeGreaterThan(radius);
  });
});
