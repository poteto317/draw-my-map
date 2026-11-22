import { act, renderHook } from "@testing-library/react";
import { createTestNode } from "@/testing/createTestNode";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import {
  PARTS_STORAGE_KEY,
  readParts,
  writeParts,
} from "@/services/persistence/partsStorage";
import { encodePartsStore } from "@/domain/parts/partsCodec";
import {
  createEmptyPartsStore,
  MAX_PART_NAME,
  MAX_PART_NODES,
  type Part,
} from "@/domain/parts/partsModel";
import { resolveSelectionTargetIds } from "@/domain/exportScope/resolveSelectionTargetIds";
import { usePartsLibrary } from "@/hooks/usePartsLibrary";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

const NOW = "2026-11-22T12:00:00.000Z";

function node(
  id: number,
  parentId: number | null,
  overrides: Partial<Node> = {},
): Node {
  return createTestNode({
    id,
    parentId,
    x: id * 10,
    y: id * 20,
    label: `n${id}`,
    ...overrides,
  });
}

function samplePart(overrides: Partial<Part> = {}): Part {
  return {
    id: "part-1",
    name: "議事メモ",
    createdAt: "2026-11-22T00:00:00.000Z",
    nodes: [node(1, null, { label: "根" }), node(2, 1, { label: "子" })],
    ...overrides,
  };
}

type SetupOptions = {
  nodes?: Node[];
  viewMode?: "map" | "outline";
  selectedNodeId?: number | null;
  selectedNodeIds?: readonly number[];
  storage?: ReturnType<typeof createRecordingStorage>["storage"];
  insertSubtree?: (
    sources: readonly Node[],
    sourceRootId: number,
    targetParentId: number | null,
  ) => number | null;
};

function setup(options: SetupOptions = {}) {
  const storage = options.storage ?? createRecordingStorage().storage;
  const publishNotice = jest.fn() as jest.MockedFunction<(notice: OperationNotice) => void>;
  const insertSubtree =
    options.insertSubtree ??
    jest.fn(() => 100);

  const viewMode = options.viewMode ?? "map";
  const selectedNodeId =
    options.selectedNodeId === undefined ? 1 : options.selectedNodeId;
  const selectedNodeIds =
    options.selectedNodeIds ?? (selectedNodeId === null ? [] : [selectedNodeId]);
  const nodes = options.nodes ?? [
    node(1, null, { label: "親" }),
    node(2, 1, { label: "子" }),
    node(3, null, { label: "別ルート" }),
  ];
  const selectionTargetIds = resolveSelectionTargetIds(
    viewMode,
    selectedNodeId,
    selectedNodeIds,
  );

  const hook = renderHook(() =>
    usePartsLibrary({
      storage,
      nodes,
      selectionTargetIds,
      insertSubtree,
      publishNotice,
      now: () => NOW,
    }),
  );

  return { hook, storage, publishNotice, insertSubtree, selectionTargetIds };
}

describe("usePartsLibrary", () => {
  it("選択 0 / 2+ では register と insert-child が不可（map 複数選択 + outline の resolveSelectionTargetIds）", () => {
    const mapNone = setup({ selectedNodeId: null, selectedNodeIds: [] });
    expect(mapNone.hook.result.current.canRegister).toBe(false);
    expect(mapNone.hook.result.current.canInsertChild).toBe(false);

    const mapMulti = setup({ selectedNodeId: 1, selectedNodeIds: [1, 2] });
    expect(mapMulti.hook.result.current.canRegister).toBe(false);
    expect(mapMulti.hook.result.current.canInsertChild).toBe(false);

    const outlineNone = setup({
      viewMode: "outline",
      selectedNodeId: null,
      selectedNodeIds: [1, 2],
    });
    expect(outlineNone.hook.result.current.canRegister).toBe(false);
    expect(outlineNone.hook.result.current.canInsertChild).toBe(false);

    const outlineOne = setup({
      viewMode: "outline",
      selectedNodeId: 2,
      selectedNodeIds: [1, 2],
    });
    expect(outlineOne.hook.result.current.canRegister).toBe(true);
    expect(outlineOne.hook.result.current.canInsertChild).toBe(true);

    act(() => {
      expect(
        mapMulti.hook.result.current.registerPartFromSelection("x"),
      ).toEqual({ ok: false, reason: "selection" });
      expect(
        mapMulti.hook.result.current.insertPart("part-1", "child"),
      ).toEqual({ ok: false, reason: "selection" });
    });
  });

  it("insert root でトップレベルが 1 本・parentId は null", () => {
    const part = samplePart();
    const { storage } = createRecordingStorage({
      initial: {
        [PARTS_STORAGE_KEY]: encodePartsStore({ version: 1, parts: [part] }),
      },
    });
    const inserted: Array<{
      sources: readonly Node[];
      sourceRootId: number;
      targetParentId: number | null;
    }> = [];
    const h = setup({
      storage,
      insertSubtree: (sources, sourceRootId, targetParentId) => {
        inserted.push({ sources, sourceRootId, targetParentId });
        return 42;
      },
    });

    let result: { ok: boolean } | undefined;
    act(() => {
      result = h.hook.result.current.insertPart(part.id, "root");
    });

    expect(result).toEqual({ ok: true });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.targetParentId).toBeNull();
    expect(inserted[0]!.sourceRootId).toBe(1);
    const roots = inserted[0]!.sources.filter((n) => n.parentId === null);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.id).toBe(1);
  });

  it("deletePart 後に一覧から消え、再読込マージされる", () => {
    const kept = samplePart({ id: "keep", name: "残す" });
    const gone = samplePart({ id: "gone", name: "消す" });
    const { storage } = createRecordingStorage({
      initial: {
        [PARTS_STORAGE_KEY]: encodePartsStore({
          version: 1,
          parts: [kept, gone],
        }),
      },
    });
    const h = setup({ storage });

    act(() => {
      h.hook.result.current.refresh();
    });
    expect(h.hook.result.current.parts.map((p) => p.id)).toEqual(["keep", "gone"]);

    // 別経路で extra を追加し、delete が最新読取マージすることを検証
    writeParts(storage, {
      version: 1,
      parts: [kept, gone, samplePart({ id: "extra", name: "追加" })],
    });

    act(() => {
      expect(h.hook.result.current.deletePart("gone")).toEqual({ ok: true });
    });

    expect(h.hook.result.current.parts.map((p) => p.id)).toEqual(["keep", "extra"]);
    expect(readParts(storage)).toEqual({
      status: "ok",
      store: {
        version: 1,
        parts: [kept, samplePart({ id: "extra", name: "追加" })],
      },
      repaired: false,
    });
  });

  it("name が MAX_PART_NAME を超えると register 失敗しストアを変えない", () => {
    const h = setup({
      selectedNodeId: 1,
      selectedNodeIds: [1],
    });

    act(() => {
      expect(
        h.hook.result.current.registerPartFromSelection("あ".repeat(MAX_PART_NAME + 1)),
      ).toEqual({
        ok: false,
        reason: "name-too-long",
      });
    });
    expect(h.publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: expect.stringMatching(/部品名|文字以内|長/),
    });
    expect(readParts(h.storage)).toEqual({
      status: "ok",
      store: createEmptyPartsStore(),
      repaired: false,
    });
  });

  it("name がちょうど MAX_PART_NAME なら register できる", () => {
    const h = setup({
      selectedNodeId: 1,
      selectedNodeIds: [1],
    });
    const name = "あ".repeat(MAX_PART_NAME);

    act(() => {
      expect(h.hook.result.current.registerPartFromSelection(name)).toEqual({ ok: true });
    });

    const read = readParts(h.storage);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.store.parts).toHaveLength(1);
    expect(read.store.parts[0]!.name).toBe(name);
  });

  it("buildPartFromSubtree が too-large のとき register 失敗", () => {
    const huge: Node[] = [node(1, null)];
    for (let id = 2; id <= MAX_PART_NODES + 1; id += 1) {
      huge.push(node(id, 1));
    }
    const h = setup({
      selectedNodeId: 1,
      selectedNodeIds: [1],
      nodes: huge,
    });

    act(() => {
      expect(h.hook.result.current.registerPartFromSelection("巨大")).toEqual({
        ok: false,
        reason: "too-large",
      });
    });
    expect(h.publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: expect.stringMatching(/大きすぎ|上限|ノード/),
    });
    expect(readParts(h.storage)).toEqual({
      status: "ok",
      store: createEmptyPartsStore(),
      repaired: false,
    });
  });

  it("quota-exceeded で notice を出す", () => {
    const { storage } = createRecordingStorage({
      failSetItem: () => true,
    });
    const h = setup({
      storage,
      selectedNodeId: 1,
      selectedNodeIds: [1],
    });

    act(() => {
      expect(h.hook.result.current.registerPartFromSelection("メモ")).toEqual({
        ok: false,
        reason: "quota-exceeded",
      });
    });
    expect(h.publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: expect.stringMatching(/容量|保存/),
    });
  });

  it("単一選択で register すると最新読取へ append する", () => {
    const existing = samplePart({ id: "old", name: "既存" });
    const { storage } = createRecordingStorage({
      initial: {
        [PARTS_STORAGE_KEY]: encodePartsStore({ version: 1, parts: [existing] }),
      },
    });
    writeParts(storage, {
      version: 1,
      parts: [existing, samplePart({ id: "other", name: "他" })],
    });

    const h = setup({
      storage,
      selectedNodeId: 1,
      selectedNodeIds: [1],
      nodes: [node(1, null, { label: "親" }), node(2, 1, { label: "子" })],
    });

    act(() => {
      expect(h.hook.result.current.registerPartFromSelection("新規")).toEqual({
        ok: true,
      });
    });

    const read = readParts(storage);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.store.parts.map((p) => p.name)).toEqual(["既存", "他", "新規"]);
    const registered = read.store.parts[2]!;
    expect(registered.nodes.map((n) => n.id)).toEqual([1, 2]);
    expect(registered.nodes[0]!.parentId).toBeNull();
  });
});
