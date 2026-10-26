import { act, fireEvent } from "@testing-library/react";
import { MapStage } from "@/components/map/MapStage";
import {
  mockNodePointerHandlers,
  mockStage,
  mockStageHandlers,
  mockStageBounds,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
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

beforeEach(() => {
  resetMapStageTestRuntime();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapStage context menu boundary", () => {
  it("ノードを右クリックすると選択してメニューを表示する", async () => {
    const onSelectNode = jest.fn();
    const { getByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onSelectNode={onSelectNode}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(onSelectNode).toHaveBeenCalledWith(1);
    expect(getByRole("menu")).toHaveStyle({ left: "100px", top: "60px" });
  });

  it("illustrationを持つノードを右クリックすると、メニューの項目が「イラストを再生成」になる", async () => {
    const nodes = [
      createTestNode({ id: 1, x: 50, y: 30, label: "ノード1", illustration: "data:image/jpeg;base64,AAAA", height: 116 }),
    ];
    const { getByRole, queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={nodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(getByRole("menuitem", { name: "イラストを再生成" })).toBeInTheDocument();
    expect(queryByRole("menuitem", { name: "イラストを生成" })).not.toBeInTheDocument();
  });

  it("イラストなしのノード1とイラストありのノード2では、右クリックした対象ノードでラベルが決まる", async () => {
    const nodes = [
      createTestNode({ id: 1, x: 50, y: 30, label: "ノード1" }),
      createTestNode({ id: 2, x: 200, y: 100, label: "ノード2", illustration: "data:image/jpeg;base64,AAAA", height: 116 }),
    ];
    const { getByRole, queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={nodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });
    expect(getByRole("menuitem", { name: "イラストを生成" })).toBeInTheDocument();
    expect(queryByRole("menuitem", { name: "イラストを再生成" })).not.toBeInTheDocument();

    fireEvent.contextMenu(container, { clientX: 250, clientY: 130 });
    expect(getByRole("menuitem", { name: "イラストを再生成" })).toBeInTheDocument();
    expect(queryByRole("menuitem", { name: "イラストを生成" })).not.toBeInTheDocument();
  });

  it("illustrationを持たないノードを右クリックすると、項目は「イラストを生成」のまま", async () => {
    const { getByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(getByRole("menuitem", { name: "イラストを生成" })).toBeInTheDocument();
  });

  it("メニュー項目の選択で対象ノードIDを通知してメニューを閉じる", async () => {
    const onGenerateIllustration = jest.fn();
    const { getByRole, queryByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onGenerateIllustration={onGenerateIllustration}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    fireEvent.click(getByRole("menuitem", { name: "イラストを生成" }));

    expect(onGenerateIllustration).toHaveBeenCalledWith(1);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("空白の右クリックは標準メニューを抑止し、開いているメニューを閉じる", async () => {
    const { queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    const notPrevented = fireEvent.contextMenu(container, { clientX: 700, clientY: 500 });

    expect(notPrevented).toBe(false);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("非表示ノードの右クリックではメニューを開かない", async () => {
    const onSelectNode = jest.fn();
    const { queryByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        visibleNodeIds={new Set([2])}
        onSelectNode={onSelectNode}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(onSelectNode).not.toHaveBeenCalled();
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("画面端の右クリックではメニューをコンテナ内へ寄せる", async () => {
    const { getByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={[{ ...sampleNodes[0], x: 760, y: 560 }]}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 790, clientY: 590 });

    expect(getByRole("menu")).toHaveStyle({ left: "624px", top: "556px" });
  });

  it("開いているメニュー上の右クリックではメニューを維持し再選択しない", async () => {
    const onSelectNode = jest.fn();
    const { getByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onSelectNode={onSelectNode}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });
    onSelectNode.mockClear();

    fireEvent.contextMenu(getByRole("menu"), { clientX: 100, clientY: 60 });

    expect(getByRole("menu")).toBeInTheDocument();
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it("ラベル編集中の入力欄の右クリックでは標準メニューを抑止せず独自メニューも開かない", async () => {
    const onSelectNode = jest.fn();
    const { getByTestId, queryByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onSelectNode={onSelectNode}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
    onSelectNode.mockClear();

    const notPrevented = fireEvent.contextMenu(getByTestId("node-label-input"), {
      clientX: 100,
      clientY: 60,
    });

    expect(notPrevented).toBe(true);
    expect(queryByRole("menu")).not.toBeInTheDocument();
    expect(onSelectNode).not.toHaveBeenCalled();
  });

  it("gesture中のノード右クリックではメニューを開かない", async () => {
    const { queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
    });
    const notPrevented = fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(notPrevented).toBe(false);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("macOSのCtrl+クリック（gesture中のcontextmenu）ではメニューを開く", async () => {
    const { getByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
    });
    const notPrevented = fireEvent.contextMenu(container, {
      clientX: 100,
      clientY: 60,
      ctrlKey: true,
    });

    expect(notPrevented).toBe(false);
    expect(getByRole("menu")).toBeInTheDocument();
  });

  it("Ctrl+クリックでメニューを開いた後のpointermoveではノードを移動しない", async () => {
    const onMoveNode = jest.fn();
    const { getByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onMoveNode={onMoveNode}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
    });
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60, ctrlKey: true });
    act(() => {
      mockStageHandlers.pointermove?.(pointer(160, 120));
    });

    expect(getByRole("menu")).toBeInTheDocument();
    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("フォーカスがメニュー外へ移るとメニューを閉じる", async () => {
    const { getByRole, queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    fireEvent.focusOut(getByRole("menuitem"), { relatedTarget: document.body });

    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("relatedTargetがnullのfocusoutではメニューを維持し、続くクリックで生成を通知する（Safari）", async () => {
    const onGenerateIllustration = jest.fn();
    const { getByRole, queryByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onGenerateIllustration={onGenerateIllustration}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });
    const item = getByRole("menuitem");

    fireEvent.focusOut(item, { relatedTarget: null });
    expect(queryByRole("menu")).toBeInTheDocument();
    fireEvent.click(item);

    expect(onGenerateIllustration).toHaveBeenCalledWith(1);
  });

  it("ステージgesture中の空白Ctrl+右クリックは標準メニューを抑止し、開いているメニューを閉じる", async () => {
    const { queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(700, 500, { target: mockStage }));
    });

    const notPrevented = fireEvent.contextMenu(container, {
      clientX: 700,
      clientY: 500,
      ctrlKey: true,
    });

    expect(notPrevented).toBe(false);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("onGenerateIllustration未指定でもノード右クリックは選択し、標準メニューを抑止する", async () => {
    const onSelectNode = jest.fn();
    const { queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onSelectNode={onSelectNode} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    const notPrevented = fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(notPrevented).toBe(false);
    expect(onSelectNode).toHaveBeenCalledWith(1);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("MapStage context menu shortcutsEnabled", () => {
  it("shortcutsEnabledがfalseの間は開いているメニューがEscapeで閉じず、trueへ戻すと閉じる", async () => {
    const props = { ...defaultProps, nodes: sampleNodes, onGenerateIllustration: jest.fn() };
    const { getByRole, queryByRole, rerender } = await renderReady(<MapStage {...props} />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });
    expect(getByRole("menu")).toBeInTheDocument();

    rerender(<MapStage {...props} shortcutsEnabled={false} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getByRole("menu")).toBeInTheDocument();

    rerender(<MapStage {...props} shortcutsEnabled />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("MapStage context menu double-click activation", () => {
  async function openAndActivate(onGenerateIllustration: jest.Mock, onDoubleClick: jest.Mock) {
    const rendered = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onDoubleClick={onDoubleClick}
        onGenerateIllustration={onGenerateIllustration}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });
    fireEvent.click(rendered.getByRole("menuitem", { name: "イラストを生成" }));
    return { ...rendered, container };
  }

  it("メニュー項目のダブルクリック2打目が空白に届いてもノードを作らない", async () => {
    const onGenerateIllustration = jest.fn();
    const onDoubleClick = jest.fn();
    const { container } = await openAndActivate(onGenerateIllustration, onDoubleClick);

    fireEvent.doubleClick(container, { clientX: 700, clientY: 500 });

    expect(onDoubleClick).not.toHaveBeenCalled();
    expect(onGenerateIllustration).toHaveBeenCalledTimes(1);
  });

  it("メニュー項目のダブルクリック2打目がノード上に届いてもラベル編集を開かない", async () => {
    const onGenerateIllustration = jest.fn();
    const onDoubleClick = jest.fn();
    const { container, queryByTestId } = await openAndActivate(onGenerateIllustration, onDoubleClick);

    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

    expect(onDoubleClick).not.toHaveBeenCalled();
    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(onGenerateIllustration).toHaveBeenCalledTimes(1);
  });

  it("ウィンドウ経過後の空白ダブルクリックはノードを追加する", async () => {
    const base = 1_000_000;
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(base);
    const onDoubleClick = jest.fn();
    const { container } = await openAndActivate(jest.fn(), onDoubleClick);

    nowSpy.mockReturnValue(base + 500);
    fireEvent.doubleClick(container, { clientX: 700, clientY: 500 });

    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });
});
