import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { buildNodeForestRelations } from "@/domain/nodes/nodeLayoutForestRelations";
import {
  findSiblingReorderTarget,
  getSiblingReorderAvailability,
  reorderSiblingByRequest,
  reorderSiblingNodes,
  type SiblingReorderResult,
} from "@/domain/nodes/nodeSiblingOrder";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const R = 1;
const A = 2;
const B = 3;
const T = 4;
const C = 5;
const P = 6;
const H1 = 7;
const H2 = 8;
const N = 9;
const H = 10;

type Siblings = { nodes: Node[]; visibleNodeIds: Set<number> };

// 親 R（id 1）の子として ids を並べ、hidden の ID だけ見えないことにする
function siblings(ids: readonly number[], hidden: readonly number[] = []): Siblings {
  const nodes = [
    createTestNode({ id: R }),
    ...ids.map((id) => createTestNode({ id, parentId: R, x: 220, y: 0 })),
  ];
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  for (const id of hidden) visibleNodeIds.delete(id);
  return { nodes, visibleNodeIds };
}

// ルートとして ids を並べ、hidden の ID だけ見えないことにする
function roots(ids: readonly number[], hidden: readonly number[] = []): Siblings {
  const nodes = ids.map((id) => createTestNode({ id }));
  const visibleNodeIds = new Set(ids);
  for (const id of hidden) visibleNodeIds.delete(id);
  return { nodes, visibleNodeIds };
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((node) => node.id);
}

function childIdsOfR(nodes: readonly Node[]): number[] {
  return (buildNodeForestRelations(nodes)!.childrenByParent.get(R) ?? []).map(
    (node) => node.id,
  );
}

function reorderOk(result: SiblingReorderResult) {
  if (!result.ok) throw new Error(`並べ替えに失敗しました: ${result.reason}`);
  return result;
}

function nodeById(nodes: readonly Node[], id: number): Node {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`ノード ${id} がありません`);
  return node;
}

describe("findSiblingReorderTarget", () => {
  it("A1: 上へは直前の見えている兄弟の前になる", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "before", anchorId: B },
    });
  });

  it("A2: 下へは直後の見えている兄弟の後ろになる", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "after", anchorId: C },
    });
  });

  it("A3: 上へは隠れた兄弟を飛ばして直前の見えている兄弟の前になる", () => {
    const { nodes, visibleNodeIds } = siblings([A, P, H1, H2, T, C], [H1, H2]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "before", anchorId: P },
    });
  });

  it("A4: 下へは隠れた兄弟を飛ばして直後の見えている兄弟の後ろになる", () => {
    const { nodes, visibleNodeIds } = siblings([A, T, H1, N, C], [H1]);

    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "after", anchorId: N },
    });
  });

  it("A5: 前に隠れた兄弟だけがあれば hiddenBeyond が true の at-edge", () => {
    const { nodes, visibleNodeIds } = siblings([H, T, B], [H]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: true,
      isRoot: false,
    });
  });

  it("A5: 後ろに隠れた兄弟だけがあれば下へも hiddenBeyond が true の at-edge", () => {
    const { nodes, visibleNodeIds } = siblings([B, T, H], [H]);

    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: true,
      isRoot: false,
    });
  });

  it("A6: 先頭で上へは hiddenBeyond が false の at-edge", () => {
    const { nodes, visibleNodeIds } = siblings([T, B]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: false,
      isRoot: false,
    });
  });

  it("末尾で下へは hiddenBeyond が false の at-edge", () => {
    const { nodes, visibleNodeIds } = siblings([B, T]);

    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: false,
      isRoot: false,
    });
  });

  it("A7: 一人っ子は上へも下へも at-edge", () => {
    const { nodes, visibleNodeIds } = siblings([T]);
    const atEdge = {
      ok: false,
      reason: "at-edge",
      hiddenBeyond: false,
      isRoot: false,
    };

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual(atEdge);
    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual(atEdge);
  });

  it("ルートの列でも同じ規則で挿入先を決める", () => {
    const { nodes, visibleNodeIds } = roots([A, T, H, C], [H]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "before", anchorId: A },
    });
    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "after", anchorId: C },
    });
  });

  it("ルートの端では isRoot が true の at-edge", () => {
    const { nodes, visibleNodeIds } = roots([H, T], [H]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: true,
      isRoot: true,
    });
    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: false,
      isRoot: true,
    });
  });

  it("別の親の見えている子が間にあっても兄弟として数えない", () => {
    const X = 11;
    const Y = 12;
    const nodes = [
      createTestNode({ id: R }),
      createTestNode({ id: A, parentId: R }),
      createTestNode({ id: X, parentId: A }),
      createTestNode({ id: T, parentId: R }),
      createTestNode({ id: Y, parentId: A }),
      createTestNode({ id: B, parentId: R }),
    ];
    const visibleNodeIds = new Set(ids(nodes));

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "before", anchorId: A },
    });
    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: true,
      target: { position: "after", anchorId: B },
    });
  });

  it("別の親の隠れた子は hiddenBeyond に数えない", () => {
    const X = 11;
    const Y = 12;
    const nodes = [
      createTestNode({ id: R }),
      createTestNode({ id: A }),
      createTestNode({ id: X, parentId: A }),
      createTestNode({ id: T, parentId: R }),
      createTestNode({ id: Y, parentId: A }),
    ];
    const visibleNodeIds = new Set([R, A, T]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: false,
      isRoot: false,
    });
    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: false,
      reason: "at-edge",
      hiddenBeyond: false,
      isRoot: false,
    });
  });

  it("T が無ければ node-missing", () => {
    const { nodes, visibleNodeIds } = siblings([A, B]);

    expect(findSiblingReorderTarget(nodes, T, "up", visibleNodeIds)).toEqual({
      ok: false,
      reason: "node-missing",
    });
  });

  it("T が隠れていれば node-hidden", () => {
    const { nodes, visibleNodeIds } = siblings([A, T, B], [T]);

    expect(findSiblingReorderTarget(nodes, T, "down", visibleNodeIds)).toEqual({
      ok: false,
      reason: "node-hidden",
    });
  });
});

describe("getSiblingReorderAvailability", () => {
  it("nodeId が null なら両方とも無効", () => {
    const { nodes, visibleNodeIds } = siblings([A, T, B]);

    expect(getSiblingReorderAvailability(nodes, null, visibleNodeIds)).toEqual({
      up: false,
      down: false,
    });
  });

  it("T が無い・隠れていれば両方とも無効", () => {
    const missing = siblings([A, B]);
    const hidden = siblings([A, T, B], [T]);

    expect(
      getSiblingReorderAvailability(missing.nodes, T, missing.visibleNodeIds),
    ).toEqual({ up: false, down: false });
    expect(
      getSiblingReorderAvailability(hidden.nodes, T, hidden.visibleNodeIds),
    ).toEqual({ up: false, down: false });
  });

  it("先頭は下だけ、末尾は上だけ、中間は両方、一人っ子はどちらも有効でない", () => {
    const first = siblings([T, A, B]);
    const last = siblings([A, B, T]);
    const middle = siblings([A, T, B]);
    const only = siblings([T]);

    expect(
      getSiblingReorderAvailability(first.nodes, T, first.visibleNodeIds),
    ).toEqual({ up: false, down: true });
    expect(
      getSiblingReorderAvailability(last.nodes, T, last.visibleNodeIds),
    ).toEqual({ up: true, down: false });
    expect(
      getSiblingReorderAvailability(middle.nodes, T, middle.visibleNodeIds),
    ).toEqual({ up: true, down: true });
    expect(
      getSiblingReorderAvailability(only.nodes, T, only.visibleNodeIds),
    ).toEqual({ up: false, down: false });
  });

  it("隠れた兄弟だけが隣にある向きは無効", () => {
    const { nodes, visibleNodeIds } = siblings([H1, T, H2], [H1, H2]);

    expect(getSiblingReorderAvailability(nodes, T, visibleNodeIds)).toEqual({
      up: false,
      down: false,
    });
  });

  it("ノードの配列を1回だけ走査する", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C, P, N]);
    let reads = 0;
    const counted = new Proxy(nodes, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(getSiblingReorderAvailability(counted, T, visibleNodeIds)).toEqual({
      up: true,
      down: true,
    });
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(nodes.length);
  });
});

describe("reorderSiblingNodes（配列）", () => {
  it("A1: before B で A, T, B, C になる", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: B }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([R, A, T, B, C]);
  });

  it("A2: after C で A, B, C, T になる", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "after", anchorId: C }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([R, A, B, C, T]);
  });

  it("A3: before P で A, T, P, H1, H2, C になり、隠れた兄弟の順は変わらない", () => {
    const { nodes, visibleNodeIds } = siblings([A, P, H1, H2, T, C], [H1, H2]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: P }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([R, A, T, P, H1, H2, C]);
    const hiddenOrder = ids(result.nodes).filter((id) => id === H1 || id === H2);
    expect(hiddenOrder).toEqual([H1, H2]);
    expect(result.nodes).toHaveLength(nodes.length);
  });

  it("A4: after N で A, H1, N, T, C になる", () => {
    const { nodes, visibleNodeIds } = siblings([A, T, H1, N, C], [H1]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "after", anchorId: N }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([R, A, H1, N, T, C]);
  });

  it("A8: before C で A, B, H, T, C になる", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, H, C, T], [H]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: C }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([R, A, B, H, T, C]);
  });

  it("A9: after B で A, H, B, T, C になる", () => {
    const { nodes, visibleNodeIds } = siblings([T, A, H, B, C], [H]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "after", anchorId: B }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([R, A, H, B, T, C]);
  });

  it("子孫の配列位置は変えず、根ノード1つだけを動かす", () => {
    const Tc = 20;
    const nodes = [
      createTestNode({ id: R }),
      createTestNode({ id: A, parentId: R, x: 220 }),
      createTestNode({ id: T, parentId: R, x: 220 }),
      createTestNode({ id: Tc, parentId: T, x: 440 }),
      createTestNode({ id: B, parentId: R, x: 220 }),
    ];
    const snapshot = [...nodes];
    const visibleNodeIds = new Set(ids(nodes));

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "after", anchorId: B }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([R, A, Tc, B, T]);
    expect(nodeById(result.nodes, R)).toBe(snapshot[0]);
    expect(nodeById(result.nodes, A)).toBe(snapshot[1]);
    expect(nodeById(result.nodes, T)).toBe(snapshot[2]);
    expect(nodeById(result.nodes, Tc)).toBe(snapshot[3]);
    expect(nodeById(result.nodes, B)).toBe(snapshot[4]);
    expect(nodes).toEqual(snapshot);
    for (let index = 0; index < nodes.length; index += 1) {
      expect(nodes[index]).toBe(snapshot[index]);
    }
    expect(childIdsOfR(result.nodes)).toEqual([A, B, T]);
    expect(nodeById(result.nodes, Tc).parentId).toBe(T);
  });

  it("隠れた兄弟を全件残す", () => {
    const { nodes, visibleNodeIds } = siblings([H1, A, H2, T, H], [H1, H2, H]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: A }, visibleNodeIds, "auto"),
    );

    expect(childIdsOfR(result.nodes)).toEqual([H1, T, A, H2, H]);
  });

  it.each([
    ["anchor が無い", { position: "before" as const, anchorId: 99 }],
    ["anchor が T 自身", { position: "before" as const, anchorId: T }],
    ["anchor が別の親", { position: "after" as const, anchorId: 30 }],
    ["anchor が隠れている", { position: "before" as const, anchorId: H }],
    ["before で anchor が T の直後", { position: "before" as const, anchorId: B }],
    ["after で anchor が T の直前", { position: "after" as const, anchorId: A }],
    ["before で anchor が T より2つ後ろ", { position: "before" as const, anchorId: C }],
    ["after で anchor が T より2つ前", { position: "after" as const, anchorId: P }],
  ])("%s なら invalid-target", (_label, target) => {
    const nodes = [
      createTestNode({ id: R }),
      createTestNode({ id: H, parentId: R }),
      createTestNode({ id: P, parentId: R }),
      createTestNode({ id: A, parentId: R }),
      createTestNode({ id: T, parentId: R }),
      createTestNode({ id: B, parentId: R }),
      createTestNode({ id: C, parentId: R }),
      createTestNode({ id: 30, parentId: A }),
    ];
    const visibleNodeIds = new Set(ids(nodes));
    visibleNodeIds.delete(H);

    expect(reorderSiblingNodes(nodes, T, target, visibleNodeIds, "auto")).toEqual({
      ok: false,
      reason: "invalid-target",
    });
  });

  it("T が無ければ node-missing、隠れていれば node-hidden", () => {
    const missing = siblings([A, B]);
    const hidden = siblings([A, T, B], [T]);

    expect(
      reorderSiblingNodes(
        missing.nodes, T, { position: "before", anchorId: A }, missing.visibleNodeIds, "auto",
      ),
    ).toEqual({ ok: false, reason: "node-missing" });
    expect(
      reorderSiblingNodes(
        hidden.nodes, T, { position: "before", anchorId: A }, hidden.visibleNodeIds, "auto",
      ),
    ).toEqual({ ok: false, reason: "node-hidden" });
  });

  it("A1 の結果は上へ・見えている兄弟の中で2番目", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: B }, visibleNodeIds, "auto"),
    );

    expect(result).toMatchObject({
      direction: "up",
      visibleIndex: 1,
      visibleCount: 4,
      isRoot: false,
    });
  });

  it("A4 の結果は下へで、隠れた兄弟を位置と総数に数えない", () => {
    const { nodes, visibleNodeIds } = siblings([A, T, H1, N, C], [H1]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "after", anchorId: N }, visibleNodeIds, "auto"),
    );

    expect(result).toMatchObject({
      direction: "down",
      visibleIndex: 2,
      visibleCount: 4,
      isRoot: false,
    });
  });

  it("ルートの並べ替えでは isRoot が true", () => {
    const { nodes, visibleNodeIds } = roots([A, B, T]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: B }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([A, T, B]);
    expect(result).toMatchObject({
      direction: "up",
      visibleIndex: 1,
      visibleCount: 3,
      isRoot: true,
    });
  });
});

describe("reorderSiblingNodes（手動配置）", () => {
  it("例2: 隠れた兄弟を飛び越えて上へ動かすと、縦位置も入れ替わる", () => {
    const nodes = [
      createTestNode({ id: A, y: 0 }),
      createTestNode({ id: H, y: 100 }),
      createTestNode({ id: T, y: 200 }),
    ];
    const visibleNodeIds = new Set([A, T]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: A }, visibleNodeIds, "manual"),
    );

    expect(ids(result.nodes)).toEqual([T, A, H]);
    expect(result.nodes.map((node) => node.y)).toEqual([0, 100, 200]);
  });

  it("例3: 隠れた兄弟を飛び越えて下へ動かすと、縦位置も入れ替わる", () => {
    const nodes = [
      createTestNode({ id: T, y: 0 }),
      createTestNode({ id: H, y: 100 }),
      createTestNode({ id: N, y: 200 }),
    ];
    const visibleNodeIds = new Set([T, N]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "after", anchorId: N }, visibleNodeIds, "manual"),
    );

    expect(ids(result.nodes)).toEqual([H, N, T]);
    expect(result.nodes.map((node) => node.y)).toEqual([0, 100, 200]);
  });

  it("枝が重なる不正なデータでは invalid-target", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, x: 400, y: 0 }),
      createTestNode({ id: 3, parentId: 1, x: 400, y: 100 }),
      createTestNode({ id: 4, parentId: 2, x: 600, y: 300 }),
      createTestNode({ id: 4, parentId: 3, x: 600, y: 400 }),
    ];
    const visibleNodeIds = new Set([1, 2, 3, 4]);

    expect(
      reorderSiblingNodes(nodes, 3, { position: "before", anchorId: 2 }, visibleNodeIds, "manual"),
    ).toEqual({ ok: false, reason: "invalid-target" });
  });

  it("桁落ちする座標では placement-failed", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, x: 400, y: 0 }),
      createTestNode({ id: 3, parentId: 1, x: 400, y: 4 }),
      createTestNode({ id: 4, parentId: 3, x: 600, y: 1e17 }),
    ];
    const visibleNodeIds = new Set([1, 2, 3, 4]);

    expect(
      reorderSiblingNodes(nodes, 3, { position: "before", anchorId: 2 }, visibleNodeIds, "manual"),
    ).toEqual({ ok: false, reason: "placement-failed" });
  });
});

describe("reorderSiblingNodes（自動配置の先頭のルート）", () => {
  it("T が先頭のルートになると、旧先頭のルートの座標を引き継ぐ", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0 }),
      createTestNode({ id: 2, x: 50, y: 190 }),
    ];
    const visibleNodeIds = new Set([1, 2]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, 2, { position: "before", anchorId: 1 }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([2, 1]);
    expect(result.nodes[0]).toMatchObject({ id: 2, x: 0, y: 0 });
    expect(result.nodes[1]).toBe(nodes[0]);
    expect(nodes[1]).toMatchObject({ x: 50, y: 190 });
  });

  it("先頭の T が下へ動き隠れたルートが先頭になると、隠れたルートが座標を引き継ぐ", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0 }),
      createTestNode({ id: 2, x: 7, y: 9 }),
      createTestNode({ id: 3, x: 0, y: 190 }),
    ];
    const visibleNodeIds = new Set([1, 3]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, 1, { position: "after", anchorId: 3 }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([2, 3, 1]);
    expect(result.nodes[0]).toMatchObject({ id: 2, x: 0, y: 0 });
    expect(result.nodes[1]).toBe(nodes[2]);
    expect(result.nodes[2]).toBe(nodes[0]);
  });

  it("先頭のルートが変わらなければ、どのノードの座標も変えない", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0 }),
      createTestNode({ id: 2, x: 5, y: 190 }),
      createTestNode({ id: 3, x: 9, y: 380 }),
    ];
    const visibleNodeIds = new Set([1, 2, 3]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, 3, { position: "before", anchorId: 2 }, visibleNodeIds, "auto"),
    );

    expect(ids(result.nodes)).toEqual([1, 3, 2]);
    expect(result.nodes[0]).toBe(nodes[0]);
    expect(result.nodes[1]).toBe(nodes[2]);
    expect(result.nodes[2]).toBe(nodes[1]);
  });

  it("ルートでない並べ替えでは、どのノードの座標も変えない", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, T, { position: "before", anchorId: A }, visibleNodeIds, "auto"),
    );

    for (const node of nodes) expect(nodeById(result.nodes, node.id)).toBe(node);
  });

  it("手動配置では先頭のルートの座標を引き継がない", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0 }),
      createTestNode({ id: 2, x: 50, y: 190 }),
    ];
    const visibleNodeIds = new Set([1, 2]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, 2, { position: "before", anchorId: 1 }, visibleNodeIds, "manual"),
    );

    expect(ids(result.nodes)).toEqual([2, 1]);
    expect(nodeById(result.nodes, 2).x).toBe(50);
  });

  it("例6: 子を持つルートを先頭へ動かすと、自動配置でその木が先頭の位置に並ぶ", () => {
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0 }),
      createTestNode({ id: 2, x: 0, y: 190 }),
      createTestNode({ id: 3, parentId: 2, x: 220, y: 140 }),
      createTestNode({ id: 4, parentId: 2, x: 220, y: 240 }),
    ];
    const visibleNodeIds = new Set([1, 2, 3, 4]);

    const result = reorderOk(
      reorderSiblingNodes(nodes, 2, { position: "before", anchorId: 1 }, visibleNodeIds, "auto"),
    );
    const laidOut = layoutNodeForest(result.nodes)!;

    expect(nodeById(laidOut, 2)).toMatchObject({ x: 0, y: 0 });
    expect(nodeById(laidOut, 3)).toMatchObject({ x: 220, y: -50 });
    expect(nodeById(laidOut, 4)).toMatchObject({ x: 220, y: 50 });
    expect(nodeById(laidOut, 1)).toMatchObject({ x: 0, y: 190 });
  });
});

describe("reorderSiblingByRequest", () => {
  it("step は見えている隣の兄弟へ解決して並べ替え、位置の情報を返す", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    const result = reorderSiblingByRequest(
      nodes,
      T,
      { kind: "step", direction: "up" },
      visibleNodeIds,
      "auto",
    );

    expect(result).toMatchObject({
      ok: true,
      direction: "up",
      visibleIndex: 1,
      visibleCount: 4,
      isRoot: false,
    });
    if (!result.ok) throw new Error("並べ替えに失敗しました");
    expect(ids(result.nodes)).toEqual([R, A, T, B, C]);
  });

  it("step の端では direction を足した at-edge を返す", () => {
    const { nodes, visibleNodeIds } = siblings([H, T, B], [H]);

    expect(reorderSiblingByRequest(
      nodes,
      T,
      { kind: "step", direction: "up" },
      visibleNodeIds,
      "auto",
    )).toEqual({
      ok: false,
      reason: "at-edge",
      direction: "up",
      hiddenBeyond: true,
      isRoot: false,
    });
  });

  it("step で T が無い・見えていないときはその理由を返す", () => {
    const { nodes, visibleNodeIds } = siblings([A, T], [T]);

    expect(reorderSiblingByRequest(
      nodes,
      N,
      { kind: "step", direction: "down" },
      visibleNodeIds,
      "auto",
    )).toEqual({ ok: false, reason: "node-missing" });
    expect(reorderSiblingByRequest(
      nodes,
      T,
      { kind: "step", direction: "up" },
      visibleNodeIds,
      "auto",
    )).toEqual({ ok: false, reason: "node-hidden" });
  });

  it("drop は受け取った挿入先でそのまま並べ替える", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    const result = reorderSiblingByRequest(
      nodes,
      T,
      { kind: "drop", target: { position: "before", anchorId: A } },
      visibleNodeIds,
      "auto",
    );

    if (!result.ok) throw new Error(`並べ替えに失敗しました: ${result.reason}`);
    expect(ids(result.nodes)).toEqual([R, T, A, B, C]);
    expect(result.visibleIndex).toBe(0);
  });

  it("drop の挿入先が不正なら invalid-target を返す", () => {
    const { nodes, visibleNodeIds } = siblings([A, B, T, C]);

    expect(reorderSiblingByRequest(
      nodes,
      T,
      { kind: "drop", target: { position: "after", anchorId: A } },
      visibleNodeIds,
      "auto",
    )).toEqual({ ok: false, reason: "invalid-target" });
  });
});
