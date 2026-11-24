import { act, renderHook } from "@testing-library/react";
import { decodeSubtreeClipboard } from "@/domain/clipboard/subtreeClipboardCodec";
import { planNodeMerge } from "@/domain/nodes/nodeMerge";
import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { mapDocumentOptionsFromState } from "@/domain/persistence/mapDocumentState";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation } from "@/types/mapRelation";
import type { NodeMapState } from "@/types/nodeMapState";

const MAP_ID = "map-test";

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return { kind: "related", directed: false, ...partial };
}

function group(partial: Partial<MapGroup> & Pick<MapGroup, "id" | "nodeIds">): MapGroup {
  return { label: "", ...partial };
}

function baseState(extra: Partial<NodeMapState> = {}): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [
      createTestNode({ id: 1, label: "a" }),
      createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
      createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 100 }),
    ],
    relations: [
      relation({ id: 10, fromId: 1, toId: 2 }),
      relation({ id: 11, fromId: 2, toId: 3 }),
    ],
    groups: [
      group({ id: 20, nodeIds: [1, 2, 3], label: "all" }),
      group({ id: 21, nodeIds: [2, 3], label: "kids" }),
    ],
    ...extra,
  };
}

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

describe("useNodes relations/groups GC・統合・貼付・永続化", () => {
  it("枝削除で端点欠損 relation とメンバー不足 group を GC する", () => {
    const { result } = renderNodes(baseState());
    act(() => {
      result.current.deleteNode(2);
    });
    expect(result.current.relations).toBeUndefined();
    expect(result.current.groups).toEqual([group({ id: 20, nodeIds: [1, 3], label: "all" })]);
  });

  it("ノードだけ削除でも同様に GC する", () => {
    const { result } = renderNodes(baseState());
    const visible = new Set([1, 2, 3]);
    act(() => {
      expect(result.current.deleteNodeOnly(2, visible)).toEqual({ ok: true, deletedId: 2 });
    });
    expect(result.current.relations).toBeUndefined();
    expect(result.current.groups).toEqual([group({ id: 20, nodeIds: [1, 3], label: "all" })]);
  });

  it("統合で rewriteAfterNodeMerge（自己ループ削除・衝突は id 昇順）", () => {
    const initial = baseState({
      relations: [
        relation({ id: 30, fromId: 2, toId: 1, directed: true }),
        relation({ id: 31, fromId: 2, toId: 3 }),
        relation({ id: 32, fromId: 3, toId: 1, directed: true }),
        relation({ id: 33, fromId: 3, toId: 2 }),
      ],
      groups: [
        group({ id: 40, nodeIds: [1, 2, 3], label: "g" }),
        group({ id: 41, nodeIds: [2, 3] }),
      ],
    });
    const { result } = renderNodes(initial);
    const visible = new Set([1, 2, 3]);
    // 兄弟 2 と 3 を統合（survivor=2）
    const plan = planNodeMerge(result.current.nodes, [2, 3], 2, "、", visible, MAP_ID);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    act(() => {
      expect(result.current.mergeNodes([2, 3], 2, "、", visible, plan, MAP_ID)).toEqual({
        ok: true,
        survivorId: 2,
        absorbedCount: 1,
      });
    });

    // 31: 2-3 → 自己ループ削除。33: 3-2 → 自己ループ削除。
    // 30: 2→1 のまま。32: 3→1 → 2→1 で 30 と衝突し id 昇順で 30 が残る。
    expect(result.current.relations).toEqual([
      relation({ id: 30, fromId: 2, toId: 1, directed: true }),
    ]);
    expect(result.current.groups).toEqual([
      group({ id: 40, nodeIds: [1, 2], label: "g" }),
    ]);
  });

  it("貼付で閉じた relation/group を新 ID で state にマージする", () => {
    const { result } = renderNodes(baseState());
    let pastedRoot: number | null = null;
    act(() => {
      const copied = result.current.copySubtree(1);
      expect(copied.ok).toBe(true);
      if (!copied.ok) return;
      const decoded = decodeSubtreeClipboard(copied.value);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(decoded.value.relations).toEqual([
        relation({ id: 10, fromId: 1, toId: 2 }),
        relation({ id: 11, fromId: 2, toId: 3 }),
      ]);
      pastedRoot = result.current.pasteSubtree(decoded.value);
    });
    expect(pastedRoot).not.toBeNull();
    expect((result.current.relations ?? []).length).toBe(4);
    expect((result.current.groups ?? []).length).toBe(4);
    const entityIds = new Set([
      ...result.current.nodes.map((node) => node.id),
      ...(result.current.relations ?? []).map((item) => item.id),
      ...(result.current.groups ?? []).map((item) => item.id),
    ]);
    expect(entityIds.size).toBe(
      result.current.nodes.length
        + (result.current.relations ?? []).length
        + (result.current.groups ?? []).length,
    );
  });

  it("複製で閉じた relation/group を新 entity ID で state にマージする", () => {
    const { result } = renderNodes(baseState());
    const beforeRelationIds = new Set((result.current.relations ?? []).map((item) => item.id));
    const beforeGroupIds = new Set((result.current.groups ?? []).map((item) => item.id));
    let copiedRoot: number | null = null;
    act(() => {
      copiedRoot = result.current.duplicateSubtree(1);
    });
    expect(copiedRoot).not.toBeNull();
    expect((result.current.relations ?? []).length).toBe(4);
    expect((result.current.groups ?? []).length).toBe(4);
    const addedRelations = (result.current.relations ?? []).filter((item) => !beforeRelationIds.has(item.id));
    const addedGroups = (result.current.groups ?? []).filter((item) => !beforeGroupIds.has(item.id));
    expect(addedRelations).toHaveLength(2);
    expect(addedGroups).toHaveLength(2);
    const copies = result.current.nodes.slice(3);
    expect(copies).toHaveLength(3);
    const [copyRoot, copyB, copyC] = copies;
    expect(addedRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromId: copyRoot!.id, toId: copyB!.id }),
        expect.objectContaining({ fromId: copyB!.id, toId: copyC!.id }),
      ]),
    );
    expect(addedGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeIds: [copyRoot!.id, copyB!.id, copyC!.id], label: "all" }),
        expect.objectContaining({ nodeIds: [copyB!.id, copyC!.id], label: "kids" }),
      ]),
    );
    const entityIds = new Set([
      ...result.current.nodes.map((node) => node.id),
      ...(result.current.relations ?? []).map((item) => item.id),
      ...(result.current.groups ?? []).map((item) => item.id),
    ]);
    expect(entityIds.size).toBe(
      result.current.nodes.length
        + (result.current.relations ?? []).length
        + (result.current.groups ?? []).length,
    );
  });

  it("createMapDocument 往復で relations/groups が残る", () => {
    const state = baseState({ treeDirection: "tb" });
    const json = serializeMapDocument(createMapDocument(
      state.nodes,
      state.layoutMode,
      mapDocumentOptionsFromState(state),
    ));
    const parsed = parseMapDocumentJson(json);
    expect(parsed).toEqual({
      ok: true,
      value: {
        version: 3,
        layoutMode: "manual",
        treeDirection: "tb",
        nodes: state.nodes,
        relations: state.relations,
        groups: state.groups,
      },
    });
  });
});
