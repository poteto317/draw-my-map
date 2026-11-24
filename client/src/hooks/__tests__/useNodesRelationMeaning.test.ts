import { act, renderHook } from "@testing-library/react";
import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { mapDocumentOptionsFromState } from "@/domain/persistence/mapDocumentState";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { MapRelation } from "@/types/mapRelation";
import type { NodeMapState } from "@/types/nodeMapState";

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return { kind: "related", directed: false, ...partial };
}

function baseState(extra: Partial<NodeMapState> = {}): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [
      createTestNode({ id: 1, label: "a" }),
      createTestNode({ id: 2, parentId: 1, label: "b", x: 200 }),
      createTestNode({ id: 3, parentId: 1, label: "c", x: 200, y: 100 }),
      createTestNode({ id: 4, parentId: 1, label: "locked", x: 200, y: 200, locked: true }),
    ],
    ...extra,
  };
}

function renderNodes(initial: NodeMapState = baseState()) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

describe("useNodes updateRelation（意味付け）", () => {
  it("kind / directed を更新する", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));

    act(() => {
      expect(result.current.updateRelation(10, { kind: "dependency" })).toEqual({ ok: true });
    });
    expect(result.current.relations).toEqual([
      relation({ id: 10, fromId: 1, toId: 2, kind: "dependency" }),
    ]);

    act(() => {
      expect(result.current.updateRelation(10, { directed: true })).toEqual({ ok: true });
    });
    expect(result.current.relations).toEqual([
      relation({ id: 10, fromId: 1, toId: 2, kind: "dependency", directed: true }),
    ]);
  });

  it("更新時の重複は拒否し、状態を変えない", () => {
    const existing = [
      relation({ id: 10, fromId: 1, toId: 2, directed: true }),
      relation({ id: 11, fromId: 2, toId: 1, directed: true, kind: "conflict" }),
    ];
    const { result } = renderNodes(baseState({ relations: existing }));

    act(() => {
      expect(result.current.updateRelation(10, { directed: false })).toEqual({
        ok: false,
        reason: "duplicate",
      });
    });
    expect(result.current.relations).toEqual(existing);
  });

  it("kind / directed の変更は Undo できる", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));

    act(() => {
      expect(result.current.updateRelation(10, { kind: "reference", directed: true })).toEqual({
        ok: true,
      });
    });
    expect(result.current.relations![0]).toMatchObject({ kind: "reference", directed: true });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.relations).toEqual([
      relation({ id: 10, fromId: 1, toId: 2 }),
    ]);
  });

  it("関与 locked は拒否する", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 4 })],
    }));
    act(() => {
      expect(result.current.updateRelation(10, { kind: "conflict" })).toEqual({
        ok: false,
        reason: "locked",
      });
    });
  });

  it("更新後の kind/directed は codec 往復で残る", () => {
    const { result } = renderNodes(baseState({
      relations: [relation({ id: 10, fromId: 1, toId: 2 })],
    }));
    act(() => {
      expect(result.current.updateRelation(10, { kind: "dependency", directed: true })).toEqual({
        ok: true,
      });
    });

    const state: NodeMapState = {
      layoutMode: result.current.layoutMode,
      treeDirection: result.current.treeDirection,
      layoutSpacing: result.current.layoutSpacing,
      nodes: result.current.nodes,
      relations: result.current.relations,
      groups: result.current.groups,
    };
    const json = serializeMapDocument(createMapDocument(
      state.nodes,
      state.layoutMode,
      mapDocumentOptionsFromState(state),
    ));
    const parsed = parseMapDocumentJson(json);
    expect(parsed).toEqual({
      ok: true,
      value: expect.objectContaining({
        relations: [
          relation({ id: 10, fromId: 1, toId: 2, kind: "dependency", directed: true }),
        ],
      }),
    });
  });
});
