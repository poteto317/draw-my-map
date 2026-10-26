import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  changeNodeIndent,
  getNodeIndentAvailability,
  type NodeIndentResult,
} from "@/domain/nodes/nodeIndent";
import { buildNodeForestRelations } from "@/domain/nodes/nodeLayoutForestRelations";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const R = 1;
const A = 2;
const B = 3;
const T = 4;
const A1 = 5;
const Tc = 6;
const H = 7;
const R2 = 8;
const A3 = 9;
const X = 10;

const LABELS = new Map<number, string>([
  [R, "R"],
  [A, "A"],
  [B, "B"],
  [T, "T"],
  [A1, "A1"],
  [Tc, "Tc"],
  [H, "H"],
  [R2, "R2"],
  [A3, "A3"],
  [X, "X"],
]);

function node(id: number, parentId: number | null, x = 0, y = 0): Node {
  return createTestNode({ id, parentId, x, y, label: LABELS.get(id) ?? "" });
}

// hidden の ID だけ見えないことにする
function visible(nodes: readonly Node[], hidden: readonly number[] = []): Set<number> {
  const ids = new Set(nodes.map((item) => item.id));
  for (const id of hidden) ids.delete(id);
  return ids;
}

function pairs(result: NodeIndentResult): [number, number | null][] {
  if (!result.ok) throw new Error(`失敗した: ${result.reason}`);
  return result.nodes.map((item) => [item.id, item.parentId]);
}

function ids(result: NodeIndentResult): number[] {
  if (!result.ok) throw new Error(`失敗した: ${result.reason}`);
  return result.nodes.map((item) => item.id);
}

function successNodes(result: NodeIndentResult): Node[] {
  if (!result.ok) throw new Error(`失敗した: ${result.reason}`);
  return result.nodes;
}

function findNode(nodes: readonly Node[], id: number): Node {
  const found = nodes.find((item) => item.id === id);
  if (found === undefined) throw new Error(`ノード ${id} が無い`);
  return found;
}

function position(nodes: readonly Node[], id: number) {
  const found = findNode(nodes, id);
  return { x: found.x, y: found.y };
}

function indent(nodes: readonly Node[], nodeId: number, hidden: readonly number[] = []) {
  return changeNodeIndent(nodes, nodeId, "indent", visible(nodes, hidden), "auto");
}

function outdent(nodes: readonly Node[], nodeId: number, hidden: readonly number[] = []) {
  return changeNodeIndent(nodes, nodeId, "outdent", visible(nodes, hidden), "auto");
}

describe("getNodeIndentAvailability", () => {
  it("nodeId が null なら両方とも false", () => {
    const nodes = [node(R, null)];

    expect(getNodeIndentAvailability(nodes, null, visible(nodes))).toEqual({
      indent: false,
      outdent: false,
    });
  });

  it("ノードが無ければ両方とも false", () => {
    const nodes = [node(R, null), node(A, R)];

    expect(getNodeIndentAvailability(nodes, 99, visible(nodes))).toEqual({
      indent: false,
      outdent: false,
    });
  });

  it("ノードが隠れていれば両方とも false", () => {
    const nodes = [node(R, null), node(A, R), node(T, R)];

    expect(getNodeIndentAvailability(nodes, T, visible(nodes, [T]))).toEqual({
      indent: false,
      outdent: false,
    });
  });

  it("ただ1つのルートは下げも上げもできない", () => {
    const nodes = [node(R, null)];

    expect(getNodeIndentAvailability(nodes, R, visible(nodes))).toEqual({
      indent: false,
      outdent: false,
    });
  });

  it("2つ目のルートは下げられるが上げられない", () => {
    const nodes = [node(R, null), node(R2, null)];

    expect(getNodeIndentAvailability(nodes, R2, visible(nodes))).toEqual({
      indent: true,
      outdent: false,
    });
  });

  it("先頭の兄弟は下げられないが上げられる", () => {
    const nodes = [node(R, null), node(T, R), node(A, R)];

    expect(getNodeIndentAvailability(nodes, T, visible(nodes))).toEqual({
      indent: false,
      outdent: true,
    });
  });

  it("中間の兄弟は下げも上げもできる", () => {
    const nodes = [node(R, null), node(A, R), node(T, R), node(B, R)];

    expect(getNodeIndentAvailability(nodes, T, visible(nodes))).toEqual({
      indent: true,
      outdent: true,
    });
  });

  it("一人っ子は下げられないが上げられる", () => {
    const nodes = [node(R, null), node(T, R)];

    expect(getNodeIndentAvailability(nodes, T, visible(nodes))).toEqual({
      indent: false,
      outdent: true,
    });
  });

  it("前に隠れた兄弟しか無ければ下げられない", () => {
    const nodes = [node(R, null), node(H, R), node(T, R)];

    expect(getNodeIndentAvailability(nodes, T, visible(nodes, [H]))).toEqual({
      indent: false,
      outdent: true,
    });
  });

  it("配列を1回だけ走査する", () => {
    const nodes = [node(R, null), node(A, R), node(T, R), node(B, R)];
    let indexReads = 0;
    const counted = new Proxy(nodes, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    getNodeIndentAvailability(counted, T, visible(nodes));

    expect(indexReads).toBeGreaterThan(0);
    expect(indexReads).toBeLessThanOrEqual(nodes.length);
  });
});

describe("changeNodeIndent（配列）", () => {
  it("I1: 新しい親に子が無ければ、配列の位置を変えずに親だけ変える", () => {
    const nodes = [node(R, null), node(A, R), node(B, R), node(T, R)];

    const result = indent(nodes, T);

    expect(pairs(result)).toEqual([[1, null], [2, 1], [3, 1], [4, 3]]);
    expect(result).toMatchObject({
      ok: true,
      direction: "indent",
      newParentId: 3,
      newParentLabel: "B",
      depth: 3,
    });
  });

  it("I2: T がすでに新しい親の最後の子より後ろにあれば、その直後に置く", () => {
    const nodes = [node(R, null), node(A, R), node(A1, A), node(T, R), node(Tc, T)];

    const result = indent(nodes, T);

    expect(ids(result)).toEqual([1, 2, 5, 4, 6]);
    expect(findNode(successNodes(result), T).parentId).toBe(2);
  });

  it("I3: 新しい親の最後の子が T より後ろにあれば、T をその直後へ移す", () => {
    const nodes = [node(R, null), node(A, R), node(T, R), node(A1, A)];

    const result = indent(nodes, T);

    expect(ids(result)).toEqual([1, 2, 5, 4]);
    expect(findNode(successNodes(result), T).parentId).toBe(2);
  });

  it("I3: 新しい親に子が2つ以上あれば、T を配列で最後の子の直後へ置く", () => {
    const nodes = [node(R, null), node(A, R), node(A1, A), node(A3, A), node(T, R)];

    const result = indent(nodes, T);

    expect(ids(result)).toEqual([1, 2, 5, 9, 4]);
    const relations = buildNodeForestRelations(successNodes(result))!;
    expect(relations.childrenByParent.get(2)?.map((item) => item.id)).toEqual([5, 9, 4]);
  });

  it("I4: 隠れた兄弟を飛び越えて、見えている直前の兄弟の子になる", () => {
    const nodes = [node(R, null), node(A, R), node(H, R), node(T, R)];

    const result = indent(nodes, T, [H]);

    expect(ids(result)).toEqual([1, 2, 7, 4]);
    expect(findNode(successNodes(result), T).parentId).toBe(2);
    expect(findNode(successNodes(result), H).parentId).toBe(1);
  });

  it("I5: 前に隠れた兄弟しか無ければ at-edge（hiddenBeyond: true）", () => {
    const nodes = [node(R, null), node(H, R), node(T, R)];

    expect(indent(nodes, T, [H])).toEqual({
      ok: false,
      reason: "at-edge",
      direction: "indent",
      hiddenBeyond: true,
      isRoot: false,
    });
  });

  it("I6: 先頭の兄弟は at-edge（hiddenBeyond: false）", () => {
    const nodes = [node(R, null), node(T, R), node(A, R)];

    expect(indent(nodes, T)).toEqual({
      ok: false,
      reason: "at-edge",
      direction: "indent",
      hiddenBeyond: false,
      isRoot: false,
    });
  });

  it("I7: ルートを下げると、直前のルートの子になる", () => {
    const nodes = [node(R, null), node(R2, null)];

    const result = indent(nodes, R2);

    expect(pairs(result)).toEqual([[1, null], [8, 1]]);
    expect(result).toMatchObject({ ok: true, newParentId: 1, newParentLabel: "R", depth: 2 });
  });

  it("I7: 先頭のルートを下げようとすると at-edge（isRoot: true）", () => {
    const nodes = [node(R, null), node(R2, null)];

    expect(indent(nodes, R)).toEqual({
      ok: false,
      reason: "at-edge",
      direction: "indent",
      hiddenBeyond: false,
      isRoot: true,
    });
  });

  it("I8: ルートを下げると、直前のルートの子の末尾になる", () => {
    const nodes = [node(R, null), node(A, R), node(R2, null)];

    const result = indent(nodes, R2);

    expect(ids(result)).toEqual([1, 2, 8]);
    expect(findNode(successNodes(result), R2).parentId).toBe(1);
  });

  it("O1: T を元の親の直後へ移し、後ろの兄弟は元の親に残す", () => {
    const nodes = [node(R, null), node(A, R), node(A1, A), node(T, A), node(A3, A), node(B, R)];

    const result = outdent(nodes, T);

    expect(ids(result)).toEqual([1, 2, 4, 5, 9, 3]);
    const resultNodes = successNodes(result);
    expect(findNode(resultNodes, T).parentId).toBe(1);
    expect(findNode(resultNodes, A1).parentId).toBe(2);
    expect(findNode(resultNodes, A3).parentId).toBe(2);
    expect(result).toMatchObject({
      ok: true,
      direction: "outdent",
      newParentId: 1,
      newParentLabel: "R",
      depth: 2,
    });
  });

  it("O2: T が配列で元の親より前にあっても、元の親の直後へ移す", () => {
    const nodes = [node(R, null), node(A1, A), node(A, R), node(B, R)];

    const result = outdent(nodes, A1);

    expect(ids(result)).toEqual([1, 2, 5, 3]);
    expect(findNode(successNodes(result), A1).parentId).toBe(1);
  });

  it("O3: 元の親がルートなら、T はルートになる", () => {
    const nodes = [node(R, null), node(T, R), node(Tc, T), node(R2, null)];

    const result = outdent(nodes, T);

    expect(ids(result)).toEqual([1, 4, 6, 8]);
    expect(findNode(successNodes(result), T).parentId).toBeNull();
    const relations = buildNodeForestRelations(successNodes(result))!;
    expect(relations.roots.map((item) => item.id)).toEqual([1, 4, 8]);
    expect(result).toMatchObject({
      ok: true,
      newParentId: null,
      newParentLabel: null,
      depth: 1,
    });
  });

  it("O4: 元の親の直後、後ろの隠れた兄弟より前に入る", () => {
    const nodes = [node(R, null), node(A, R), node(T, A), node(H, R), node(B, R)];

    const result = outdent(nodes, T, [H]);

    expect(ids(result)).toEqual([1, 2, 4, 7, 3]);
  });

  it("O5: ルートは上げられない（at-edge）", () => {
    const nodes = [node(R, null)];

    expect(outdent(nodes, R)).toEqual({ ok: false, reason: "at-edge", direction: "outdent" });
  });

  it("I2: T 以外のノードは同じオブジェクトで、Tc の位置と親は変わらず、入力の配列も変わらない", () => {
    const nodes = [node(R, null), node(A, R), node(A1, A), node(T, R), node(Tc, T)];
    const before = [...nodes];
    const snapshot = JSON.parse(JSON.stringify(nodes)) as Node[];

    const resultNodes = successNodes(indent(nodes, T));

    for (const item of resultNodes) {
      if (item.id !== T) expect(item).toBe(findNode(nodes, item.id));
    }
    expect(resultNodes[4]).toBe(nodes[4]);
    expect(resultNodes[4].parentId).toBe(T);
    nodes.forEach((item, index) => expect(item).toBe(before[index]));
    expect(nodes).toEqual(snapshot);
  });

  it("O1: T 以外のノードは同じオブジェクトで、入力の配列も変わらない", () => {
    const nodes = [
      node(R, null),
      node(A, R),
      node(A1, A),
      node(T, A),
      node(A3, A),
      node(B, R),
      node(Tc, T),
    ];
    const before = [...nodes];
    const snapshot = JSON.parse(JSON.stringify(nodes)) as Node[];

    const resultNodes = successNodes(outdent(nodes, T));

    for (const item of resultNodes) {
      if (item.id !== T) expect(item).toBe(findNode(nodes, item.id));
    }
    expect(resultNodes[6]).toBe(nodes[6]);
    expect(resultNodes[6].parentId).toBe(T);
    nodes.forEach((item, index) => expect(item).toBe(before[index]));
    expect(nodes).toEqual(snapshot);
  });

  it("I3: 下げた T は新しい親の子の末尾になる", () => {
    const nodes = [node(R, null), node(A, R), node(T, R), node(A1, A)];

    const relations = buildNodeForestRelations(successNodes(indent(nodes, T)))!;

    expect(relations.childrenByParent.get(2)?.map((item) => item.id)).toEqual([5, 4]);
  });

  it("O1: 上げた T は元の親の直後の兄弟になり、後ろの兄弟は元の親に残る", () => {
    const nodes = [node(R, null), node(A, R), node(A1, A), node(T, A), node(A3, A), node(B, R)];

    const relations = buildNodeForestRelations(successNodes(outdent(nodes, T)))!;

    expect(relations.childrenByParent.get(1)?.map((item) => item.id)).toEqual([2, 4, 3]);
    expect(relations.childrenByParent.get(2)?.map((item) => item.id)).toEqual([5, 9]);
  });

  it("I4: 隠れた兄弟は1件だけ残り、親と相対順が変わらない", () => {
    const nodes = [node(R, null), node(A, R), node(H, R), node(T, R)];

    const resultNodes = successNodes(indent(nodes, T, [H]));

    const hidden = resultNodes.filter((item) => item.id === H);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toBe(nodes[2]);
    expect(resultNodes.filter((item) => item.parentId === R).map((item) => item.id)).toEqual([
      2,
      7,
    ]);
  });

  it("O4: 隠れた兄弟は1件だけ残り、親と相対順が変わらない", () => {
    const nodes = [node(R, null), node(A, R), node(T, A), node(H, R), node(B, R)];

    const resultNodes = successNodes(outdent(nodes, T, [H]));

    const hidden = resultNodes.filter((item) => item.id === H);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]).toBe(nodes[3]);
    expect(resultNodes.filter((item) => item.parentId === R).map((item) => item.id)).toEqual([
      2,
      4,
      7,
      3,
    ]);
  });

  it("新しい親のラベルが空文字なら、空文字のまま返す", () => {
    const nodes = [
      node(R, null),
      node(A, R),
      createTestNode({ id: B, parentId: R, label: "" }),
      node(T, R),
    ];

    expect(indent(nodes, T)).toMatchObject({ ok: true, newParentLabel: "" });
  });

  it("T が無ければ node-missing", () => {
    const nodes = [node(R, null), node(A, R)];

    expect(changeNodeIndent(nodes, 99, "indent", visible(nodes), "auto")).toEqual({
      ok: false,
      reason: "node-missing",
    });
    expect(changeNodeIndent(nodes, 99, "outdent", visible(nodes), "auto")).toEqual({
      ok: false,
      reason: "node-missing",
    });
  });

  it("T が隠れていれば node-hidden", () => {
    const nodes = [node(R, null), node(A, R), node(T, R)];

    expect(indent(nodes, T, [T])).toEqual({ ok: false, reason: "node-hidden" });
    expect(outdent(nodes, T, [T])).toEqual({ ok: false, reason: "node-hidden" });
  });

  it("新しい親が T の子孫（循環）なら invalid-structure", () => {
    const nodes = [node(X, T), node(A, X), node(T, X)];

    expect(indent(nodes, T)).toEqual({ ok: false, reason: "invalid-structure" });
  });

  it("循環は座標を求める前に検出し、手動配置でも invalid-structure", () => {
    // 座標を先に求めると、A の右端の桁落ちで placement-failed になる
    const nodes = [
      node(X, T),
      createTestNode({ id: A, parentId: X, x: Number.MAX_VALUE, label: "A" }),
      node(T, X),
    ];

    expect(changeNodeIndent(nodes, T, "indent", visible(nodes), "manual")).toEqual({
      ok: false,
      reason: "invalid-structure",
    });
  });

  it("上げるとき親が配列に無ければ invalid-structure", () => {
    const nodes = [node(T, 99)];

    expect(outdent(nodes, T)).toEqual({ ok: false, reason: "invalid-structure" });
  });

  it("上げるとき祖父母が配列に無ければ invalid-structure", () => {
    const nodes = [node(A, 99), node(T, A)];

    expect(outdent(nodes, T)).toEqual({ ok: false, reason: "invalid-structure" });
  });

  it("下げるとき新しい親より上の祖先が配列に無ければ invalid-structure", () => {
    const nodes = [node(R, 99), node(A, R), node(T, R)];

    expect(indent(nodes, T)).toEqual({ ok: false, reason: "invalid-structure" });
  });

  it("上げるとき祖父母より上で循環していれば invalid-structure", () => {
    const nodes = [node(X, R), node(R, X), node(A, R), node(T, A)];

    expect(outdent(nodes, T)).toEqual({ ok: false, reason: "invalid-structure" });
  });
});

describe("changeNodeIndent（手動配置）", () => {
  function createM1(): Node[] {
    return [
      node(R, null, 0, 0),
      node(A, R, 220, 0),
      node(A1, A, 440, 0),
      node(T, R, 220, 100),
      node(Tc, T, 440, 100),
    ];
  }

  function createM2(): Node[] {
    return [node(R, null, 0, 0), node(A, R, 220, 0), node(T, R, 220, 100), node(Tc, T, 440, 100)];
  }

  function manual(
    nodes: readonly Node[],
    nodeId: number,
    direction: "indent" | "outdent",
    hidden: readonly number[] = [],
  ) {
    return changeNodeIndent(nodes, nodeId, direction, visible(nodes, hidden), "manual");
  }

  it("M1: 新しい親に子があれば、子の下端の下へ動かす", () => {
    const resultNodes = successNodes(manual(createM1(), T, "indent"));

    expect(position(resultNodes, T)).toEqual({ x: 440, y: 100 });
    expect(position(resultNodes, Tc)).toEqual({ x: 660, y: 100 });
  });

  it("M2: 新しい親に子が無ければ、親と同じ高さへ動かす", () => {
    const resultNodes = successNodes(manual(createM2(), T, "indent"));

    expect(position(resultNodes, T)).toEqual({ x: 440, y: 0 });
    expect(position(resultNodes, Tc)).toEqual({ x: 660, y: 0 });
  });

  it("M3: 新しい親の子が隠れていても M1 と同じ座標になる", () => {
    const resultNodes = successNodes(manual(createM1(), T, "indent", [A1]));

    expect(position(resultNodes, T)).toEqual({ x: 440, y: 100 });
    expect(position(resultNodes, Tc)).toEqual({ x: 660, y: 100 });
  });

  it("M4: 上げると親の枝の下端の下へ動かし、T を元の親の直後へ移す", () => {
    const nodes = [
      node(R, null, 0, 0),
      node(A, R, 220, 0),
      node(B, R, 220, 200),
      node(A1, A, 440, 0),
      node(T, A, 440, 100),
      node(A3, A, 440, 200),
      node(Tc, T, 660, 100),
    ];

    const result = manual(nodes, T, "outdent");

    expect(ids(result)).toEqual([1, 2, 4, 3, 5, 9, 6]);
    const resultNodes = successNodes(result);
    expect(position(resultNodes, T)).toEqual({ x: 220, y: 300 });
    expect(position(resultNodes, Tc)).toEqual({ x: 440, y: 300 });
  });

  it("M5: 上げてルートになる", () => {
    const nodes = [node(R, null, 0, 0), node(T, R, 220, 0), node(Tc, T, 440, 0)];

    const resultNodes = successNodes(manual(nodes, T, "outdent"));

    expect(position(resultNodes, T)).toEqual({ x: 0, y: 100 });
    expect(position(resultNodes, Tc)).toEqual({ x: 220, y: 100 });
    expect(findNode(resultNodes, T).parentId).toBeNull();
  });

  it("M6: 子が根より上にあれば、枝の上端で合わせる", () => {
    const nodes = [
      node(R, null, 0, 0),
      node(A, R, 220, 0),
      node(T, A, 440, 100),
      createTestNode({ id: 11, parentId: T, x: 660, y: 50 }),
      createTestNode({ id: 12, parentId: T, x: 660, y: 150 }),
    ];

    const resultNodes = successNodes(manual(nodes, T, "outdent"));

    expect(position(resultNodes, T)).toEqual({ x: 220, y: 150 });
    expect(position(resultNodes, 11)).toEqual({ x: 440, y: 100 });
    expect(position(resultNodes, 12)).toEqual({ x: 440, y: 200 });
  });

  it("M7: 丸めで間隔が取れなければ placement-failed", () => {
    const nodes = createM1().map((item) => (item.id === A1 ? { ...item, y: 1e17 } : item));

    expect(manual(nodes, T, "indent")).toEqual({ ok: false, reason: "placement-failed" });
  });

  it("M8: 新しい親の右端が桁落ちすれば placement-failed", () => {
    const nodes = createM2().map((item) => (
      item.id === A ? { ...item, x: Number.MAX_VALUE } : item
    ));

    expect(manual(nodes, T, "indent")).toEqual({ ok: false, reason: "placement-failed" });
  });

  it("M8: 子孫の x が溢れたら placement-failed", () => {
    const nodes = createM2().map((item) => (
      item.id === Tc ? { ...item, x: Number.MAX_VALUE } : item
    ));

    expect(manual(nodes, T, "indent")).toEqual({ ok: false, reason: "placement-failed" });
  });

  it("上げるときに座標が求められなければ placement-failed", () => {
    const nodes = [
      node(R, null, 0, 0),
      createTestNode({ id: A, parentId: R, x: Number.NaN, y: 0 }),
      node(T, A, 440, 0),
    ];

    expect(manual(nodes, T, "outdent")).toEqual({ ok: false, reason: "placement-failed" });
  });
});

describe("changeNodeIndent（自動配置と先頭のルート）", () => {
  type Case = {
    name: string;
    nodes: Node[];
    nodeId: number;
    direction: "indent" | "outdent";
  };

  const cases: Case[] = [
    {
      name: "I7: ルートを下げる",
      nodes: [node(R, null, 37, 51), node(R2, null, 500, 900)],
      nodeId: R2,
      direction: "indent",
    },
    {
      name: "I8: 子のあるルートの後ろのルートを下げる",
      nodes: [node(R, null, 37, 51), node(A, R, 300, 300), node(R2, null, 500, 900)],
      nodeId: R2,
      direction: "indent",
    },
    {
      name: "O3: 上げてルートになる",
      nodes: [
        node(R, null, 37, 51),
        node(T, R, 300, 300),
        node(Tc, T, 600, 300),
        node(R2, null, 500, 900),
      ],
      nodeId: T,
      direction: "outdent",
    },
    {
      name: "O2: 配列で先頭のルートより前にある T を上げる",
      nodes: [node(A1, A, 700, 700), node(R, null, 37, 51), node(A, R, 300, 300)],
      nodeId: A1,
      direction: "outdent",
    },
  ];

  it.each(cases)("$name: 先頭のルートと座標が変わらない", ({ nodes, nodeId, direction }) => {
    const firstRoot = nodes.find((item) => item.parentId === null)!;

    const resultNodes = successNodes(
      changeNodeIndent(nodes, nodeId, direction, visible(nodes), "auto"),
    );

    expect(resultNodes.find((item) => item.parentId === null)).toBe(firstRoot);
    for (const item of nodes) {
      expect(position(resultNodes, item.id)).toEqual({ x: item.x, y: item.y });
    }
    const laidOut = layoutNodeForest(resultNodes)!;
    const laidOutFirstRoot = laidOut.find((item) => item.parentId === null)!;
    expect(laidOutFirstRoot.id).toBe(firstRoot.id);
    expect({ x: laidOutFirstRoot.x, y: laidOutFirstRoot.y }).toEqual({ x: 37, y: 51 });
  });

  it("配列で先頭のルートより前にある T を上げてルートにしても、先頭のルートは変わらない", () => {
    const nodes = [node(T, R, 300, 300), node(R, null, 37, 51), node(R2, null, 500, 900)];

    const result = changeNodeIndent(nodes, T, "outdent", visible(nodes), "auto");

    expect(ids(result)).toEqual([1, 4, 8]);
    const resultNodes = successNodes(result);
    expect(resultNodes.find((item) => item.parentId === null)).toBe(nodes[1]);
    const laidOut = layoutNodeForest(resultNodes)!;
    const laidOutFirstRoot = laidOut.find((item) => item.parentId === null)!;
    expect(laidOutFirstRoot.id).toBe(R);
    expect({ x: laidOutFirstRoot.x, y: laidOutFirstRoot.y }).toEqual({ x: 37, y: 51 });
  });
});
