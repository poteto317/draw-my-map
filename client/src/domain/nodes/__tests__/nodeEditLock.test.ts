import {
  assertNodesEditable,
  assertManualPositionCommitAllowed,
  lockSubtree,
  toggleNodeLock,
  unlockSubtree,
} from "@/domain/nodes/nodeEditLock";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, locked?: true) {
  return createTestNode({
    id,
    parentId: id === 1 ? null : 1,
    x: id * 10,
    y: id * 10,
    width: 100,
    height: 60,
    label: `${id}`,
    ...(locked === undefined ? {} : { locked }),
  });
}

describe("nodeEditLock", () => {
  it("assertNodesEditable は locked を拒否する", () => {
    const nodes = [node(1), { ...node(2), locked: true as const }];
    expect(assertNodesEditable([1, 2], nodes)).toEqual({ ok: false, reason: "locked" });
    expect(assertNodesEditable([1], nodes)).toEqual({ ok: true });
  });

  it("lockSubtree は未ロックのみ付与する", () => {
    const nodes = [node(1), node(2), { ...node(3, true), parentId: 2 }];
    const next = lockSubtree(nodes, 1);
    expect(next?.find((item) => item.id === 1)?.locked).toBe(true);
    expect(next?.find((item) => item.id === 2)?.locked).toBe(true);
    expect(next?.find((item) => item.id === 3)?.locked).toBe(true);
  });

  it("unlockSubtree は部分木内の locked をすべて解除する", () => {
    const nodes = [
      { ...node(1), locked: true as const },
      { ...node(2), locked: true as const },
    ];
    const next = unlockSubtree(nodes, 1);
    expect(next?.every((item) => item.locked === undefined)).toBe(true);
  });

  it("toggleNodeLock は単一ノードを切り替える", () => {
    const nodes = [node(1)];
    const locked = toggleNodeLock(nodes, 1);
    expect(locked?.find((item) => item.id === 1)?.locked).toBe(true);
    const unlocked = toggleNodeLock(locked!, 1);
    expect(unlocked?.find((item) => item.id === 1)?.locked).toBeUndefined();
  });

  it("assertManualPositionCommitAllowed は locked の座標変更を拒否する", () => {
    const current = [{ ...node(1), locked: true as const, parentId: null }];
    const next = [{ ...current[0], x: 999 }];
    expect(assertManualPositionCommitAllowed(current, next)).toEqual({ ok: false, reason: "locked" });
  });

  it("assertManualPositionCommitAllowed は locked が next に無いとき拒否する", () => {
    const current = [{ ...node(1), locked: true as const, parentId: null }, node(2)];
    const next = [current[1]];
    expect(assertManualPositionCommitAllowed(current, next)).toEqual({ ok: false, reason: "locked" });
  });
});