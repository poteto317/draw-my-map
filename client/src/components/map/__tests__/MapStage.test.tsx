import { act, fireEvent } from "@testing-library/react";
import {
  Suspense,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Graphics } from "pixi.js";
import { MapStage } from "@/components/map/MapStage";
import {
  lastWorldContainer,
  mockContainers,
  mockNodePointerHandlers,
  mockStage,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { AutoLayoutMapStageHarness } from "@/components/map/testing/AutoLayoutMapStageHarness";
import { CHILD_HORIZONTAL_GAP } from "@/config/shapes";
import { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import { createTestMapHistoryLease } from "@/testing/createTestMapHistoryLease";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

const defaultProps = {
  nodes: [] as Node[],
  focusRequest: null,
  selectedNodeId: null as number | null,
  onDoubleClick: jest.fn(),
  onAddChildNode: jest.fn(() => null),
  onAddSiblingNode: jest.fn(() => null),
  onSelectNode: jest.fn(),
  onUpdateLabel: jest.fn(),
  onMoveNode: jest.fn(),
  onBeginNodeMove: createTestMapHistoryLease,
  documentRevision: 0,
  onConnectNodes: jest.fn(),
  onDeleteNode: jest.fn(),
  onCopySubtree: jest.fn(() => ({ ok: false, reason: "invalid" }) as const),
  onPasteSubtree: jest.fn(() => null),
  onClipboardNotice: jest.fn(),
  shortcutsEnabled: true,
  dialogMouseClickedAtRef: { current: null },
  layoutMode: "manual" as const,
  onReorderSibling: jest.fn(),
  onChangeNodeIndent: jest.fn(),
};

const sampleNodes: Node[] = [
  createTestNode({ id: 1, x: 50, y: 30, label: "ノード1" }),
  createTestNode({ id: 2, x: 200, y: 100, label: "ノード2" }),
];

function KeyboardCreationHarness({ initiallySelected = true }: { initiallySelected?: boolean }) {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    beginMoveHistory,
    connectNodes,
    deleteNode,
    copySubtree,
    pasteSubtree,
    documentRevision,
  } = useNodes();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const rootId = addNode(100, 60);
    if (initiallySelected) selectNode(rootId);
  }, [addNode, initiallySelected, selectNode]);

  return (
    <>
      <MapStage
        nodes={nodes}
        focusRequest={null}
        selectedNodeId={selectedNodeId}
        onDoubleClick={addNode}
        onAddChildNode={addChildNode}
        onAddSiblingNode={addSiblingNode}
        onSelectNode={selectNode}
        onUpdateLabel={updateNodeLabel}
        onMoveNode={moveNode}
        onBeginNodeMove={beginMoveHistory}
        onConnectNodes={connectNodes}
        onDeleteNode={deleteNode}
        onCopySubtree={copySubtree}
        onPasteSubtree={pasteSubtree}
        onClipboardNotice={() => {}}
        documentRevision={documentRevision}
        shortcutsEnabled
        dialogMouseClickedAtRef={{ current: null }}
        layoutMode="manual"
        onReorderSibling={() => {}}
        onChangeNodeIndent={() => {}}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
    </>
  );
}

function MouseConnectionHarness() {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    beginMoveHistory,
    connectNodes,
    deleteNode,
    copySubtree,
    pasteSubtree,
    documentRevision,
  } = useNodes();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    addNode(50, 30);
    addNode(200, 100);
  }, [addNode]);

  return (
    <>
      <MapStage
        nodes={nodes}
        focusRequest={null}
        selectedNodeId={selectedNodeId}
        onDoubleClick={addNode}
        onAddChildNode={addChildNode}
        onAddSiblingNode={addSiblingNode}
        onSelectNode={selectNode}
        onUpdateLabel={updateNodeLabel}
        onMoveNode={moveNode}
        onBeginNodeMove={beginMoveHistory}
        onConnectNodes={connectNodes}
        onDeleteNode={deleteNode}
        onCopySubtree={copySubtree}
        onPasteSubtree={pasteSubtree}
        onClipboardNotice={() => {}}
        documentRevision={documentRevision}
        shortcutsEnabled
        dialogMouseClickedAtRef={{ current: null }}
        layoutMode="manual"
        onReorderSibling={() => {}}
        onChangeNodeIndent={() => {}}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
    </>
  );
}

function SubtreeMoveHarness() {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    beginMoveHistory,
    connectNodes,
    deleteNode,
    copySubtree,
    pasteSubtree,
    documentRevision,
  } = useNodes();
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const rootId = addNode(100, 100);
    const childId = addChildNode(rootId)!;
    addChildNode(childId);
    addNode(600, 100);
  }, [addNode, addChildNode]);

  return (
    <>
      <MapStage
        nodes={nodes}
        focusRequest={null}
        selectedNodeId={selectedNodeId}
        onDoubleClick={addNode}
        onAddChildNode={addChildNode}
        onAddSiblingNode={addSiblingNode}
        onSelectNode={selectNode}
        onUpdateLabel={updateNodeLabel}
        onMoveNode={moveNode}
        onBeginNodeMove={beginMoveHistory}
        onConnectNodes={connectNodes}
        onDeleteNode={deleteNode}
        onCopySubtree={copySubtree}
        onPasteSubtree={pasteSubtree}
        onClipboardNotice={() => {}}
        documentRevision={documentRevision}
        shortcutsEnabled
        dialogMouseClickedAtRef={{ current: null }}
        layoutMode="manual"
        onReorderSibling={() => {}}
        onChangeNodeIndent={() => {}}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
    </>
  );
}

const pendingRender = new Promise<never>(() => {});

function SuspendPendingRender(): never {
  throw pendingRender;
}

type ConcurrentInteractionHarnessProps = {
  onReady: (startUpdate: () => void) => void;
  committedNode: Node;
  pendingNode: Node;
  committedOnSelectNode: (id: number | null) => void;
  pendingOnSelectNode: (id: number | null) => void;
  committedOnMoveNode: (id: number, x: number, y: number) => void;
  pendingOnMoveNode: (id: number, x: number, y: number) => void;
};

function ConcurrentInteractionHarness({
  onReady,
  committedNode,
  pendingNode,
  committedOnSelectNode,
  pendingOnSelectNode,
  committedOnMoveNode,
  pendingOnMoveNode,
}: ConcurrentInteractionHarnessProps) {
  const [isPendingRender, setIsPendingRender] = useState(false);

  useEffect(() => {
    onReady(() => {
      startTransition(() => setIsPendingRender(true));
    });
  }, [onReady]);

  return (
    <Suspense fallback={null}>
      <MapStage
        {...defaultProps}
        nodes={[isPendingRender ? pendingNode : committedNode]}
        onSelectNode={isPendingRender ? pendingOnSelectNode : committedOnSelectNode}
        onMoveNode={isPendingRender ? pendingOnMoveNode : committedOnMoveNode}
      />
      {isPendingRender && <SuspendPendingRender />}
    </Suspense>
  );
}

type ResetTimingHarnessProps = {
  onReady: (reset: () => void) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
};

function ResetTimingHarness({ onReady, onMoveNode }: ResetTimingHarnessProps) {
  const [resetRevision, setResetRevision] = useState(0);

  useEffect(() => {
    onReady(() => setResetRevision((revision) => revision + 1));
  }, [onReady]);

  useLayoutEffect(() => {
    if (resetRevision === 0) return;
    mockStageHandlers.pointermove?.(pointer(140, 100));
    mockStageHandlers.pointerup?.(pointer(140, 100));
  }, [resetRevision]);

  return (
    <MapStage
      {...defaultProps}
      nodes={sampleNodes}
      resetRevision={resetRevision}
      onMoveNode={onMoveNode}
    />
  );
}

beforeEach(() => {
  resetMapStageTestRuntime();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapStage boundary", () => {
  it("renders the map container", async () => {
    await renderReady(<MapStage {...defaultProps} />);

    expect(document.querySelector(".cursor-crosshair")).toBeInTheDocument();
  });

  it("unmount時に共有runtimeへ登録したstage listenerを解除する", async () => {
    const { unmount } = await renderReady(<MapStage {...defaultProps} />);
    const registeredHandlers = Object.entries(mockStageHandlers);

    expect(registeredHandlers.length).toBeGreaterThan(0);
    unmount();

    for (const [event, handler] of registeredHandlers) {
      expect(mockStage.off).toHaveBeenCalledWith(event, handler);
    }
    expect(Object.keys(mockStageHandlers)).toHaveLength(0);
  });

  it("親要素の実寸高を使い固定header高へ依存しない", async () => {
    await renderReady(<MapStage {...defaultProps} />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;

    expect(container).toHaveClass("h-full");
    expect(container.style.minHeight).toBe("");
  });

  it("routes a blank double-click with container-relative coordinates", async () => {
    const onDoubleClick = jest.fn();
    await renderReady(<MapStage {...defaultProps} onDoubleClick={onDoubleClick} />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container, 100, 50);

    fireEvent.doubleClick(container, { clientX: 300, clientY: 200 });

    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).toHaveBeenCalledWith(200, 150);
  });

  it("変換後座標が非有限のdouble-clickでは追加も編集もしない", async () => {
    const onDoubleClick = jest.fn();
    const { queryByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onDoubleClick={onDoubleClick} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container, -Number.MAX_VALUE, 0);

    fireEvent.doubleClick(container, { clientX: Number.MAX_VALUE, clientY: 0 });

    expect(onDoubleClick).not.toHaveBeenCalled();
    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
  });

  it("opens the editor for a node double-click", async () => {
    const { getByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

    expect(getByTestId("node-label-input")).toHaveValue("ノード1");
  });

  it("wheelでpointer位置をanchorにworld containerを拡大する", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 100,
        clientY: 100,
        deltaY: -100,
        cancelable: true,
      }));
    });

    expect(lastWorldContainer()?.scale.set).toHaveBeenCalledWith(Math.exp(0.1));
  });

  it("viewport更新ではworld containerを再生成せずtransformだけ変更する", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} />);
    const worldContainer = lastWorldContainer();
    const containerCount = mockContainers.length;
    const sceneAddCount = mockStage.addChild.mock.calls.length;

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
    });

    expect(lastWorldContainer()).toBe(worldContainer);
    expect(mockContainers).toHaveLength(containerCount);
    expect(mockStage.addChild).toHaveBeenCalledTimes(sceneAddCount);
    expect(worldContainer?.position.set).toHaveBeenLastCalledWith(20, 10);
  });

  it("scene再生成とviewport更新が同じcommitでもtransformを1回だけ適用する", async () => {
    const { rerender } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      rerender(
        <MapStage
          {...defaultProps}
          nodes={[...sampleNodes, createTestNode({
            id: 3,
            parentId: null,
            x: 300,
            y: 200,
            width: 100,
            height: 60,
            label: "追加ノード",
          })]}
        />,
      );
    });

    const updatedWorldContainer = lastWorldContainer();
    expect(updatedWorldContainer?.position.set).toHaveBeenCalledTimes(1);
    expect(updatedWorldContainer?.position.set).toHaveBeenCalledWith(20, 10);
    expect(updatedWorldContainer?.scale.set).toHaveBeenCalledTimes(1);
  });

  it("パン後の空白double-clickを変換済みworld座標で追加へ渡す", async () => {
    const onDoubleClick = jest.fn();
    await renderReady(<MapStage {...defaultProps} onDoubleClick={onDoubleClick} />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      mockStageHandlers.pointerup?.(pointer(20, 10));
    });
    fireEvent.doubleClick(container, { clientX: 220, clientY: 110 });

    expect(onDoubleClick).toHaveBeenCalledWith(200, 100);
  });

  it("ズーム後の変換済みnode位置でdouble-click編集を開始する", async () => {
    const { getByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );
    const canvas = document.querySelector("canvas")!;
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(canvas);
    mockStageBounds(container);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -10000,
        cancelable: true,
      }));
    });
    fireEvent.doubleClick(container, { clientX: 400, clientY: 240 });

    expect(getByTestId("node-label-input")).toHaveValue("ノード1");
  });

  it("ズーム後の画面差分をworld差分へ変換してノードを移動する", async () => {
    const onMoveNode = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onMoveNode={onMoveNode} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -10000,
        cancelable: true,
      }));
    });
    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(400, 240));
      mockStageHandlers.pointermove?.(pointer(440, 280));
    });

    expect(onMoveNode).toHaveBeenCalledWith(1, 60, 40);
  });

  it("ズーム後の画面座標から接続先ノードを判定する", async () => {
    const onConnectNodes = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onConnectNodes={onConnectNodes} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -10000,
        cancelable: true,
      }));
    });
    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(400, 240, { shiftKey: true }));
      mockStageHandlers.pointermove?.(pointer(1000, 520));
      mockStageHandlers.pointerup?.(pointer(1000, 520));
    });

    expect(onConnectNodes).toHaveBeenCalledWith(1, 2);
  });

  it("wheelズーム前に進行中のノード移動をキャンセルする", async () => {
    const onMoveNode = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onMoveNode={onMoveNode} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
    });
    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -100,
        cancelable: true,
      }));
    });
    act(() => {
      mockStageHandlers.pointermove?.(pointer(120, 80));
      mockStageHandlers.pointerup?.(pointer(120, 80));
    });

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("wheelズーム前に進行中のノード接続をキャンセルする", async () => {
    const onConnectNodes = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onConnectNodes={onConnectNodes} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60, { shiftKey: true }));
    });
    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -100,
        cancelable: true,
      }));
    });
    act(() => {
      mockStageHandlers.pointermove?.(pointer(250, 130));
      mockStageHandlers.pointerup?.(pointer(250, 130));
    });

    expect(onConnectNodes).not.toHaveBeenCalled();
  });

  it("Fキーで倍率を保ち選択ノードを中央へ移す", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);

    fireEvent.keyDown(window, { key: "f" });

    expect(lastWorldContainer()?.position.set).toHaveBeenCalledWith(300, 240);
    expect(lastWorldContainer()?.scale.set).toHaveBeenCalledWith(1);
  });

  it("外部focus要求で倍率を保ちノードを中央へ1回だけ移す", async () => {
    const { rerender } = await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} />);
    const request = { nodeId: 1, sequence: 1, documentRevision: 0 };

    rerender(<MapStage {...defaultProps} nodes={sampleNodes} focusRequest={request} />);

    const worldContainer = lastWorldContainer();
    expect(worldContainer?.position.set).toHaveBeenLastCalledWith(300, 240);
    expect(worldContainer?.scale.set).toHaveBeenLastCalledWith(1);

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      mockStageHandlers.pointerup?.(pointer(20, 10));
    });
    rerender(<MapStage {...defaultProps} nodes={[...sampleNodes]} focusRequest={request} />);

    expect(worldContainer?.position.set).toHaveBeenLastCalledWith(320, 250);
  });

  it("gesture中のFキーではviewportを変更しない", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);
    const worldContainerBeforeKeyDown = lastWorldContainer();
    const event = new KeyboardEvent("keydown", { key: "f", cancelable: true });

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(lastWorldContainer()).toBe(worldContainerBeforeKeyDown);
    expect(worldContainerBeforeKeyDown?.position.set).toHaveBeenCalledTimes(1);
    expect(worldContainerBeforeKeyDown?.position.set).toHaveBeenLastCalledWith(0, 0);
  });

  describe("shortcutsEnabled", () => {
    function dispatchCopy() {
      const event = new Event("copy", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { setData: jest.fn(), getData: jest.fn(() => "") },
      });
      document.body.dispatchEvent(event);
    }

    function fireShortcuts() {
      fireEvent.keyDown(window, { key: "Tab" });
      fireEvent.keyDown(window, { key: "Delete" });
      fireEvent.keyDown(window, { key: "f" });
      dispatchCopy();
    }

    it("falseの間は選択ノードがあってもTab・Delete・F・copyで何も呼ばない", async () => {
      const onAddChildNode = jest.fn(() => null);
      const onDeleteNode = jest.fn();
      const onCopySubtree = jest.fn(() => ({ ok: false, reason: "invalid" }) as const);
      await renderReady(
        <MapStage
          {...defaultProps}
          nodes={sampleNodes}
          selectedNodeId={1}
          shortcutsEnabled={false}
          onAddChildNode={onAddChildNode}
          onDeleteNode={onDeleteNode}
          onCopySubtree={onCopySubtree}
        />,
      );
      const worldContainer = lastWorldContainer();
      const positionCalls = worldContainer?.position.set.mock.calls.length;

      fireShortcuts();

      expect(onAddChildNode).not.toHaveBeenCalled();
      expect(onDeleteNode).not.toHaveBeenCalled();
      expect(onCopySubtree).not.toHaveBeenCalled();
      expect(lastWorldContainer()?.position.set.mock.calls.length).toBe(positionCalls);
    });

    it("falseからtrueへrerenderすると同じ操作が動く", async () => {
      const onAddChildNode = jest.fn(() => null);
      const onDeleteNode = jest.fn();
      const onCopySubtree = jest.fn(() => ({ ok: false, reason: "invalid" }) as const);
      const props = {
        ...defaultProps,
        nodes: sampleNodes,
        selectedNodeId: 1,
        onAddChildNode,
        onDeleteNode,
        onCopySubtree,
      };
      const { rerender } = await renderReady(<MapStage {...props} shortcutsEnabled={false} />);

      rerender(<MapStage {...props} shortcutsEnabled />);
      fireShortcuts();

      expect(onAddChildNode).toHaveBeenCalledWith(1);
      expect(onDeleteNode).toHaveBeenCalledWith(1);
      expect(onCopySubtree).toHaveBeenCalledWith(1);
      expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(300, 240);
    });
  });

  describe("ドラッグ中に shortcutsEnabled が false になったとき", () => {
    it("ノードの移動を中止し、その後の pointerup でも移動しない", async () => {
      const onMoveNode = jest.fn();
      const props = { ...defaultProps, nodes: sampleNodes, onMoveNode };
      const { rerender } = await renderReady(<MapStage {...props} />);

      act(() => {
        mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      });
      rerender(<MapStage {...props} shortcutsEnabled={false} />);
      act(() => {
        mockStageHandlers.pointermove?.(pointer(140, 100));
        mockStageHandlers.pointerup?.(pointer(140, 100));
      });

      expect(onMoveNode).not.toHaveBeenCalled();
    });

    it("Shift+ドラッグの接続を中止し、その後の pointerup でも接続しない", async () => {
      const onConnectNodes = jest.fn();
      const props = { ...defaultProps, nodes: sampleNodes, onConnectNodes };
      const { rerender } = await renderReady(<MapStage {...props} />);

      act(() => {
        mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60, { shiftKey: true }));
        mockStageHandlers.pointermove?.(pointer(250, 130));
      });
      rerender(<MapStage {...props} shortcutsEnabled={false} />);
      act(() => {
        mockStageHandlers.pointermove?.(pointer(250, 130));
        mockStageHandlers.pointerup?.(pointer(250, 130));
      });

      expect(onConnectNodes).not.toHaveBeenCalled();
    });

    it("true に戻した後は、新しいドラッグで移動と接続ができる", async () => {
      const onMoveNode = jest.fn();
      const onConnectNodes = jest.fn();
      const props = { ...defaultProps, nodes: sampleNodes, onMoveNode, onConnectNodes };
      const { rerender } = await renderReady(<MapStage {...props} />);

      act(() => {
        mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      });
      rerender(<MapStage {...props} shortcutsEnabled={false} />);
      rerender(<MapStage {...props} shortcutsEnabled />);
      act(() => {
        mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
        mockStageHandlers.pointermove?.(pointer(140, 100));
        mockStageHandlers.pointerup?.(pointer(140, 100));
      });
      act(() => {
        mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60, { shiftKey: true }));
        mockStageHandlers.pointermove?.(pointer(250, 130));
        mockStageHandlers.pointerup?.(pointer(250, 130));
      });

      expect(onMoveNode).toHaveBeenCalledWith(1, 90, 70);
      expect(onConnectNodes).toHaveBeenCalledWith(1, 2);
    });
  });

  describe("兄弟の順序のショートカット", () => {
    it("Alt+↑で選択中のノードを1つ上へ移す要求を onReorderSibling へ渡し、既定動作を止める", async () => {
      const onReorderSibling = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onReorderSibling={onReorderSibling} />,
      );

      const notCanceled = fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true });

      expect(onReorderSibling).toHaveBeenCalledTimes(1);
      expect(onReorderSibling).toHaveBeenCalledWith(1, { kind: "step", direction: "up" });
      expect(notCanceled).toBe(false);
    });

    it("shortcutsEnabled が false なら Alt+↑ で onReorderSibling を呼ばない", async () => {
      const onReorderSibling = jest.fn();
      await renderReady(
        <MapStage
          {...defaultProps}
          nodes={sampleNodes}
          selectedNodeId={1}
          shortcutsEnabled={false}
          onReorderSibling={onReorderSibling}
        />,
      );

      fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true });

      expect(onReorderSibling).not.toHaveBeenCalled();
    });

    it("ラベル編集中は Alt+↑ で onReorderSibling を呼ばない", async () => {
      const onReorderSibling = jest.fn();
      const { getByTestId } = await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onReorderSibling={onReorderSibling} />,
      );
      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      mockStageBounds(container);
      fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
      const input = getByTestId("node-label-input");

      fireEvent.keyDown(input, { key: "ArrowUp", altKey: true });
      fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true });

      expect(input).toBeInTheDocument();
      expect(onReorderSibling).not.toHaveBeenCalled();
    });

    it("Alt+Shift+↑ では onReorderSibling を呼ばない", async () => {
      const onReorderSibling = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onReorderSibling={onReorderSibling} />,
      );

      fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true, shiftKey: true });

      expect(onReorderSibling).not.toHaveBeenCalled();
    });
  });

  describe("階層の上げ下げのショートカット", () => {
    it("Alt+→で選択中のノードの階層を下げる要求を onChangeNodeIndent へ渡し、既定動作を止める", async () => {
      const onChangeNodeIndent = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onChangeNodeIndent={onChangeNodeIndent} />,
      );

      const notCanceled = fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true });

      expect(onChangeNodeIndent).toHaveBeenCalledTimes(1);
      expect(onChangeNodeIndent).toHaveBeenCalledWith(1, "indent");
      expect(notCanceled).toBe(false);
    });

    it("Alt+←で選択中のノードの階層を上げる要求を onChangeNodeIndent へ渡し、既定動作を止める", async () => {
      const onChangeNodeIndent = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onChangeNodeIndent={onChangeNodeIndent} />,
      );

      const notCanceled = fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });

      expect(onChangeNodeIndent).toHaveBeenCalledTimes(1);
      expect(onChangeNodeIndent).toHaveBeenCalledWith(1, "outdent");
      expect(notCanceled).toBe(false);
    });

    it("shortcutsEnabled が false なら Alt+→ で onChangeNodeIndent を呼ばず、既定動作も止めない", async () => {
      const onChangeNodeIndent = jest.fn();
      await renderReady(
        <MapStage
          {...defaultProps}
          nodes={sampleNodes}
          selectedNodeId={1}
          shortcutsEnabled={false}
          onChangeNodeIndent={onChangeNodeIndent}
        />,
      );

      const notCanceled = fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true });

      expect(onChangeNodeIndent).not.toHaveBeenCalled();
      expect(notCanceled).toBe(true);
    });

    it("ラベル編集中は Alt+→ で onChangeNodeIndent を呼ばない", async () => {
      const onChangeNodeIndent = jest.fn();
      const { getByTestId } = await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onChangeNodeIndent={onChangeNodeIndent} />,
      );
      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      mockStageBounds(container);
      fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
      const input = getByTestId("node-label-input");

      fireEvent.keyDown(input, { key: "ArrowRight", altKey: true });
      fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true });

      expect(input).toBeInTheDocument();
      expect(onChangeNodeIndent).not.toHaveBeenCalled();
    });

    it("Alt+Shift+→ では onChangeNodeIndent を呼ばない", async () => {
      const onChangeNodeIndent = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onChangeNodeIndent={onChangeNodeIndent} />,
      );

      fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true, shiftKey: true });

      expect(onChangeNodeIndent).not.toHaveBeenCalled();
    });

    it("Alt+↑ では onChangeNodeIndent を呼ばず onReorderSibling を呼ぶ", async () => {
      const onChangeNodeIndent = jest.fn();
      const onReorderSibling = jest.fn();
      await renderReady(
        <MapStage
          {...defaultProps}
          nodes={sampleNodes}
          selectedNodeId={1}
          onChangeNodeIndent={onChangeNodeIndent}
          onReorderSibling={onReorderSibling}
        />,
      );

      fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true });

      expect(onReorderSibling).toHaveBeenCalledTimes(1);
      expect(onChangeNodeIndent).not.toHaveBeenCalled();
    });

    it("Alt+→ では onReorderSibling を呼ばない", async () => {
      const onChangeNodeIndent = jest.fn();
      const onReorderSibling = jest.fn();
      await renderReady(
        <MapStage
          {...defaultProps}
          nodes={sampleNodes}
          selectedNodeId={1}
          onChangeNodeIndent={onChangeNodeIndent}
          onReorderSibling={onReorderSibling}
        />,
      );

      fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true });

      expect(onChangeNodeIndent).toHaveBeenCalledTimes(1);
      expect(onReorderSibling).not.toHaveBeenCalled();
    });

    it("選択が無いときの Alt+← は onChangeNodeIndent を呼ばず、ブラウザの「戻る」は止める", async () => {
      const onChangeNodeIndent = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={null} onChangeNodeIndent={onChangeNodeIndent} />,
      );

      const notCanceled = fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });

      expect(onChangeNodeIndent).not.toHaveBeenCalled();
      expect(notCanceled).toBe(false);
    });
  });

  it("preserves the current draft when the editing input is double-clicked", async () => {
    const { getByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
    const input = getByTestId("node-label-input");

    fireEvent.change(input, { target: { value: "編集中の下書き" } });
    fireEvent.doubleClick(input, { clientX: 100, clientY: 60 });

    expect(input).toHaveValue("編集中の下書き");
  });

  it("マップ置換時に編集中draftとviewportと進行中gestureを同期リセットする", async () => {
    const onMoveNode = jest.fn();
    const onUpdateLabel = jest.fn();
    const { getByTestId, queryByTestId, rerender } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        resetRevision={0}
        onMoveNode={onMoveNode}
        onUpdateLabel={onUpdateLabel}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
    fireEvent.change(getByTestId("node-label-input"), {
      target: { value: "古い下書き" },
    });
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      rerender(
        <MapStage
          {...defaultProps}
          nodes={[{ ...sampleNodes[0], label: "読込後" }, sampleNodes[1]]}
          resetRevision={1}
          onMoveNode={onMoveNode}
          onUpdateLabel={onUpdateLabel}
        />,
      );
    });

    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(onUpdateLabel).not.toHaveBeenCalled();
    expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(0, 0);
    expect(lastWorldContainer()?.scale.set).toHaveBeenLastCalledWith(1);
    act(() => {
      mockStageHandlers.pointermove?.(pointer(140, 100));
      mockStageHandlers.pointerup?.(pointer(140, 100));
    });
    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("親layout effectより前に古いgestureをキャンセルする", async () => {
    const onMoveNode = jest.fn();
    let reset!: () => void;
    await renderReady(
      <ResetTimingHarness
        onReady={(command) => {
          reset = command;
        }}
        onMoveNode={onMoveNode}
      />,
    );

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      reset();
    });

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("破棄された render の操作参照をコミット済みの値へ漏らさない", async () => {
    const committedOnSelectNode = jest.fn();
    const pendingOnSelectNode = jest.fn();
    const committedOnMoveNode = jest.fn();
    const pendingOnMoveNode = jest.fn();
    const committedNode = sampleNodes[0];
    const pendingNode = { ...committedNode, x: 500, y: 400 };
    let startPendingUpdate!: () => void;

    await renderReady(
      <ConcurrentInteractionHarness
        onReady={(startUpdate) => {
          startPendingUpdate = startUpdate;
        }}
        committedNode={committedNode}
        pendingNode={pendingNode}
        committedOnSelectNode={committedOnSelectNode}
        pendingOnSelectNode={pendingOnSelectNode}
        committedOnMoveNode={committedOnMoveNode}
        pendingOnMoveNode={pendingOnMoveNode}
      />,
    );

    act(() => startPendingUpdate());
    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(pointer(100, 60));
      mockStageHandlers.pointermove?.(pointer(104, 64));
    });

    expect(pendingOnSelectNode).not.toHaveBeenCalled();
    expect(pendingOnMoveNode).not.toHaveBeenCalled();
    expect(committedOnSelectNode).toHaveBeenCalledWith(committedNode.id);
    expect(committedOnMoveNode).toHaveBeenCalledWith(committedNode.id, 54, 34);
  });

  it.each([
    ["Tab", 1],
    ["Enter", null],
  ])("uses real useNodes to create and edit a node with %s", async (key, expectedParentId) => {
    let nextNodeId = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++nextNodeId);
    const { getByTestId } = await renderReady(<KeyboardCreationHarness />);
    const [source] = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];

    fireEvent.keyDown(window, { key });

    let nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const created = nodes[1];
    expect(nodes).toHaveLength(2);
    expect(created.parentId).toBe(expectedParentId === null ? source.parentId : source.id);
    expect(getByTestId("selected-node-id")).toHaveTextContent(String(created.id));
    const input = getByTestId("node-label-input");
    expect(input).toHaveValue("");

    fireEvent.change(input, { target: { value: "作成したノード" } });
    fireEvent.keyDown(input, { key: "Enter" });

    nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes).toHaveLength(2);
    expect(nodes[1].label).toBe("作成したノード");
  });

  it.each(["Tab", "Enter"])("suppresses %s when no node is selected", async (key) => {
    const { getByTestId, queryByTestId } = await renderReady(
      <KeyboardCreationHarness initiallySelected={false} />,
    );

    fireEvent.keyDown(window, { key });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes).toHaveLength(1);
    expect(getByTestId("selected-node-id")).toHaveTextContent("");
    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
  });

  it.each(["Tab", "Delete", "Backspace"])("suppresses %s while editing", async (key) => {
    const { getByTestId } = await renderReady(<KeyboardCreationHarness />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

    fireEvent.keyDown(getByTestId("node-label-input"), { key });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes).toHaveLength(1);
  });

  it("Shiftドラッグで実際のノード状態を親子接続する", async () => {
    let nextNodeId = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++nextNodeId);
    const { getByTestId } = await renderReady(<MouseConnectionHarness />);

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(pointer(100, 60, { shiftKey: true }));
      mockStageHandlers.pointermove?.(pointer(220, 120));
      mockStageHandlers.pointerup?.(pointer(220, 120));
    });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes.find((node) => node.id === 2)?.parentId).toBe(1);
    expect(getByTestId("selected-node-id")).toHaveTextContent("2");
  });

  it("親ノードのpointer dragで子孫だけを同じ差分だけ移動する", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<SubtreeMoveHarness />);
    const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const root = before[0];

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(pointer(root.x + 10, root.y + 10));
      mockStageHandlers.pointermove?.(pointer(root.x + 30, root.y + 25));
      mockStageHandlers.pointerup?.(pointer(root.x + 30, root.y + 25));
    });

    const after = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    for (const nodeId of [1, 2, 3]) {
      const oldNode = before.find((node) => node.id === nodeId)!;
      const movedNode = after.find((node) => node.id === nodeId)!;
      expect(movedNode).toMatchObject({ x: oldNode.x + 20, y: oldNode.y + 15 });
    }
    expect(after.find((node) => node.id === 4)).toEqual(before.find((node) => node.id === 4));
  });

  it("自動モードでShift接続した子を親の右列へ再配置する", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
    const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const parent = before.find((node) => node.id === 1)!;
    const child = before.find((node) => node.id === 2)!;

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(
        pointer(parent.x + 10, parent.y + 10, { shiftKey: true }),
      );
      mockStageHandlers.pointermove?.(pointer(child.x + 10, child.y + 10));
      mockStageHandlers.pointerup?.(pointer(child.x + 10, child.y + 10));
    });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const connectedParent = nodes.find((node) => node.id === 1)!;
    const connectedChild = nodes.find((node) => node.id === 2)!;
    expect(connectedChild.parentId).toBe(connectedParent.id);
    expect(connectedChild.x).toBe(
      connectedParent.x + connectedParent.width + CHILD_HORIZONTAL_GAP,
    );
  });

  it("自動モードのpointer dragではノード座標を変更しない", async () => {
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
    const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const root = before[0];

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(
        pointer(root.x + 10, root.y + 10),
      );
      mockStageHandlers.pointermove?.(pointer(root.x + 80, root.y + 90));
      mockStageHandlers.pointerup?.(pointer(root.x + 80, root.y + 90));
    });

    const after = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(after.map(({ x, y }) => ({ x, y }))).toEqual(
      before.map(({ x, y }) => ({ x, y })),
    );
  });

  it("自動モードで離れた位置に追加したルートを既存列へ整列する", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
    const before = JSON.parse(
      getByTestId("node-state").textContent ?? "[]",
    ) as Node[];
    const firstRoot = before.find((node) => node.id === 1)!;
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.doubleClick(container, { clientX: 700, clientY: 500 });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const addedRoot = nodes.find((node) => node.id === 3)!;
    expect(addedRoot.parentId).toBeNull();
    expect(addedRoot.x).toBe(firstRoot.x);
    expect(addedRoot.x).not.toBe(650);
  });

  it("自動モードで兄弟削除後に残った兄弟を親の中央へ戻す", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);

    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.keyDown(getByTestId("node-label-input"), { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });

    const beforeDelete = JSON.parse(
      getByTestId("node-state").textContent ?? "[]",
    ) as Node[];
    const rootBeforeDelete = beforeDelete.find((node) => node.id === 1)!;
    const remainingChildBeforeDelete = beforeDelete.find((node) => node.id === 3)!;
    expect(remainingChildBeforeDelete.y).not.toBe(rootBeforeDelete.y);

    fireEvent.keyDown(getByTestId("node-label-input"), { key: "Enter" });
    fireEvent.keyDown(window, { key: "Delete" });

    const nodes = JSON.parse(
      getByTestId("node-state").textContent ?? "[]",
    ) as Node[];
    const remainingChild = nodes.find((node) => node.id === 3)!;
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3]);
    expect(remainingChild).toMatchObject({
      parentId: rootBeforeDelete.id,
      y: rootBeforeDelete.y,
    });
  });

  describe("自動配置のドラッグによる兄弟の並べ替え", () => {
    beforeEach(() => {
      let id = 0;
      jest.spyOn(Date, "now").mockImplementation(() => ++id);
    });

    function readNodes(getByTestId: (id: string) => HTMLElement): Node[] {
      return JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    }

    it("2つ目のルートを先頭のルートより上へドラッグすると、並びと縦位置が入れ替わる", async () => {
      const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
      const before = readNodes(getByTestId);
      const firstRoot = before.find((node) => node.id === 1)!;
      const secondRoot = before.find((node) => node.id === 2)!;
      expect(before.map((node) => node.id)).toEqual([1, 2]);

      const firstCenterY = firstRoot.y + firstRoot.height / 2;
      act(() => {
        mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(
          secondRoot.x + secondRoot.width / 2,
          secondRoot.y + secondRoot.height / 2,
        ));
        mockStageHandlers.pointermove?.(pointer(secondRoot.x + secondRoot.width / 2, firstCenterY - 10));
        mockStageHandlers.pointerup?.(pointer(secondRoot.x + secondRoot.width / 2, firstCenterY - 10));
      });

      const after = readNodes(getByTestId);
      expect(after.map((node) => node.id)).toEqual([2, 1]);
      expect(after[0]).toMatchObject({ id: 2, x: firstRoot.x, y: firstRoot.y });
    });

    it("ドラッグの途中は挿入位置の線を描き、離した後の描画では線を描かない", async () => {
      const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
      const before = readNodes(getByTestId);
      const firstRoot = before.find((node) => node.id === 1)!;
      const secondRoot = before.find((node) => node.id === 2)!;
      const pointerX = secondRoot.x + secondRoot.width / 2;
      const dropY = firstRoot.y + firstRoot.height / 2 - 10;
      const mockedGraphics = jest.mocked(Graphics);
      const isIndicatorLine = (graphics: { fill: jest.Mock }) =>
        graphics.fill.mock.calls.some(([style]) => style?.color === 0x2563eb);

      act(() => {
        mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(pointerX, secondRoot.y + secondRoot.height / 2));
        mockStageHandlers.pointermove?.(pointer(pointerX, dropY));
      });

      const line = mockedGraphics.mock.results.at(-1)!.value as { fill: jest.Mock; rect: jest.Mock };
      expect(line.fill).toHaveBeenCalledWith({ color: 0x2563eb });
      expect(line.rect.mock.calls[0][3]).toBe(6);
      const createdBeforeDrop = mockedGraphics.mock.results.length;

      act(() => {
        mockStageHandlers.pointerup?.(pointer(pointerX, dropY));
      });

      const createdAfterDrop = mockedGraphics.mock.results.slice(createdBeforeDrop);
      expect(createdAfterDrop.length).toBeGreaterThan(0);
      expect(createdAfterDrop.some(({ value }) => isIndicatorLine(value))).toBe(false);
    });

    it("ドラッグの途中のEscapeで中止し、離しても並びを変えない", async () => {
      const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
      const before = readNodes(getByTestId);
      const firstRoot = before.find((node) => node.id === 1)!;
      const secondRoot = before.find((node) => node.id === 2)!;
      const pointerX = secondRoot.x + secondRoot.width / 2;
      const dropY = firstRoot.y + firstRoot.height / 2 - 10;

      act(() => {
        mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(pointerX, secondRoot.y + secondRoot.height / 2));
        mockStageHandlers.pointermove?.(pointer(pointerX, dropY));
      });
      let notCanceled = true;
      act(() => {
        notCanceled = fireEvent.keyDown(window, { key: "Escape" });
      });
      act(() => {
        mockStageHandlers.pointerup?.(pointer(pointerX, dropY));
      });

      expect(notCanceled).toBe(false);
      expect(readNodes(getByTestId)).toEqual(before);
    });

    it("ドラッグ中に shortcutsEnabled が false になると中止し、離しても並びを変えない。true に戻すと新しいドラッグで並べ替えられる", async () => {
      const { getByTestId, rerender } = await renderReady(<AutoLayoutMapStageHarness />);
      const before = readNodes(getByTestId);
      const firstRoot = before.find((node) => node.id === 1)!;
      const secondRoot = before.find((node) => node.id === 2)!;
      const pointerX = secondRoot.x + secondRoot.width / 2;
      const startY = secondRoot.y + secondRoot.height / 2;
      const dropY = firstRoot.y + firstRoot.height / 2 - 10;

      act(() => {
        mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(pointerX, startY));
        mockStageHandlers.pointermove?.(pointer(pointerX, dropY));
      });
      rerender(<AutoLayoutMapStageHarness shortcutsEnabled={false} />);
      act(() => {
        mockStageHandlers.pointerup?.(pointer(pointerX, dropY));
      });

      expect(readNodes(getByTestId)).toEqual(before);

      rerender(<AutoLayoutMapStageHarness />);
      act(() => {
        mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(pointerX, startY));
        mockStageHandlers.pointermove?.(pointer(pointerX, dropY));
        mockStageHandlers.pointerup?.(pointer(pointerX, dropY));
      });

      expect(readNodes(getByTestId).map((node) => node.id)).toEqual([2, 1]);
    });

    it("ドラッグしていないときのEscapeはpreventDefaultしない", async () => {
      await renderReady(<AutoLayoutMapStageHarness />);

      expect(fireEvent.keyDown(window, { key: "Escape" })).toBe(true);
    });
  });
});
