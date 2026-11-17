import {
  MAX_SPLIT_FRAGMENTS,
  canSplitNode,
  isSameNodeSplitPlan,
  planNodeSplit,
  splitLabelFragments,
  splitNode,
  type NodeSplitPlan,
} from "@/domain/nodes/nodeSplit";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentEncoder";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, label: string, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label, x: id * 10, y: id * 20, ...overrides });
}

function visibleOf(nodes: readonly Node[]): Set<number> {
  return new Set(nodes.map((item) => item.id));
}

describe("splitLabelFragments", () => {
  it("区切り文字でラベルを分ける", () => {
    expect(splitLabelFragments("りんご、みかん、ぶどう", "、")).toEqual(["りんご", "みかん", "ぶどう"]);
  });

  it("断片の前後の空白（全角スペース・タブを含む）を削る", () => {
    expect(splitLabelFragments(" a , b\t,　c　", ",")).toEqual(["a", "b", "c"]);
  });

  it("空になった断片を捨てる（区切りが連続・先頭・末尾にあるときと、空白だけの断片）", () => {
    expect(splitLabelFragments("a,,b, ,c", ",")).toEqual(["a", "b", "c"]);
    expect(splitLabelFragments(",,a,,,b,,", ",")).toEqual(["a", "b"]);
    expect(splitLabelFragments("、、", "、")).toEqual([]);
    expect(splitLabelFragments("", "、")).toEqual([]);
  });

  it("区切りが無ければ全体を 1 件で返す", () => {
    expect(splitLabelFragments("りんごみかん", "、")).toEqual(["りんごみかん"]);
  });

  it("複数文字の区切りも、そのままの文字列で分ける", () => {
    expect(splitLabelFragments("a -> b -> c", " -> ")).toEqual(["a", "b", "c"]);
    expect(splitLabelFragments("a - b", " -> ")).toEqual(["a - b"]);
  });

  it("区切りが空文字のときは 1 文字ずつに分けず、ラベル全体を trim した 1 件を返す（空白だけなら 0 件）", () => {
    expect(splitLabelFragments("  abc  ", "")).toEqual(["abc"]);
    expect(splitLabelFragments("a b", "")).toEqual(["a b"]);
    expect(splitLabelFragments("   ", "")).toEqual([]);
    expect(splitLabelFragments("", "")).toEqual([]);
  });

  it("全角・半角を区別し、正規化しない（全角のコンマは半角のコンマの境目にならない）", () => {
    expect(splitLabelFragments("a，b,c", ",")).toEqual(["a，b", "c"]);
    expect(splitLabelFragments("a,b，c", "，")).toEqual(["a,b", "c"]);
    expect(splitLabelFragments("ＡＢ,ab", "ab")).toEqual(["ＡＢ,"]);
  });
});

describe("canSplitNode", () => {
  const nodes = [node(1, null, "a"), node(2, 1, "b")];

  it("対象が存在し、表示されているときだけ真", () => {
    expect(canSplitNode(nodes, 2, new Set([1, 2]))).toBe(true);
    expect(canSplitNode(nodes, 2, new Set([1]))).toBe(false);
    expect(canSplitNode(nodes, 99, new Set([1, 2, 99]))).toBe(false);
    expect(canSplitNode(nodes, null, new Set([1, 2]))).toBe(false);
  });
});

describe("planNodeSplit", () => {
  const nodes = [
    node(1, null, "計画"),
    node(2, 1, "りんご、みかん、ぶどう"),
    node(3, 1, "バナナ"),
  ];

  it("成功すると対象の ID と断片の配列を返し、配列は変えない", () => {
    const frozen = Object.freeze(nodes.map((item) => Object.freeze({ ...item })));

    expect(planNodeSplit(frozen, 2, "、", visibleOf(frozen))).toEqual({
      ok: true,
      nodeId: 2,
      fragments: ["りんご", "みかん", "ぶどう"],
    });
  });

  it("200 件までは分割でき、201 件以上は too-many-fragments", () => {
    const labelOf = (count: number) => Array.from({ length: count }, (_, index) => `項目${index}`).join("、");
    const at = (count: number) => planNodeSplit([node(1, null, labelOf(count))], 1, "、", new Set([1]));

    expect(MAX_SPLIT_FRAGMENTS).toBe(200);
    expect(at(MAX_SPLIT_FRAGMENTS)).toMatchObject({ ok: true });
    expect(at(MAX_SPLIT_FRAGMENTS + 1)).toEqual({ ok: false, reason: "too-many-fragments" });
  });

  describe("各 reason と、検査の順序", () => {
    it("対象が配列に無ければ node-missing（表示されていない集合でも node-hidden より先）", () => {
      expect(planNodeSplit(nodes, 99, "、", new Set())).toEqual({ ok: false, reason: "node-missing" });
    });

    it("対象が表示されていなければ node-hidden（座標の不正・区切り文字の空より先）", () => {
      const broken = [node(1, null, "a、b", { width: 0 })];

      expect(planNodeSplit(broken, 1, "", new Set())).toEqual({ ok: false, reason: "node-hidden" });
    });

    it("座標が有限でない・幅高が 0 以下のノードがあれば placement-failed（構造の不正より先）", () => {
      const broken = [node(1, null, "a、b", { x: Number.NaN }), node(1, null, "重複")];

      expect(planNodeSplit(broken, 1, "", new Set([1]))).toEqual({ ok: false, reason: "placement-failed" });
    });

    it("森として不正（ID の重複・親が無い・循環）なら invalid-structure（区切り文字の空より先）", () => {
      expect(planNodeSplit([node(1, null, "a、b"), node(1, null, "c")], 1, "", new Set([1])))
        .toEqual({ ok: false, reason: "invalid-structure" });
      expect(planNodeSplit([node(1, 9, "a、b")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "invalid-structure" });
      expect(planNodeSplit([node(1, 2, "a、b"), node(2, 1, "c")], 1, "、", new Set([1, 2])))
        .toEqual({ ok: false, reason: "invalid-structure" });
    });

    it("区切り文字が空なら separator-empty（断片が 1 件でもそちらが先）", () => {
      expect(planNodeSplit([node(1, null, "abc")], 1, "", new Set([1])))
        .toEqual({ ok: false, reason: "separator-empty" });
    });

    it("断片が 2 件未満（区切りが無い・断片がすべて空）なら not-splittable", () => {
      expect(planNodeSplit([node(1, null, "abc")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "not-splittable" });
      expect(planNodeSplit([node(1, null, "、、")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "not-splittable" });
      expect(planNodeSplit([node(1, null, "a、")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "not-splittable" });
    });
  });
});

describe("isSameNodeSplitPlan", () => {
  const plan = (nodeId: number, fragments: string[]): NodeSplitPlan => ({ ok: true, nodeId, fragments });

  it("対象と断片の配列が同じときだけ真", () => {
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["a", "b"]))).toBe(true);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["a", "c"]))).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["b", "a"]))).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["a", "b", "c"]))).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(3, ["a", "b"]))).toBe(false);
  });

  it("どちらかが失敗した計画なら、同じ失敗でも偽", () => {
    const failed: NodeSplitPlan = { ok: false, reason: "not-splittable" };

    expect(isSameNodeSplitPlan(failed, failed)).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), failed)).toBe(false);
  });
});

describe("splitNode", () => {
  const illustration = createJpegDataUrl(100, 100);
  // ルートの兄弟（1・2・3）の間で、2 を分割する。2 は子 5 を持ち、重要度 high・イラスト付き（大きさも既定でない）
  const rootNodes = [
    node(1, null, "計画", { x: 0, y: 0 }),
    node(2, null, "りんご、みかん、ぶどう", { x: 50, y: 100, width: 140, height: 108, importance: "high", illustration }),
    node(5, 2, "りんごの子", { x: 250, y: 100 }),
    node(3, null, "バナナ", { x: 0, y: 300 }),
  ];

  function success(nodes: readonly Node[], nodeId: number, newNodeIds: readonly number[], separator = "、") {
    const result = splitNode(nodes, nodeId, separator, newNodeIds, visibleOf(nodes));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    return result;
  }

  it("元のノードは最初の断片を残し、子・座標・大きさ・重要度・イラストを変えない", () => {
    const { nodes } = success(rootNodes, 2, [101, 102]);

    expect(nodes.find((item) => item.id === 2)).toEqual({ ...rootNodes[1], label: "りんご" });
    expect(nodes.find((item) => item.id === 5)).toBe(rootNodes[2]);
  });

  it("2 件目以降の断片は元のノードの直後の兄弟として、断片の順に差し込む", () => {
    const { nodes, insertedIds } = success(rootNodes, 2, [101, 102]);

    expect(nodes.map((item) => item.id)).toEqual([1, 2, 101, 102, 5, 3]);
    expect(insertedIds).toEqual([101, 102]);
    expect(nodes.map((item) => item.label)).toEqual(["計画", "りんご", "みかん", "ぶどう", "りんごの子", "バナナ"]);
  });

  it("新しいノードの座標は兄弟追加と同じ規則で、x は元のノードと同じ・y は直前までの兄弟の最も下の下端の下", () => {
    const { nodes } = success(rootNodes, 2, [101, 102]);

    // ルートの兄弟（1・2・3）の最も下の下端は 3 の 360。1 件目は 360 + 40、2 件目は 1 件目の下端 460 + 40
    expect(nodes.find((item) => item.id === 101)).toMatchObject({ parentId: null, x: 50, y: 400 });
    expect(nodes.find((item) => item.id === 102)).toMatchObject({ parentId: null, x: 50, y: 500 });
  });

  it("新しいノードは重要度が元と同じで、大きさは既定、イラストを持たない", () => {
    const { nodes } = success(rootNodes, 2, [101, 102]);

    for (const id of [101, 102]) {
      const created = nodes.find((item) => item.id === id)!;
      expect(created).toMatchObject({ width: 100, height: 60, importance: "high" });
      expect("illustration" in created).toBe(false);
    }
  });

  it("詳細メモは元のノード（最初の断片）にだけ残し、新しい断片には付けない", () => {
    const withNote = rootNodes.map((item) => (item.id === 2 ? { ...item, note: "分割前のメモ" } : item));

    const { nodes } = success(withNote, 2, [101, 102]);

    expect(nodes.find((item) => item.id === 2)?.note).toBe("分割前のメモ");
    for (const id of [101, 102]) expect("note" in nodes.find((item) => item.id === id)!).toBe(false);
  });

  it("URL は元のノード（最初の断片）にだけ残し、新しい断片には付けない", () => {
    const withLinks = rootNodes.map((item) => (item.id === 2 ? { ...item, links: ["https://example.com/a"] } : item));

    const { nodes } = success(withLinks, 2, [101, 102]);

    expect(nodes.find((item) => item.id === 2)?.links).toEqual(["https://example.com/a"]);
    for (const id of [101, 102]) expect("links" in nodes.find((item) => item.id === id)!).toBe(false);
  });

  it("表示されていない（隠れた）兄弟も含めた全体の配列を基準に座標を決める（L-460）", () => {
    // 最も下の兄弟 3（下端 360）と、2 の子 5 を、表示されていないことにする
    const visible = new Set([1, 2]);

    const result = splitNode(rootNodes, 2, "、", [101, 102], visible);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 見えている兄弟（1 と 2。2 の下端は 208）だけを基準にすると 248 になる。隠れた 3 の下端 360 の下から積む
    expect(result.nodes.find((item) => item.id === 101)).toMatchObject({ y: 400 });
    expect(result.nodes.find((item) => item.id === 102)).toMatchObject({ y: 500 });
    expect(result.nodes.map((item) => item.id)).toEqual([1, 2, 101, 102, 5, 3]);
  });

  it("子ノードの分割では、同じ親の兄弟だけを基準に座標を決める", () => {
    const nodes = [
      node(1, null, "根", { x: 0, y: 0 }),
      node(2, 1, "A、B", { x: 200, y: 0 }),
      node(3, 1, "下の兄弟", { x: 200, y: 200 }),
      node(4, null, "遠くの別の根", { x: 0, y: 900 }),
    ];

    const result = success(nodes, 2, [9]);

    expect(result.nodes.map((item) => item.id)).toEqual([1, 2, 9, 3, 4]);
    expect(result.nodes.find((item) => item.id === 9)).toMatchObject({ parentId: 1, x: 200, y: 300, label: "B" });
  });

  it("ほかのノードは同じオブジェクトのまま、相対順を変えない。元の配列は変えない", () => {
    const frozen = Object.freeze(rootNodes.map((item) => Object.freeze({ ...item })));

    const { nodes } = success(frozen, 2, [101, 102]);

    const others = nodes.filter((item) => ![2, 101, 102].includes(item.id));
    const originalOthers = [frozen[0], frozen[2], frozen[3]];
    expect(others).toHaveLength(originalOthers.length);
    others.forEach((item, index) => expect(item).toBe(originalOthers[index]));
  });

  it("区切り文字で分けた結果は、前後の空白と空の断片を除いたラベルになる", () => {
    const nodes = [node(1, null, " a ,, b ,c ")];

    const { nodes: next } = success(nodes, 1, [11, 12], ",");

    expect(next.map((item) => item.label)).toEqual(["a", "b", "c"]);
  });

  it("結果は保存と読み込みの検証を通る（イラスト付きの元のノードを分割しても）", () => {
    const { nodes } = success(rootNodes, 2, [101, 102]);

    const parsed = parseMapDocumentJson(serializeMapDocument(createMapDocument(nodes, "manual")));

    expect(parsed.ok).toBe(true);
  });

  describe("失敗では配列を返さない", () => {
    it.each([
      ["新しい ID が少ない", [101]],
      ["新しい ID が多い", [101, 102, 103]],
      ["既存の ID と重なる", [1, 102]],
      ["新しい ID どうしが重なる", [101, 101]],
      ["有限でない ID を含む", [101, Number.NaN]],
      ["0 の ID を含む", [101, 0]],
      ["負の ID を含む", [101, -5]],
      ["小数の ID を含む", [101, 1.5]],
      ["安全でない整数の ID を含む", [101, Number.MAX_SAFE_INTEGER + 1]],
    ])("%sと id-conflict", (_name, newNodeIds) => {
      expect(splitNode(rootNodes, 2, "、", newNodeIds, visibleOf(rootNodes)))
        .toEqual({ ok: false, reason: "id-conflict" });
    });

    it("計画の失敗は、その reason をそのまま返す（ID の検査より先）", () => {
      expect(splitNode(rootNodes, 2, "", [], visibleOf(rootNodes))).toEqual({ ok: false, reason: "separator-empty" });
      expect(splitNode(rootNodes, 3, "、", [101], visibleOf(rootNodes))).toEqual({ ok: false, reason: "not-splittable" });
      expect(splitNode(rootNodes, 2, "、", [101, 102], new Set([1, 3]))).toEqual({ ok: false, reason: "node-hidden" });
      expect(splitNode(rootNodes, 99, "、", [101, 102], visibleOf(rootNodes))).toEqual({ ok: false, reason: "node-missing" });
    });
  });
});
