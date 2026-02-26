import { render, fireEvent, act } from "@testing-library/react";
import { MapStage } from "@/components/map/MapStage";
import type { Rect } from "@/types/rect";

// ========== モック定義 ==========
// jest.mock() はホイスティングされるが、'mock' プレフィックスの変数は例外的に参照可能
const mockStage = { removeChildren: jest.fn(), addChild: jest.fn() };
const mockInit = jest.fn().mockResolvedValue(undefined);
const mockDestroy = jest.fn();

jest.mock("pixi.js", () => {
  const canvas = document.createElement("canvas");
  return {
    Application: jest.fn().mockImplementation(() => ({
      init: mockInit,
      destroy: mockDestroy,
      canvas,
      stage: mockStage,
    })),
    Graphics: jest.fn().mockImplementation(() => ({
      rect: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
    })),
  };
});

// ========== データ ==========
const sampleRects: Rect[] = [
  { id: 1, x: 50, y: 30, width: 100, height: 60 },
  { id: 2, x: 200, y: 100, width: 100, height: 60 },
];

// ========== テスト ==========
beforeEach(() => {
  jest.clearAllMocks();
  mockInit.mockResolvedValue(undefined); // 各テストで解決済みに戻す
});

describe("MapStage", () => {
  describe("レンダリング", () => {
    it("コンテナ div がレンダリングされる", () => {
      render(<MapStage rects={[]} onDoubleClick={jest.fn()} />);
      const container = document.querySelector(".cursor-crosshair");
      expect(container).toBeInTheDocument();
    });
  });

  describe("ダブルクリック", () => {
    it("onDoubleClick がコンテナ相対の座標で呼ばれる", () => {
      const onDoubleClick = jest.fn();
      render(<MapStage rects={[]} onDoubleClick={onDoubleClick} />);

      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
        left: 100, top: 50, right: 900, bottom: 650,
        width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}),
      });

      fireEvent.doubleClick(container, { clientX: 300, clientY: 200 });

      // 期待値: clientX - left = 200, clientY - top = 150
      expect(onDoubleClick).toHaveBeenCalledTimes(1);
      expect(onDoubleClick).toHaveBeenCalledWith(200, 150);
    });

    it("複数回ダブルクリックすると onDoubleClick が同回数呼ばれる", () => {
      const onDoubleClick = jest.fn();
      render(<MapStage rects={[]} onDoubleClick={onDoubleClick} />);

      const container = document.querySelector(".cursor-crosshair") as HTMLElement;
      jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
        left: 0, top: 0, right: 800, bottom: 600,
        width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
      });

      fireEvent.doubleClick(container, { clientX: 100, clientY: 100 });
      fireEvent.doubleClick(container, { clientX: 200, clientY: 200 });

      expect(onDoubleClick).toHaveBeenCalledTimes(2);
    });

    it("マウント直後にはイベントを発火しない", () => {
      const onDoubleClick = jest.fn();
      render(<MapStage rects={sampleRects} onDoubleClick={onDoubleClick} />);
      expect(onDoubleClick).not.toHaveBeenCalled();
    });
  });

  describe("PixiJS 初期化後の rect 描画", () => {
    it("初期化完了後に rects が stage へ描画される", async () => {
      await act(async () => {
        render(<MapStage rects={sampleRects} onDoubleClick={jest.fn()} />);
        await Promise.resolve(); // dynamic import を解決
        await Promise.resolve(); // app.init() を解決
      });

      expect(mockStage.removeChildren).toHaveBeenCalled();
      expect(mockStage.addChild).toHaveBeenCalledTimes(sampleRects.length);
    });

    it("rects が空のとき addChild は呼ばれない", async () => {
      await act(async () => {
        render(<MapStage rects={[]} onDoubleClick={jest.fn()} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockStage.removeChildren).toHaveBeenCalled();
      expect(mockStage.addChild).not.toHaveBeenCalled();
    });

    it("rects が変化すると stage が再描画される", async () => {
      let rerender!: (ui: React.ReactElement) => void;

      await act(async () => {
        const result = render(<MapStage rects={[]} onDoubleClick={jest.fn()} />);
        rerender = result.rerender;
        await Promise.resolve();
        await Promise.resolve();
      });

      mockStage.removeChildren.mockClear();
      mockStage.addChild.mockClear();

      act(() => {
        rerender(<MapStage rects={sampleRects} onDoubleClick={jest.fn()} />);
      });

      expect(mockStage.removeChildren).toHaveBeenCalled();
      expect(mockStage.addChild).toHaveBeenCalledTimes(sampleRects.length);
    });
  });

  describe("PixiJS ライフサイクル", () => {
    it("unmount 時に PixiJS app が破棄される", async () => {
      let unmount!: () => void;

      await act(async () => {
        const result = render(<MapStage rects={[]} onDoubleClick={jest.fn()} />);
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
      // init を手動で制御できる Promise に差し替える
      let resolveInit!: () => void;
      const pendingInit = new Promise<void>((resolve) => {
        resolveInit = resolve;
      });
      mockInit.mockReturnValueOnce(pendingInit);

      let unmount!: () => void;

      await act(async () => {
        const result = render(<MapStage rects={[]} onDoubleClick={jest.fn()} />);
        unmount = result.unmount;
        // dynamic import は解決済みにするが、init はまだ pending
        await Promise.resolve();
      });

      // init 完了前にアンマウント → cancelled = true
      act(() => {
        unmount();
      });

      // init を完了させる → cancelled ブランチの app.destroy(true) が実行される
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

      // render 後すぐ unmount（dynamic import の microtask が走る前）
      const { unmount } = render(<MapStage rects={[]} onDoubleClick={jest.fn()} />);
      unmount();

      // dynamic import の microtask を解決する（cancelled=true のため if(cancelled) で return）
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
        render(<MapStage rects={[]} onDoubleClick={jest.fn()} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      // init が呼ばれていれば resolution=1 のフォールバックパスが通っている
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: 1 }),
      );

      Object.defineProperty(window, "devicePixelRatio", { value: original, configurable: true });
    });
  });
});
