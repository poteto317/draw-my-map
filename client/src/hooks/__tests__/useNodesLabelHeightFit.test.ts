import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { fitNodeHeightToLabel } from "@/domain/nodes/nodeLabelLayout";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";
import {
  addChildProposalKey,
  structureInputFingerprintOf,
} from "@/domain/aiAssist/aiStructureProposal";

jest.mock("@/domain/nodes/nodeAutoLayout", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
    "@/domain/nodes/nodeAutoLayout",
  );
  return {
    ...actual,
    layoutNodeForest: jest.fn(actual.layoutNodeForest),
  };
});

/** 折り返しで複数行になる十分な長さ（CJK・空白なし） */
const LONG_WRAPPING_LABEL =
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";

const ILLUSTRATION = "data:image/jpeg;base64,AAAA";

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

function expectedCommitHeight(label: string, extras: Partial<ReturnType<typeof createTestNode>> = {}) {
  return fitNodeHeightToLabel(
    createTestNode({ label, width: RECT_WIDTH, height: RECT_HEIGHT, ...extras }),
    "commit",
  ).height;
}

describe("useNodes ラベル高さ fit（Task1）", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
      "@/domain/nodes/nodeAutoLayout",
    );
    jest.mocked(layoutNodeForest).mockImplementation(actual.layoutNodeForest);
    jest.mocked(layoutNodeForest).mockClear();
  });

  it("1. updateNodeLabel は長文で増高し短文で縮小する", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "短い", width: RECT_WIDTH, height: RECT_HEIGHT })],
    });

    let ok = false;
    act(() => { ok = result.current.updateNodeLabel(1, LONG_WRAPPING_LABEL); });
    expect(ok).toBe(true);
    const tall = result.current.nodes[0]!;
    expect(tall.height).toBeGreaterThan(RECT_HEIGHT);
    expect(tall.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));

    act(() => { ok = result.current.updateNodeLabel(1, "短い"); });
    expect(ok).toBe(true);
    expect(result.current.nodes[0]!.height).toBe(RECT_HEIGHT);
  });

  it("2. updateNodeLabels 一括置換で複数ノードを fit する", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [
        createTestNode({ id: 1, label: "a", width: RECT_WIDTH, height: RECT_HEIGHT }),
        createTestNode({ id: 2, label: "b", width: RECT_WIDTH, height: RECT_HEIGHT }),
        createTestNode({ id: 3, label: "c", width: RECT_WIDTH, height: RECT_HEIGHT }),
      ],
    });

    let ok = false;
    act(() => {
      ok = result.current.updateNodeLabels(
        new Map([[1, LONG_WRAPPING_LABEL], [2, LONG_WRAPPING_LABEL]]),
      );
    });
    expect(ok).toBe(true);
    expect(result.current.nodes[0]!.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));
    expect(result.current.nodes[1]!.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));
    expect(result.current.nodes[2]!.height).toBe(RECT_HEIGHT);
  });

  it("3. setLabelFontSize は fit し、bold/underline は height 不変", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [
        createTestNode({
          id: 1,
          label: LONG_WRAPPING_LABEL,
          width: RECT_WIDTH,
          height: expectedCommitHeight(LONG_WRAPPING_LABEL),
          labelFontSize: 14,
        }),
      ],
    });
    const before = result.current.nodes[0]!.height;

    let ok = false;
    act(() => { ok = result.current.setLabelFontSize(1, 18); });
    expect(ok).toBe(true);
    const afterFont = result.current.nodes[0]!;
    expect(afterFont.labelFontSize).toBe(18);
    expect(afterFont.height).toBe(
      expectedCommitHeight(LONG_WRAPPING_LABEL, { labelFontSize: 18 }),
    );
    expect(afterFont.height).not.toBe(before);

    const heightAfterFont = afterFont.height;
    act(() => { ok = result.current.toggleLabelBold(1); });
    expect(ok).toBe(true);
    expect(result.current.nodes[0]!.height).toBe(heightAfterFont);

    act(() => { ok = result.current.toggleLabelUnderline(1); });
    expect(ok).toBe(true);
    expect(result.current.nodes[0]!.height).toBe(heightAfterFont);
  });

  it("4. auto で layout 失敗なら label/height 不変・false", () => {
    const initial = createTestNode({
      id: 1,
      label: "短い",
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      x: 0,
      y: 0,
    });
    const { result } = renderNodes({ layoutMode: "auto", nodes: [initial] });
    const before = result.current.nodes;

    jest.mocked(layoutNodeForest).mockReturnValueOnce(null);

    let ok = true;
    act(() => { ok = result.current.updateNodeLabel(1, LONG_WRAPPING_LABEL); });

    expect(ok).toBe(false);
    expect(result.current.nodes).toEqual(before);
    expect(result.current.nodes[0]!.label).toBe("短い");
    expect(result.current.nodes[0]!.height).toBe(RECT_HEIGHT);
  });

  it("4b. auto 成功経路は layoutNodeForest を呼び座標が変わり true", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [
        createTestNode({
          id: 1,
          label: "根",
          width: RECT_WIDTH,
          height: RECT_HEIGHT,
          x: 40,
          y: 40,
        }),
        createTestNode({
          id: 2,
          parentId: 1,
          label: "短い",
          width: RECT_WIDTH,
          height: RECT_HEIGHT,
          x: 260,
          y: 40,
        }),
        createTestNode({
          id: 3,
          parentId: 1,
          label: "下の兄弟",
          width: RECT_WIDTH,
          height: RECT_HEIGHT,
          x: 260,
          y: 140,
        }),
      ],
    });
    act(() => result.current.setLayoutMode("auto"));
    const beforeY3 = result.current.nodes.find((node) => node.id === 3)!.y;
    jest.mocked(layoutNodeForest).mockClear();

    let ok = false;
    act(() => { ok = result.current.updateNodeLabel(2, LONG_WRAPPING_LABEL); });

    expect(ok).toBe(true);
    expect(jest.mocked(layoutNodeForest)).toHaveBeenCalled();
    const node2 = result.current.nodes.find((node) => node.id === 2)!;
    const node3 = result.current.nodes.find((node) => node.id === 3)!;
    expect(node2.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));
    expect(node3.y).toBeGreaterThan(beforeY3);
  });

  it("5. 手動時は x,y 不変で下方向のみ伸縮する", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [
        createTestNode({
          id: 1,
          label: "短い",
          width: RECT_WIDTH,
          height: RECT_HEIGHT,
          x: 40,
          y: 80,
        }),
      ],
    });

    act(() => { result.current.updateNodeLabel(1, LONG_WRAPPING_LABEL); });
    const node = result.current.nodes[0]!;
    expect(node.x).toBe(40);
    expect(node.y).toBe(80);
    expect(node.height).toBeGreaterThan(RECT_HEIGHT);
  });

  it("6. 編集 Undo 1 エントリに label+height が載る", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "短い", width: RECT_WIDTH, height: RECT_HEIGHT })],
    });

    act(() => { result.current.updateNodeLabel(1, LONG_WRAPPING_LABEL); });
    expect(result.current.nodes[0]!.height).toBeGreaterThan(RECT_HEIGHT);

    act(() => { result.current.undo(); });
    expect(result.current.nodes[0]!.label).toBe("短い");
    expect(result.current.nodes[0]!.height).toBe(RECT_HEIGHT);
    expect(result.current.canUndo).toBe(false);
  });

  it("7. replaceMap（hydrate）は growOnly で不足のみ増高し履歴を積まない", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "manual",
        nodes: [
          createTestNode({
            id: 1,
            label: LONG_WRAPPING_LABEL,
            width: RECT_WIDTH,
            height: RECT_HEIGHT,
          }),
          createTestNode({
            id: 2,
            label: "短い",
            width: RECT_WIDTH,
            height: 180,
          }),
        ],
      });
    });

    expect(result.current.nodes[0]!.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));
    expect(result.current.nodes[1]!.height).toBe(180);
    expect(result.current.canUndo).toBe(false);
  });

  it("8a. insertForest 生成後に commit fit する", () => {
    jest.spyOn(Date, "now").mockReturnValue(1000);
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "根", width: RECT_WIDTH, height: RECT_HEIGHT })],
    });

    let inserted!: ReturnType<typeof result.current.insertForest>;
    act(() => {
      inserted = result.current.insertForest(
        [{ label: LONG_WRAPPING_LABEL, parentIndex: null }],
        { kind: "root" },
      );
    });
    expect(inserted.ok).toBe(true);
    const created = result.current.nodes.find((node) => node.label === LONG_WRAPPING_LABEL)!;
    expect(created.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));
  });

  it("8b. AI 構造 add-child 生成後に commit fit する", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "根", width: RECT_WIDTH, height: RECT_HEIGHT })],
    });
    const visible = new Set([1]);
    const proposal = {
      key: addChildProposalKey(1, LONG_WRAPPING_LABEL, 0),
      kind: "add-child" as const,
      parentId: 1,
      label: LONG_WRAPPING_LABEL,
      baseline: {
        parentId: 1,
        inputFingerprint: structureInputFingerprintOf(result.current.nodes, 1, "child-candidates")!,
        assistKind: "child-candidates" as const,
      },
    };

    act(() => {
      result.current.applyAiStructureProposals([{ proposal }], visible, "map-test");
    });
    const created = result.current.nodes.find((node) => node.label === LONG_WRAPPING_LABEL)!;
    expect(created.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));
  });

  it("9. collab/remote と同じ replaceMap 経路は growOnly（縮小しない）", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "manual",
        nodes: [
          createTestNode({
            id: 1,
            label: "短い",
            width: RECT_WIDTH,
            height: 200,
          }),
        ],
      });
    });
    expect(result.current.nodes[0]!.height).toBe(200);
  });

  it("attachIllustration / removeIllustration も commit fit する", () => {
    const { result } = renderNodes({
      layoutMode: "manual",
      nodes: [
        createTestNode({
          id: 1,
          label: LONG_WRAPPING_LABEL,
          width: RECT_WIDTH,
          height: expectedCommitHeight(LONG_WRAPPING_LABEL),
        }),
      ],
    });

    act(() => { result.current.attachIllustration(1, ILLUSTRATION); });
    const withIllustration = result.current.nodes[0]!;
    expect(withIllustration.illustration).toBe(ILLUSTRATION);
    expect(withIllustration.height).toBe(
      expectedCommitHeight(LONG_WRAPPING_LABEL, { illustration: ILLUSTRATION }),
    );

    act(() => { result.current.removeIllustration(1); });
    expect("illustration" in result.current.nodes[0]!).toBe(false);
    expect(result.current.nodes[0]!.height).toBe(expectedCommitHeight(LONG_WRAPPING_LABEL));
  });
});

describe("L-467 updater 契約", () => {
  it.each([
    "nodeLabelUpdate.ts",
    "nodeLabelTextStyleUpdate.ts",
    "nodeIllustrationUpdate.ts",
  ])("%s は measure をインラインせず fit* を呼ぶ", (fileName) => {
    const source = readFileSync(
      resolve(__dirname, `../../domain/nodes/${fileName}`),
      "utf8",
    );
    expect(source).not.toMatch(/measureText|getContext\(["']2d["']\)|approximateTextWidth/);
    expect(source).toMatch(/fitNodeHeightToLabel|fitNodesHeightToLabels/);
  });
});
