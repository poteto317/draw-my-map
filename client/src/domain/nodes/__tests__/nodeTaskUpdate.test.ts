import {
  computeNodeCustomAttributeUpdate,
  computeNodeTaskUpdate,
  normalizeTaskForEdit,
} from "@/domain/nodes/nodeTaskUpdate";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeCustomAttribute } from "@/types/node";

const numberAttr: NodeCustomAttribute = { name: "件数", type: "number", value: 3 };

describe("computeNodeTaskUpdate", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, label: "b", task: { completed: false } }),
    createTestNode({ id: 3, label: "locked", locked: true, task: { completed: false } }),
  ];

  it("期待値と一致するときだけタスクを更新する", () => {
    expect(computeNodeTaskUpdate(nodes, 2, { completed: false }, { completed: true })).toEqual({
      matched: true,
      changed: true,
      nodes: [
        nodes[0],
        { ...nodes[1], task: { completed: true } },
        nodes[2],
      ],
    });
  });

  it("同値のときは changed: false", () => {
    expect(computeNodeTaskUpdate(nodes, 2, { completed: false }, { completed: false })).toEqual({
      matched: true,
      changed: false,
      nodes: null,
    });
  });

  it("ロック中と期待値不一致は matched: false", () => {
    expect(computeNodeTaskUpdate(nodes, 3, { completed: false }, { completed: true }).matched).toBe(false);
    expect(computeNodeTaskUpdate(nodes, 2, undefined, { completed: false }).matched).toBe(false);
  });
});

describe("computeNodeCustomAttributeUpdate", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a", customAttributes: [numberAttr] }),
    createTestNode({ id: 2, label: "locked", locked: true }),
  ];

  it("属性を追加できる", () => {
    const next: NodeCustomAttribute = { name: "期限", type: "date", value: "2026-01-01" };
    const result = computeNodeCustomAttributeUpdate(nodes, 1, null, null, next);
    expect(result).toMatchObject({ matched: true, changed: true, failureReason: null });
    expect(result.nodes?.[0].customAttributes).toEqual([numberAttr, next]);
  });

  it("バリデーション失敗は failureReason を返す", () => {
    const result = computeNodeCustomAttributeUpdate(nodes, 1, null, null, {
      name: "x",
      type: "number",
      value: Number.NaN,
    });
    expect(result.nodes).toBeNull();
    expect(result.failureReason).toBeTruthy();
  });
});

describe("normalizeTaskForEdit", () => {
  it("undefined はそのまま通す", () => {
    expect(normalizeTaskForEdit(undefined)).toEqual({ ok: true, value: undefined });
  });
});