import { StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { useMapPersistence } from "@/hooks/useMapPersistence";
import type { Node } from "@/types/node";

const storedMapJson = `{
  "version": 1,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "保存済み"
    }
  ]
}\n`;

const mapBJson = `{
  "version": 1,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 1,
      "parentId": null,
      "x": 10,
      "y": 20,
      "width": 160,
      "height": 64,
      "label": "B"
    }
  ]
}\n`;

const mapCJson = `{
  "version": 1,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 1,
      "parentId": null,
      "x": 10,
      "y": 20,
      "width": 160,
      "height": 64,
      "label": "C"
    }
  ]
}\n`;

const mapAJson = `{
  "version": 1,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 1,
      "parentId": null,
      "x": 10,
      "y": 20,
      "width": 160,
      "height": 64,
      "label": "A"
    }
  ]
}\n`;

function node(label: string): Node {
  return {
    id: 1,
    parentId: null,
    x: 10,
    y: 20,
    width: 160,
    height: 64,
    label,
  };
}

function storageDouble(initialValue: string | null) {
  let value = initialValue;
  return {
    getItem: jest.fn(() => value),
    setItem: jest.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe("useMapPersistence", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("初期復元", () => {
    it("保存値がない場合は現在の空マップを維持して自動保存しない", () => {
      const storage = storageDouble(null);
      const replaceMap = jest.fn();

      renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap,
        storage,
      }));
      act(() => jest.advanceTimersByTime(300));

      expect(replaceMap).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("検証済みの保存値を一度だけ復元する", () => {
      const storage = storageDouble(storedMapJson);
      const replaceMap = jest.fn();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      );

      renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap,
        storage,
      }), { wrapper });

      expect(replaceMap).toHaveBeenCalledTimes(1);
      expect(replaceMap).toHaveBeenCalledWith({
        layoutMode: "auto",
        nodes: [{
          id: 10,
          parentId: null,
          x: 20,
          y: 30,
          width: 160,
          height: 64,
          label: "保存済み",
        }],
      });
    });

    it("壊れた保存値を空マップで上書きしない", () => {
      const storage = storageDouble("{broken");
      const { result } = renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storage,
      }));
      act(() => jest.advanceTimersByTime(300));

      expect(storage.setItem).not.toHaveBeenCalled();
      expect(result.current.notice).toEqual({
        kind: "warning",
        message: "保存データを復元できませんでした。空のマップで開始します。",
      });
    });

    it("Storage読み取り例外を警告へ変換して現在状態を維持する", () => {
      const storage = {
        getItem: jest.fn(() => {
          throw new DOMException("blocked", "SecurityError");
        }),
        setItem: jest.fn(),
      };
      const replaceMap = jest.fn();
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("現在")],
        layoutMode: "manual",
        replaceMap,
        storage,
      }));

      expect(replaceMap).not.toHaveBeenCalled();
      expect(result.current.notice?.kind).toBe("warning");
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("localStorageプロパティ取得例外をeffect外へ漏らさない", () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });

      try {
        const { result } = renderHook(() => useMapPersistence({
          nodes: [],
          layoutMode: "manual",
          replaceMap: jest.fn(),
        }));
        expect(result.current.notice?.kind).toBe("warning");
      } finally {
        if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
      }
    });

    it("復元済みスナップショットを直後に書き戻さない", () => {
      const storage = storageDouble(storedMapJson);

      const { rerender } = renderHook(
        ({ nodes }) => useMapPersistence({
          nodes,
          layoutMode: nodes.length === 0 ? "manual" : "auto",
          replaceMap: jest.fn(),
          storage,
        }),
        { initialProps: { nodes: [] as Node[] } },
      );
      rerender({ nodes: [{
        id: 10,
        parentId: null,
        x: 20,
        y: 30,
        width: 160,
        height: 64,
        label: "保存済み",
      }] });
      act(() => jest.advanceTimersByTime(300));

      expect(storage.setItem).not.toHaveBeenCalled();
    });
  });

  describe("自動保存", () => {
    it("連続変更から300ms後に最新スナップショットだけを保存する", () => {
      const storage = storageDouble(null);
      const { rerender } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storage,
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(200));
      rerender({ label: "C" });
      act(() => jest.advanceTimersByTime(299));
      expect(storage.setItem).not.toHaveBeenCalled();

      act(() => jest.advanceTimersByTime(1));
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenCalledWith(
        "draw-my-map.map.v1",
        mapCJson,
      );
    });

    it("unmount時に保留中の保存を破棄する", () => {
      const storage = storageDouble(null);
      const { rerender, unmount } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storage,
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      unmount();
      act(() => jest.advanceTimersByTime(300));

      expect(storage.setItem).not.toHaveBeenCalled();
    });

    it("AからBを保存後にAへ戻した変更も保存する", () => {
      const storage = storageDouble(null);
      const { rerender } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storage,
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(300));
      rerender({ label: "A" });
      act(() => jest.advanceTimersByTime(300));

      expect(storage.setItem).toHaveBeenNthCalledWith(
        1,
        "draw-my-map.map.v1",
        mapBJson,
      );
      expect(storage.setItem).toHaveBeenNthCalledWith(
        2,
        "draw-my-map.map.v1",
        mapAJson,
      );
    });

    it("保存失敗を通知し同じ内容への再変更で再試行する", () => {
      const setItem = jest.fn()
        .mockImplementationOnce(() => {
          throw new DOMException("full", "QuotaExceededError");
        })
        .mockImplementation(() => undefined);
      const storage = { getItem: jest.fn(() => null), setItem };
      const { result, rerender } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storage,
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(300));
      expect(result.current.notice).toEqual({
        kind: "error",
        message: "ブラウザへ自動保存できませんでした。",
      });

      rerender({ label: "A" });
      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(300));

      expect(setItem).toHaveBeenCalledTimes(2);
      expect(setItem).toHaveBeenLastCalledWith("draw-my-map.map.v1", mapBJson);
    });
  });

  describe("JSON入出力", () => {
    it("現在のスナップショットを書き出して成功を通知する", () => {
      const downloadJson = jest.fn();
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("A")],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storage: storageDouble(null),
        downloadJson,
      }));

      act(() => result.current.exportJson());

      expect(downloadJson).toHaveBeenCalledWith(mapAJson);
      expect(result.current.notice).toEqual({
        kind: "status",
        message: "JSONファイルを書き出しました。",
      });
    });

    it("書き出し例外をエラー通知へ変換する", () => {
      const downloadJson = jest.fn(() => {
        throw new Error("download failed");
      });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storage: storageDouble(null),
        downloadJson,
      }));

      act(() => result.current.exportJson());

      expect(result.current.notice).toEqual({
        kind: "error",
        message: "JSONファイルを書き出せませんでした。",
      });
    });

    it("検証済みファイルだけでマップ全体を置き換える", async () => {
      const file = new File([], "map.json", { type: "application/json" });
      const replaceMap = jest.fn();
      const readFile = jest.fn().mockResolvedValue({
        ok: true,
        value: storedMapJson,
      });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("現在")],
        layoutMode: "manual",
        replaceMap,
        storage: storageDouble(null),
        readFile,
      }));

      await act(async () => result.current.importJsonFile(file));

      expect(replaceMap).toHaveBeenCalledTimes(1);
      expect(replaceMap).toHaveBeenCalledWith({
        layoutMode: "auto",
        nodes: [{
          id: 10,
          parentId: null,
          x: 20,
          y: 30,
          width: 160,
          height: 64,
          label: "保存済み",
        }],
      });
      expect(result.current.notice).toEqual({
        kind: "status",
        message: "マップを読み込みました。",
      });
    });

    it("現在と同じ内容のインポートもブラウザ保存へ反映する", async () => {
      const storage = storageDouble(null);
      const readFile = jest.fn().mockResolvedValue({
        ok: true,
        value: mapAJson,
      });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("A")],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storage,
        readFile,
      }));

      await act(async () => result.current.importJsonFile(new File([], "map.json")));
      act(() => jest.advanceTimersByTime(300));

      expect(storage.setItem).toHaveBeenCalledWith(
        "draw-my-map.map.v1",
        mapAJson,
      );
    });

    it("ファイル読み取り失敗では現在のマップを変更しない", async () => {
      const replaceMap = jest.fn();
      const readFile = jest.fn().mockResolvedValue({
        ok: false,
        error: "JSONファイルを読み取れませんでした。",
      });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("現在")],
        layoutMode: "manual",
        replaceMap,
        storage: storageDouble(null),
        readFile,
      }));

      await act(async () => result.current.importJsonFile(new File([], "map.json")));

      expect(replaceMap).not.toHaveBeenCalled();
      expect(result.current.notice).toEqual({
        kind: "error",
        message: "JSONファイルを読み取れませんでした。現在のマップは変更されていません。",
      });
    });

    it("ファイル読み取り例外でも現在のマップを変更しない", async () => {
      const replaceMap = jest.fn();
      const readFile = jest.fn().mockRejectedValue(new Error("read failed"));
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("現在")],
        layoutMode: "manual",
        replaceMap,
        storage: storageDouble(null),
        readFile,
      }));

      await act(async () => result.current.importJsonFile(new File([], "map.json")));

      expect(replaceMap).not.toHaveBeenCalled();
      expect(result.current.notice).toEqual({
        kind: "error",
        message: "JSONファイルを読み取れませんでした。現在のマップは変更されていません。",
      });
    });

    it("不正JSONでは現在のマップを変更しない", async () => {
      const replaceMap = jest.fn();
      const readFile = jest.fn().mockResolvedValue({
        ok: true,
        value: "{broken",
      });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("現在")],
        layoutMode: "manual",
        replaceMap,
        storage: storageDouble(null),
        readFile,
      }));

      await act(async () => result.current.importJsonFile(new File([], "map.json")));

      expect(replaceMap).not.toHaveBeenCalled();
      expect(result.current.notice).toEqual({
        kind: "error",
        message: "JSONを解析できませんでした。現在のマップは変更されていません。",
      });
    });
  });
});
