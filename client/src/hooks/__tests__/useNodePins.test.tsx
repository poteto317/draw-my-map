import { act, renderHook } from "@testing-library/react";
import { encodeNodePinsStore, withMapPins } from "@/domain/pins/pinsCodec";
import {
  createEmptyNodePinsStore,
  MAX_PINS_PER_MAP,
  type NodePin,
} from "@/domain/pins/pinsModel";
import { resolveSelectionTargetIds } from "@/domain/exportScope/resolveSelectionTargetIds";
import {
  NODE_PINS_STORAGE_KEY,
  readPins,
  writePins,
} from "@/services/persistence/nodePinsStorage";
import { useNodePins } from "@/hooks/useNodePins";
import { createTestNode } from "@/testing/createTestNode";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";
import type { NodeSearchNavigationResult } from "@/hooks/useNodeSearchNavigation";

const NOW = "2026-11-22T12:00:00.000Z";
const MAP_ID = "map-1";

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

const SAMPLE_PIN: NodePin = {
  nodeId: 1,
  createdAt: "2026-11-22T00:00:00.000Z",
};

type SetupOptions = {
  nodes?: Node[];
  viewMode?: "map" | "outline";
  selectedNodeId?: number | null;
  selectedNodeIds?: readonly number[];
  storage?: ReturnType<typeof createRecordingStorage>["storage"];
  mapId?: string;
  navigateToNode?: (nodeId: number) => NodeSearchNavigationResult;
};

function setup(options: SetupOptions = {}) {
  const storage = options.storage ?? createRecordingStorage().storage;
  const publishNotice = jest.fn() as jest.MockedFunction<(notice: OperationNotice) => void>;
  const navigateToNode =
    options.navigateToNode ??
    jest.fn((nodeId: number): NodeSearchNavigationResult => {
      const exists = (options.nodes ?? [node(1, null)]).some((n) => n.id === nodeId);
      return exists ? "navigated" : "missing";
    });

  const viewMode = options.viewMode ?? "map";
  const selectedNodeId =
    options.selectedNodeId === undefined ? 1 : options.selectedNodeId;
  const selectedNodeIds =
    options.selectedNodeIds ?? (selectedNodeId === null ? [] : [selectedNodeId]);
  const nodes = options.nodes ?? [
    node(1, null, { label: "親" }),
    node(2, 1, { label: "子" }),
  ];
  const selectionTargetIds = resolveSelectionTargetIds(
    viewMode,
    selectedNodeId,
    selectedNodeIds,
  );

  const hook = renderHook(
    (props: {
      nodes: readonly Node[];
      selectionTargetIds: readonly number[];
    }) =>
      useNodePins({
        storage,
        mapId: options.mapId ?? MAP_ID,
        nodes: props.nodes,
        selectionTargetIds: props.selectionTargetIds,
        publishNotice,
        navigateToNode,
        now: () => NOW,
      }),
    {
      initialProps: { nodes, selectionTargetIds },
    },
  );

  return { hook, storage, publishNotice, navigateToNode, nodes, selectionTargetIds };
}

describe("useNodePins", () => {
  it("選択 0 / 2+ では canRegister が false で register 失敗", () => {
    const none = setup({ selectedNodeId: null, selectedNodeIds: [] });
    expect(none.hook.result.current.canRegister).toBe(false);

    const multi = setup({ selectedNodeId: 1, selectedNodeIds: [1, 2] });
    expect(multi.hook.result.current.canRegister).toBe(false);

    act(() => {
      expect(multi.hook.result.current.registerPin()).toEqual({
        ok: false,
        reason: "selection",
      });
    });
    expect(multi.publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: expect.stringMatching(/1 つ|ひとつ|1件/),
    });
  });

  it("単一選択で register するとピンが追加される", () => {
    const h = setup({ selectedNodeId: 2, selectedNodeIds: [2] });

    act(() => {
      expect(h.hook.result.current.registerPin()).toEqual({ ok: true });
    });

    expect(h.hook.result.current.pins).toEqual([
      { nodeId: 2, createdAt: NOW },
    ]);
    expect(readPins(h.storage, MAP_ID)).toEqual({
      status: "ok",
      pins: [{ nodeId: 2, createdAt: NOW }],
      repaired: false,
    });
  });

  it("既にピン済みなら already-pinned でストアを変えない", () => {
    const { storage } = createRecordingStorage({
      initial: {
        [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(
          withMapPins(createEmptyNodePinsStore(), MAP_ID, [SAMPLE_PIN]),
        ),
      },
    });
    const h = setup({ storage, selectedNodeId: 1, selectedNodeIds: [1] });

    act(() => {
      expect(h.hook.result.current.registerPin()).toEqual({
        ok: false,
        reason: "already-pinned",
      });
    });
    expect(readPins(storage, MAP_ID)).toEqual({
      status: "ok",
      pins: [SAMPLE_PIN],
      repaired: false,
    });
  });

  it("上限 50 件で register 失敗", () => {
    const pins: NodePin[] = Array.from({ length: MAX_PINS_PER_MAP }, (_, i) => ({
      nodeId: i + 10,
      createdAt: NOW,
    }));
    const nodes = [
      node(1, null),
      ...pins.map((pin) => node(pin.nodeId, 1)),
    ];
    const { storage } = createRecordingStorage({
      initial: {
        [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(
          withMapPins(createEmptyNodePinsStore(), MAP_ID, pins),
        ),
      },
    });
    const h = setup({
      storage,
      nodes,
      selectedNodeId: 1,
      selectedNodeIds: [1],
    });

    act(() => {
      expect(h.hook.result.current.registerPin()).toEqual({
        ok: false,
        reason: "too-many",
      });
    });
  });

  it("quota-exceeded で notice を出し一覧を確定更新しない", () => {
    const { storage } = createRecordingStorage({
      failSetItem: () => true,
    });
    const h = setup({ storage, selectedNodeId: 1, selectedNodeIds: [1] });

    act(() => {
      expect(h.hook.result.current.registerPin()).toEqual({
        ok: false,
        reason: "quota-exceeded",
      });
    });
    expect(h.hook.result.current.pins).toEqual([]);
    expect(h.publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: expect.stringMatching(/容量|保存/),
    });
  });

  it("deletePin で一覧から消え、最新読取マージする", () => {
    const kept: NodePin = { nodeId: 1, createdAt: NOW };
    const gone: NodePin = { nodeId: 2, createdAt: NOW };
    const { storage } = createRecordingStorage({
      initial: {
        [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(
          withMapPins(createEmptyNodePinsStore(), MAP_ID, [kept, gone]),
        ),
      },
    });
    const h = setup({
      storage,
      nodes: [node(1, null), node(2, 1), node(3, 1)],
      selectedNodeId: 1,
      selectedNodeIds: [1],
    });

    writePins(storage, MAP_ID, [
      kept,
      gone,
      { nodeId: 3, createdAt: NOW },
    ]);

    act(() => {
      expect(h.hook.result.current.deletePin(2)).toEqual({ ok: true });
    });

    expect(h.hook.result.current.pins.map((p) => p.nodeId)).toEqual([1, 3]);
  });

  it("jumpToPin 成功時だけ navigateToNode を呼ぶ", () => {
    const { storage } = createRecordingStorage({
      initial: {
        [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(
          withMapPins(createEmptyNodePinsStore(), MAP_ID, [SAMPLE_PIN]),
        ),
      },
    });
    const navigateToNode = jest.fn((): NodeSearchNavigationResult => "navigated");
    const h = setup({
      storage,
      navigateToNode,
      nodes: [node(1, null)],
    });

    act(() => {
      expect(h.hook.result.current.jumpToPin(1)).toEqual({ ok: true });
    });
    expect(navigateToNode).toHaveBeenCalledWith(1);
  });

  it("ジャンプ失敗時はフォーカス副作用を呼ばない（L-001）", () => {
    const { storage } = createRecordingStorage({
      initial: {
        [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(
          withMapPins(createEmptyNodePinsStore(), MAP_ID, [SAMPLE_PIN]),
        ),
      },
    });
    const navigateToNode = jest.fn((): NodeSearchNavigationResult => "navigated");
    const h = setup({
      storage,
      navigateToNode,
      nodes: [node(1, null)],
    });

    act(() => {
      expect(h.hook.result.current.jumpToPin(99)).toEqual({
        ok: false,
        reason: "pin-missing",
      });
    });
    expect(navigateToNode).not.toHaveBeenCalled();

    const navigateMissing = jest.fn((): NodeSearchNavigationResult => "missing");
    const missingNav = setup({
      storage,
      navigateToNode: navigateMissing,
      nodes: [node(1, null)],
    });
    act(() => {
      expect(missingNav.hook.result.current.jumpToPin(1)).toEqual({
        ok: false,
        reason: "jump-failed",
      });
    });
    expect(navigateMissing).toHaveBeenCalledWith(1);
  });

  it("読込時・nodes 変化時に不在 nodeId を除去して書き戻す", () => {
    const { storage } = createRecordingStorage({
      initial: {
        [NODE_PINS_STORAGE_KEY]: encodeNodePinsStore(
          withMapPins(createEmptyNodePinsStore(), MAP_ID, [
            SAMPLE_PIN,
            { nodeId: 99, createdAt: NOW },
          ]),
        ),
      },
    });
    const h = setup({
      storage,
      nodes: [node(1, null)],
    });

    expect(h.hook.result.current.pins).toEqual([SAMPLE_PIN]);
    expect(readPins(storage, MAP_ID)).toEqual({
      status: "ok",
      pins: [SAMPLE_PIN],
      repaired: false,
    });

    act(() => {
      h.hook.rerender({
        nodes: [],
        selectionTargetIds: [],
      });
    });

    expect(h.hook.result.current.pins).toEqual([]);
    expect(readPins(storage, MAP_ID)).toEqual({
      status: "ok",
      pins: [],
      repaired: false,
    });
  });

  it("corrupt 読取は空成功にせず notice（L-002）", () => {
    const { storage } = createRecordingStorage({
      initial: { [NODE_PINS_STORAGE_KEY]: "{broken" },
    });
    const h = setup({ storage });

    expect(h.hook.result.current.pins).toEqual([]);
    expect(h.publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: expect.stringMatching(/破損|読み取れ/),
    });
  });
});
