import { act, renderHook } from "@testing-library/react";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { mergeNodes as computeNodeMerge, planNodeMerge, type MergeNodesResult } from "@/domain/nodes/nodeMerge";
import { planNodeSplit, splitNode as computeNodeSplit, type SplitNodeResult } from "@/domain/nodes/nodeSplit";
import { useNodes } from "@/hooks/useNodes";
import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

jest.mock("@/domain/nodes/nodeAutoLayout", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
    "@/domain/nodes/nodeAutoLayout",
  );
  return {
    ...actual,
    layoutNodeForest: jest.fn(actual.layoutNodeForest),
  };
});

type Hook = ReturnType<typeof useNodes>;

function node(id: number, parentId: number | null, label: string, x: number, y: number, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label, x, y, ...overrides });
}

// 1: 計画（根）、2: 分割できるラベル（重要度 high）、3: 下の兄弟、4: 2 の子
function splitMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      node(1, null, "計画", 0, 0),
      node(2, 1, "りんご、みかん、ぶどう", 220, 0, { importance: "high" }),
      node(3, 1, "下の兄弟", 220, 200),
      node(4, 2, "りんごの子", 440, 0),
    ],
  };
}

// 1: 根、2: りんご（低）、3: リンゴ（高）、4: バナナ、5: 2 の子
function mergeMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      node(1, null, "根", 0, 0),
      node(2, 1, "りんご", 220, 0, { importance: "low" }),
      node(3, 1, "リンゴ", 220, 100, { importance: "high" }),
      node(4, 1, "バナナ", 220, 200),
      node(5, 2, "りんごの子", 440, 0),
    ],
  };
}

const ALL = new Set([1, 2, 3, 4, 5]);

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  jest.mocked(layoutNodeForest).mockClear();
  return view;
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((item) => item.id);
}

function split(
  current: () => Hook,
  nodeId: number,
  separator: string,
  visible: ReadonlySet<number> = ALL,
): SplitNodeResult {
  let outcome!: SplitNodeResult;
  act(() => {
    outcome = current().splitNode(nodeId, separator, visible, planNodeSplit(current().nodes, nodeId, separator, visible));
  });
  return outcome;
}

function merge(
  current: () => Hook,
  selectedIds: readonly number[],
  primaryId: number | null,
  joiner = " ",
  visible: ReadonlySet<number> = ALL,
): MergeNodesResult {
  let outcome!: MergeNodesResult;
  act(() => {
    outcome = current().mergeNodes(
      selectedIds,
      primaryId,
      joiner,
      visible,
      planNodeMerge(current().nodes, selectedIds, primaryId, joiner, visible),
    );
  });
  return outcome;
}

afterEach(() => {
  jest.mocked(layoutNodeForest).mockClear();
});

describe("useNodes の splitNode", () => {
  it("手動配置で断片を元のノードの直後の兄弟にし、選択と documentRevision を変えない", () => {
    const { result } = renderNodes(splitMap());
    act(() => result.current.selectNode(3));
    const revision = result.current.documentRevision;

    const outcome = split(() => result.current, 2, "、");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const [first, second] = outcome.insertedIds;
    expect(ids(result.current.nodes)).toEqual([1, 2, first, second, 3, 4]);
    expect(result.current.nodes.map((item) => item.label)).toEqual(["計画", "りんご", "みかん", "ぶどう", "下の兄弟", "りんごの子"]);
    // 同じ親 1 の兄弟（2 と 3）の最も下の下端 260 の下へ、断片の順に積む
    expect(result.current.nodes.find((item) => item.id === first)).toMatchObject({
      parentId: 1, x: 220, y: 300, importance: "high", width: 100, height: 60,
    });
    expect(result.current.nodes.find((item) => item.id === second)).toMatchObject({ parentId: 1, x: 220, y: 400 });
    expect(result.current.selectedNodeId).toBe(3);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("表示されていない兄弟も含めた全体の配列を基準に座標を決める（L-460）", () => {
    const { result } = renderNodes(splitMap());

    // 最も下の兄弟 3（下端 260）と 2 の子 4 を、表示されていないことにする
    const outcome = split(() => result.current, 2, "、", new Set([1, 2]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const [first, second] = outcome.insertedIds;
    expect(result.current.nodes.find((item) => item.id === first)).toMatchObject({ y: 300 });
    expect(result.current.nodes.find((item) => item.id === second)).toMatchObject({ y: 400 });
  });

  it("1 回の Undo で戻り、Redo で分割後に戻る", () => {
    const { result } = renderNodes(splitMap());
    split(() => result.current, 2, "、");
    const splitNodes = result.current.nodes;

    let undone = false;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.nodes).toEqual(splitMap().nodes);
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(result.current.nodes).toEqual(splitNodes);
  });

  it("自動配置では全体を再レイアウトする", () => {
    const { result } = renderNodes(splitMap("auto"));
    const before = result.current.nodes;

    const outcome = split(() => result.current, 2, "、");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const candidate = computeNodeSplit(before, 2, "、", outcome.insertedIds, ALL);
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    expect(result.current.nodes).toEqual(layoutNodeForest(candidate.nodes));
  });

  describe("失敗では何も変えず、履歴も積まない", () => {
    it.each<[string, NodeMapState, number, string, ReadonlySet<number>, SplitNodeResult]>([
      ["対象が無い", splitMap(), 99, "、", ALL, { ok: false, reason: "node-missing" }],
      ["対象が表示されていない", splitMap(), 2, "、", new Set([1, 3, 4]), { ok: false, reason: "node-hidden" }],
      ["区切り文字が空", splitMap(), 2, "", ALL, { ok: false, reason: "separator-empty" }],
      ["2 つ以上に分けられない", splitMap(), 3, "、", ALL, { ok: false, reason: "not-splittable" }],
      [
        "構造が不正",
        { layoutMode: "manual", nodes: [node(1, 99, "a、b", 0, 0)] },
        1,
        "、",
        new Set([1]),
        { ok: false, reason: "invalid-structure" },
      ],
    ])("%s", (_name, map, nodeId, separator, visible, expected) => {
      const { result } = renderNodes(map);
      act(() => result.current.selectNode(1));
      const before = result.current;

      // 計画が失敗するときの expected は、失敗の計画をそのまま渡す（フックは再計画の失敗を返す）
      let outcome!: SplitNodeResult;
      act(() => {
        outcome = result.current.splitNode(nodeId, separator, visible, planNodeSplit(before.nodes, nodeId, separator, visible));
      });

      expect(outcome).toEqual(expected);
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.selectedNodeId).toBe(1);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.documentRevision).toBe(before.documentRevision);
    });

    it("確認の時点の計画と最新の計画が違えば plan-changed（対象のラベルが確認の後に変わった場合）", () => {
      const { result } = renderNodes(splitMap());
      const shown = planNodeSplit(result.current.nodes, 2, "、", ALL);
      act(() => result.current.updateNodeLabel(2, "りんご、みかん"));
      const before = result.current;

      let outcome!: SplitNodeResult;
      act(() => { outcome = result.current.splitNode(2, "、", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("確認の時点の計画が失敗した計画なら plan-changed", () => {
      const { result } = renderNodes(splitMap());
      const before = result.current;

      let outcome!: SplitNodeResult;
      act(() => {
        outcome = result.current.splitNode(2, "、", ALL, { ok: false, reason: "not-splittable" });
      });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("自動配置の失敗は placement-failed", () => {
      const { result } = renderNodes(splitMap("auto"));
      const before = result.current;
      jest.mocked(layoutNodeForest).mockImplementationOnce(() => null);

      const outcome = split(() => result.current, 2, "、");

      expect(outcome).toEqual({ ok: false, reason: "placement-failed" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(before.canUndo);
    });
  });

  describe("採番", () => {
    let dateNow: jest.SpyInstance<number, []>;

    beforeEach(() => {
      // 採番は Date.now を基準にした単調増加。固定すると、何回目の採番かが ID から分かる
      dateNow = jest.spyOn(Date, "now").mockReturnValue(5000);
    });

    afterEach(() => {
      dateNow.mockRestore();
    });

    it("計画の失敗では採番が進まない", () => {
      const { result } = renderNodes(splitMap());

      expect(split(() => result.current, 2, "")).toEqual({ ok: false, reason: "separator-empty" });
      expect(split(() => result.current, 3, "、")).toEqual({ ok: false, reason: "not-splittable" });
      const outcome = split(() => result.current, 2, "、");

      expect(outcome).toEqual({ ok: true, insertedIds: [5000, 5001] });
    });

    it("計画が通った後の自動配置の失敗では採番だけが進み、欠番が出る", () => {
      const { result } = renderNodes(splitMap("auto"));
      jest.mocked(layoutNodeForest).mockImplementationOnce(() => null);

      expect(split(() => result.current, 2, "、")).toEqual({ ok: false, reason: "placement-failed" });
      const outcome = split(() => result.current, 2, "、");

      expect(outcome).toEqual({ ok: true, insertedIds: [5002, 5003] });
    });

    it("Undo で消えたノードの ID も、続けて分割するときに再利用しない", () => {
      const { result } = renderNodes(splitMap());
      expect(split(() => result.current, 2, "、")).toEqual({ ok: true, insertedIds: [5000, 5001] });
      act(() => { result.current.undo(); });

      expect(split(() => result.current, 2, "、")).toEqual({ ok: true, insertedIds: [5002, 5003] });
    });
  });
});

describe("useNodes の mergeNodes", () => {
  it("手動配置で主選択を残し、子を付け替え、選択を残したノードだけにする（統合の対象外で選択に残っていたノードも外す）。documentRevision は変えない", () => {
    const { result } = renderNodes(mergeMap());
    // 2・3・4 を選択している。統合の対象は 2・3 だけで、4 は統合の対象外のまま選択に残っている
    act(() => {
      result.current.selectNode(2);
      result.current.toggleNodeSelection(3);
      result.current.toggleNodeSelection(4);
    });
    expect(result.current.selectedNodeIds).toEqual([2, 3, 4]);
    expect(result.current.selectedNodeId).toBe(4);
    const revision = result.current.documentRevision;

    const outcome = merge(() => result.current, [2, 3], 3);

    expect(outcome).toEqual({ ok: true, survivorId: 3, absorbedCount: 1 });
    expect(ids(result.current.nodes)).toEqual([1, 3, 5, 4]);
    expect(result.current.nodes.find((item) => item.id === 3)).toMatchObject({
      label: "りんご リンゴ", importance: "high", x: 220, y: 100,
    });
    expect(result.current.nodes.find((item) => item.id === 5)).toMatchObject({ parentId: 3, x: 440, y: 0 });
    expect(result.current.selectedNodeId).toBe(3);
    expect(result.current.selectedNodeIds).toEqual([3]);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("表示されていない子も付け替える（L-460）", () => {
    const { result } = renderNodes(mergeMap());

    // 2 の子 5 を、表示されていないことにする
    const outcome = merge(() => result.current, [2, 3], 3, " ", new Set([1, 2, 3, 4]));

    expect(outcome).toEqual({ ok: true, survivorId: 3, absorbedCount: 1 });
    expect(ids(result.current.nodes)).toEqual([1, 3, 5, 4]);
    expect(result.current.nodes.find((item) => item.id === 5)).toMatchObject({ parentId: 3 });
  });

  it("1 回の Undo で戻り（選択は既存どおり解除される）、Redo で統合後に戻る", () => {
    const { result } = renderNodes(mergeMap());
    merge(() => result.current, [2, 3], 3);
    const mergedNodes = result.current.nodes;

    let undone = false;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.nodes).toEqual(mergeMap().nodes);
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(result.current.nodes).toEqual(mergedNodes);
  });

  it("主選択と吸収されるノードの両方がイラストを持つ統合も、Undo で吸収されたノードのイラストと高さごと元に戻る", () => {
    const illustrationA = createJpegDataUrl(100, 100);
    const illustrationB = createJpegDataUrl(120, 120);
    const initial = mergeMap();
    const illustrated: NodeMapState = {
      ...initial,
      nodes: initial.nodes.map((item) => {
        if (item.id === 2) return { ...item, illustration: illustrationA, height: ILLUSTRATED_NODE_HEIGHT };
        if (item.id === 3) return { ...item, illustration: illustrationB, height: ILLUSTRATED_NODE_HEIGHT };
        return item;
      }),
    };
    const { result } = renderNodes(illustrated);

    merge(() => result.current, [2, 3], 3);
    expect(result.current.nodes.find((item) => item.id === 2)).toBeUndefined();
    expect(result.current.nodes.find((item) => item.id === 3)).toMatchObject({ illustration: illustrationB });

    act(() => { result.current.undo(); });

    expect(result.current.nodes).toEqual(illustrated.nodes);
    expect(result.current.nodes.find((item) => item.id === 2)).toMatchObject({
      illustration: illustrationA,
      height: ILLUSTRATED_NODE_HEIGHT,
    });
  });

  it("自動配置では、先頭のルートの座標の引き継ぎの後に全体を再レイアウトする", () => {
    const { result } = renderNodes({
      layoutMode: "auto",
      nodes: [node(1, null, "根 A", 30, 40), node(2, null, "根 B", 300, 400), node(3, 2, "B の子", 500, 500)],
    });
    const before = result.current.nodes;
    const visible = new Set([1, 2, 3]);

    const outcome = merge(() => result.current, [1, 2], 2, " ", visible);

    expect(outcome.ok).toBe(true);
    const candidate = computeNodeMerge(before, [1, 2], 2, " ", visible, "auto");
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    expect(result.current.nodes).toEqual(layoutNodeForest(candidate.nodes));
    expect(result.current.nodes[0]).toMatchObject({ id: 2, x: 30, y: 40 });
  });

  describe("失敗では何も変えず、選択も履歴も変えない", () => {
    it.each<[string, readonly number[], number | null, ReadonlySet<number>, MergeNodesResult]>([
      ["選択が 1 件", [2], 2, ALL, { ok: false, reason: "too-few-nodes" }],
      ["対象が無い", [2, 99], 2, ALL, { ok: false, reason: "node-missing" }],
      ["対象が表示されていない", [2, 3], 3, new Set([1, 2, 4, 5]), { ok: false, reason: "node-hidden" }],
      ["主選択が選択に含まれない", [2, 3], 4, ALL, { ok: false, reason: "primary-missing" }],
      ["主選択が無い", [2, 3], null, ALL, { ok: false, reason: "primary-missing" }],
      ["親が違う", [2, 5], 2, ALL, { ok: false, reason: "different-parents" }],
    ])("%s", (_name, selectedIds, primaryId, visible, expected) => {
      const { result } = renderNodes(mergeMap());
      act(() => result.current.selectNode(4));
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => {
        outcome = result.current.mergeNodes(
          selectedIds,
          primaryId,
          " ",
          visible,
          planNodeMerge(before.nodes, selectedIds, primaryId, " ", visible),
        );
      });

      expect(outcome).toEqual(expected);
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.selectedNodeId).toBe(4);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.documentRevision).toBe(before.documentRevision);
    });

    it("確認の時点の計画と最新の計画が違えば plan-changed（確認の後にラベルが変わった場合）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => result.current.updateNodeLabel(2, "ミカン"));
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("確認の後に吸収側へイラストが付いて失われる件数が増えたときも plan-changed（イラストが警告なしに失われない）", () => {
      const illustration = createJpegDataUrl(100, 100);
      const { result } = renderNodes(mergeMap());
      // 主選択 3 だけがイラストを持つ状態でプレビューを作る（失われる件数は 0）
      act(() => { result.current.attachIllustration(3, illustration); });
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      expect(shown).toMatchObject({ ok: true, discardedIllustrationCount: 0 });
      act(() => { result.current.attachIllustration(2, illustration); });
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(before.canUndo);
      expect(result.current.documentRevision).toBe(before.documentRevision);
    });

    it("区切り文字だけが確認の時点と違うときも plan-changed（ラベルが違う）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, "・", ALL);
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("自動配置の失敗は placement-failed で、選択も変えない", () => {
      const { result } = renderNodes(mergeMap("auto"));
      act(() => result.current.selectNode(4));
      const before = result.current;
      jest.mocked(layoutNodeForest).mockImplementationOnce(() => null);

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "placement-failed" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.selectedNodeId).toBe(4);
      expect(result.current.canUndo).toBe(before.canUndo);
    });

    it("連結したメモが上限を超えるときは note-too-long で、何も変えない", () => {
      const long: NodeMapState = {
        layoutMode: "manual",
        nodes: mergeMap().nodes.map((item) => {
          if (item.id === 2) return { ...item, note: "a".repeat(6000) };
          if (item.id === 3) return { ...item, note: "b".repeat(4000) };
          return item;
        }),
      };
      const { result } = renderNodes(long);
      const before = result.current;

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "note-too-long" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(false);
    });

    it("確認の後にメモが変わったら plan-changed（連結後のメモが警告なしに変わらない）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => { result.current.previewNodeNote(2, "確認の後に書いたメモ"); });
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("重複を除いた URL が上限を超えるときは links-too-many で、何も変えない", () => {
      const urls = (prefix: string, count: number) => (
        Array.from({ length: count }, (_, index) => `https://example.com/${prefix}${index}`)
      );
      const many: NodeMapState = {
        layoutMode: "manual",
        nodes: mergeMap().nodes.map((item) => {
          if (item.id === 2) return { ...item, links: urls("a", 6) };
          if (item.id === 3) return { ...item, links: urls("b", 5) };
          return item;
        }),
      };
      const { result } = renderNodes(many);
      const before = result.current;

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "links-too-many" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(false);
    });

    it("確認の後に URL が増えたら plan-changed（連結後の URL が警告なしに変わらない）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => { result.current.addNodeLink(2, "https://example.com/added"); });
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("同じタグとみなすものを除いたタグが上限を超えるときは tags-too-many で、何も変えない", () => {
      const tagNames = (prefix: string, count: number) => (
        Array.from({ length: count }, (_, index) => `${prefix}${index}`)
      );
      const many: NodeMapState = {
        layoutMode: "manual",
        nodes: mergeMap().nodes.map((item) => {
          if (item.id === 2) return { ...item, tags: tagNames("a", 6) };
          if (item.id === 3) return { ...item, tags: tagNames("b", 5) };
          return item;
        }),
      };
      const { result } = renderNodes(many);
      const before = result.current;

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "tags-too-many" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(false);
    });

    it("確認の後にタグが増えたら plan-changed（連結後のタグが警告なしに変わらない）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => { result.current.addNodeTag(2, "重要"); });
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("同じ出典とみなすものを除いた出典が上限を超えるときは sources-too-many で、何も変えない", () => {
      const sourceItems = (prefix: string, count: number) => (
        Array.from({ length: count }, (_, index) => ({ title: `${prefix}${index}` }))
      );
      const many: NodeMapState = {
        layoutMode: "manual",
        nodes: mergeMap().nodes.map((item) => {
          if (item.id === 2) return { ...item, sources: sourceItems("a", 6) };
          if (item.id === 3) return { ...item, sources: sourceItems("b", 5) };
          return item;
        }),
      };
      const { result } = renderNodes(many);
      const before = result.current;

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "sources-too-many" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(false);
    });

    it("確認の後に出典が増えたら plan-changed（連結後の出典が警告なしに変わらない）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => { result.current.addNodeSource(2, { title: "設計入門" }); });
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });
  });
});
