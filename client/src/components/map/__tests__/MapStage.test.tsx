import { render, fireEvent, act } from "@testing-library/react";
import { MapStage } from "@/components/map/MapStage";
import type { Node } from "@/types/node";

// ========== モック定義 ==========
let stageChildren: unknown[] = [];
const mockStage = {
  removeChildren: jest.fn(() => {
    const removed = [...stageChildren];
    stageChildren = [];
    return removed;
  }),
  addChild: jest.fn((child: unknown) => {
    stageChildren.push(child);
  }),
  removeChild: jest.fn(),
  on: jest.fn(),
  eventMode: "none",
  hitArea: null as unknown,
  children: [] as unknown[],
};
const mockInit = jest.fn().mockResolvedValue(undefined);
const mockDestroy = jest.fn();

const mockContainerOn = jest.fn();

jest.mock("pixi.js", () => {
  const canvas = document.createElement("canvas");
  return {
    Application: jest.fn().mockImplementation(() => ({
      init: mockInit,
      destroy: mockDestroy,
      canvas,
      stage: mockStage,
      screen: { x: 0, y: 0, width: 800, height: 600 },
    })),
    Graphics: jest.fn().mockImplementation(() => ({
      rect: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
    })),
    Text: jest.fn().mockImplementation(() => ({
      anchor: { set: jest.fn() },
      x: 0,
      y: 0,
    })),
    Container: jest.fn().mockImplementation(() => ({
      addChild: jest.fn(),
      destroy: jest.fn(),
      on: mockContainerOn,
      eventMode: "none",
      cursor: "default",
    })),
  };
});

// ========== ヘルパー ==========
const defaultProps = {
  nodes: [] as Node[],
  selectedNodeId: null as number | null,
  onDoubleClick: jest.fn(),
  onSelectNode: jest.fn(),
  onUpdateLabel: jest.fn(),
  onMoveNode: jest.fn(),
  onDeleteNode: jest.fn(),
};

// ========== データ ==========
const sampleNodes: Node[] = [
  { id: 1, parentId: null, x: 50, y: 30, width: 100, height: 60, label: "ノード1" },
  { id: 2, parentId: null, x: 200, y: 100, width: 100, height: 60, label: "ノード2" },
];

async function renderReady(ui: React.ReactElement) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

// ========== テスト ==========
beforeEach(() => {
    jest.clearAllMocks();
  stageChildren = [];
  mockInit.mockResolvedValue(undefined);
});

describe("MapStage", () => {
  describe("レンダリング", () => {
  it("コンテナ div がレンダリングされる", async () => {
      await renderReady(<MapStage {...defaultProps} />);
      const container = document.querySelector(".cursor-crosshair");
      expect(container).toBeInTheDocument();
    });
  });

  describe("ダブルクリック", () => {
    it("空白エリアのダブルクリックで onDoubleClick がコンテナ相対の座標で呼ばれる", async () => {
      const onDoubleClick = jest.fn();
      await renderReady(<MapStage {...defaultProps} onDoubleClick={onDoubleClick} />);

      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
        left: 100, top: 50, right: 900, bottom: 650,
        width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}),
      });

      fireEvent.doubleClick(container, { clientX: 300, clientY: 200 });

      expect(onDoubleClick).toHaveBeenCalledTimes(1);
      expect(onDoubleClick).toHaveBeenCalledWith(200, 150);
    });

    it("ノード上のダブルクリックで編集モードになる", async () => {
      const { getByTestId } = await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} />,
      );

      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
        left: 0, top: 0, right: 800, bottom: 600,
        width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
      });

      // sampleNodes[0] は x:50, y:30, w:100, h:60 → 中心 (100, 60) をクリック
      fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

      const input = getByTestId("node-label-input");
      expect(input).toBeInTheDocument();
      expect((input as HTMLInputElement).value).toBe("ノード1");
    });

    it("マウント直後にはイベントを発火しない", async () => {
      const onDoubleClick = jest.fn();
      await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} onDoubleClick={onDoubleClick} />);
      expect(onDoubleClick).not.toHaveBeenCalled();
    });
  });

  describe("テキスト編集", () => {
    async function renderAndStartEditing() {
      const onUpdateLabel = jest.fn();
      const result = await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} onUpdateLabel={onUpdateLabel} />,
      );

      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
        left: 0, top: 0, right: 800, bottom: 600,
        width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

      return { ...result, onUpdateLabel };
    }

    it("Enter キーで編集を確定する", async () => {
      const { getByTestId, onUpdateLabel } = await renderAndStartEditing();
      const input = getByTestId("node-label-input");

      fireEvent.change(input, { target: { value: "更新テキスト" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onUpdateLabel).toHaveBeenCalledWith(1, "更新テキスト");
    });

    it("Escape キーで編集をキャンセルする", async () => {
      const { getByTestId, onUpdateLabel, queryByTestId } = await renderAndStartEditing();
      const input = getByTestId("node-label-input");

      fireEvent.change(input, { target: { value: "変更されないテキスト" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(onUpdateLabel).not.toHaveBeenCalled();
      expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
    });
  });

  describe("PixiJS 初期化後の node 描画", () => {
    it("初期化完了後に nodes が stage へ描画される", async () => {
      await act(async () => {
        render(<MapStage {...defaultProps} nodes={sampleNodes} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockStage.removeChildren).toHaveBeenCalled();
      expect(mockStage.addChild).toHaveBeenCalledTimes(sampleNodes.length);
    });

    it("nodes が空のとき addChild は呼ばれない", async () => {
      await act(async () => {
        render(<MapStage {...defaultProps} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockStage.removeChildren).toHaveBeenCalled();
      expect(mockStage.addChild).not.toHaveBeenCalled();
    });

    it("nodes が変化すると stage が再描画される", async () => {
      let rerender!: (ui: React.ReactElement) => void;

      await act(async () => {
        const result = render(<MapStage {...defaultProps} />);
        rerender = result.rerender;
        await Promise.resolve();
        await Promise.resolve();
      });

      mockStage.removeChildren.mockClear();
      mockStage.addChild.mockClear();

      act(() => {
        rerender(<MapStage {...defaultProps} nodes={sampleNodes} />);
      });

      expect(mockStage.removeChildren).toHaveBeenCalled();
      expect(mockStage.addChild).toHaveBeenCalledTimes(sampleNodes.length);
    });
  });

  describe("ノード選択", () => {
    it("ノードの pointerdown で onSelectNode が呼ばれるようイベントが登録される", async () => {
      await act(async () => {
        render(<MapStage {...defaultProps} nodes={sampleNodes} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockContainerOn).toHaveBeenCalledWith("pointerdown", expect.any(Function));
      expect(mockContainerOn).toHaveBeenCalledTimes(sampleNodes.length);
    });

    it("空白クリックで onSelectNode(null) が呼ばれる", async () => {
      const onSelectNode = jest.fn();
      await renderReady(<MapStage {...defaultProps} onSelectNode={onSelectNode} />);

      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      fireEvent.click(container);

      expect(onSelectNode).toHaveBeenCalledWith(null);
    });

    it("PixiJS canvas 上の空白クリックでも選択を解除する", async () => {
      const onSelectNode = jest.fn();
      await act(async () => {
        render(<MapStage {...defaultProps} onSelectNode={onSelectNode} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      fireEvent.click(canvas);

      expect(onSelectNode).toHaveBeenCalledWith(null);
    });
  });

  describe("PixiJS オブジェクト破棄", () => {
    it("nodes の再描画前に既存コンテナを destroy する", async () => {
      let rerender!: (ui: React.ReactElement) => void;

      await act(async () => {
        const result = render(<MapStage {...defaultProps} nodes={sampleNodes} />);
        rerender = result.rerender;
        await Promise.resolve();
        await Promise.resolve();
      });

      const oldContainers = [...stageChildren] as Array<{ destroy: jest.Mock }>;
      expect(oldContainers).toHaveLength(sampleNodes.length);

      await act(async () => {
        rerender(<MapStage {...defaultProps} nodes={[]}/>);
      });

      for (const container of oldContainers) {
        expect(container.destroy).toHaveBeenCalledWith({ children: true });
      }
    });
  });

  describe("ノード削除", () => {
    it("選択中に Delete キーで onDeleteNode が呼ばれる", async () => {
      const onDeleteNode = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onDeleteNode={onDeleteNode} />,
      );

      fireEvent.keyDown(window, { key: "Delete" });

      expect(onDeleteNode).toHaveBeenCalledWith(1);
    });

    it("選択中に Backspace キーで onDeleteNode が呼ばれる", async () => {
      const onDeleteNode = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} onDeleteNode={onDeleteNode} />,
      );

      fireEvent.keyDown(window, { key: "Backspace" });

      expect(onDeleteNode).toHaveBeenCalledWith(1);
    });

    it("未選択時は Delete キーを押しても onDeleteNode が呼ばれない", async () => {
      const onDeleteNode = jest.fn();
      await renderReady(
        <MapStage {...defaultProps} nodes={sampleNodes} onDeleteNode={onDeleteNode} />,
      );

      fireEvent.keyDown(window, { key: "Delete" });

      expect(onDeleteNode).not.toHaveBeenCalled();
    });
  });

  describe("PixiJS ライフサイクル", () => {
    it("unmount 時に PixiJS app が破棄される", async () => {
      let unmount!: () => void;

      await act(async () => {
        const result = render(<MapStage {...defaultProps} />);
        unmount = result.unmount;
        await Promise.resolve();
        await Promise.resolve();
      });

      act(() => {
        unmount();
      });

      expect(mockDestroy).toHaveBeenCalledWith(true);
    });

    it("初期化完了前に unmount されると cancelled ブランチで app が破棄される", async () => {
      let resolveInit!: () => void;
      const pendingInit = new Promise<void>((resolve) => {
        resolveInit = resolve;
      });
      mockInit.mockReturnValueOnce(pendingInit);

      let unmount!: () => void;

      await act(async () => {
        const result = render(<MapStage {...defaultProps} />);
        unmount = result.unmount;
        await Promise.resolve();
      });

      act(() => {
        unmount();
      });

      await act(async () => {
        resolveInit();
        await Promise.resolve();
      });

      expect(mockDestroy).toHaveBeenCalledWith(true);
    });

    it("dynamic import 完了前に unmount されると Application が生成されない", async () => {
      const { Application } = jest.requireMock("pixi.js") as {
        Application: jest.Mock;
      };
      Application.mockClear();

      const { unmount } = render(<MapStage {...defaultProps} />);
      unmount();

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(Application).not.toHaveBeenCalled();
    });

    it("window.devicePixelRatio が 0 のとき resolution=1 にフォールバックする", async () => {
      const original = window.devicePixelRatio;
      Object.defineProperty(window, "devicePixelRatio", { value: 0, configurable: true });

      await act(async () => {
        render(<MapStage {...defaultProps} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: 1 }),
      );

      Object.defineProperty(window, "devicePixelRatio", { value: original, configurable: true });
    });
  });
});
