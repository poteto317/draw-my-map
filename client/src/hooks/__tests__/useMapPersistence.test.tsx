import { StrictMode, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { AUTO_SAVE_FAILURE_MESSAGE } from "@/domain/mapLibrary/mapLibraryMessages";
import { useMapPersistence } from "@/hooks/useMapPersistence";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";
import { createTestStorageSession } from "@/testing/createTestStorageSession";

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
  "version": 3,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 1,
      "parentId": null,
      "x": 10,
      "y": 20,
      "width": 160,
      "height": 64,
      "label": "B",
      "importance": "medium"
    }
  ]
}\n`;

const mapCJson = `{
  "version": 3,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 1,
      "parentId": null,
      "x": 10,
      "y": 20,
      "width": 160,
      "height": 64,
      "label": "C",
      "importance": "medium"
    }
  ]
}\n`;

const mapAJson = `{
  "version": 3,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 1,
      "parentId": null,
      "x": 10,
      "y": 20,
      "width": 160,
      "height": 64,
      "label": "A",
      "importance": "medium"
    }
  ]
}\n`;

function node(label: string): Node {
  return createTestNode({
    x: 10,
    y: 20,
    width: 160,
    height: 64,
    label,
  });
}

describe("useMapPersistence", () => {
  it("最新 editor JSON と初回失敗後の保存実績を session に登録する", () => {
    const storage = createTestStorageSession({ initialJson: "{" });
    const { rerender, unmount } = renderHook(
      ({ nodes }) => useMapPersistence({
        nodes,
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
      }),
      { initialProps: { nodes: [] as Node[] } },
    );
    expect(storage.session.readBackupSnapshot()).toMatchObject({
      hydrated: true, restoreOrigin: "failed", hasSavedBodyThisMount: false,
    });
    expect(storage.session.readBackupSnapshot()?.json).toContain('"nodes": []');
    expect(storage.session.readBody()).toEqual({ ok: true, value: "{" });
    expect(storage.callRegisteredFlush()).toEqual({ status: "unchanged" });
    expect(storage.session.readBackupSnapshot()?.hasSavedBodyThisMount).toBe(false);

    storage.setWriteOutcome("failed");
    rerender({ nodes: [node("A")] });
    act(() => { expect(storage.callRegisteredFlush().status).toBe("failed"); });
    expect(storage.session.readBackupSnapshot()?.hasSavedBodyThisMount).toBe(false);
    storage.setWriteOutcome("saved");
    act(() => { expect(storage.callRegisteredFlush()).toEqual({ status: "saved" }); });
    expect(storage.session.readBackupSnapshot()?.hasSavedBodyThisMount).toBe(true);

    rerender({ nodes: [node("B")] });
    expect(JSON.parse(storage.session.readBackupSnapshot()!.json).nodes[0].label).toBe("B");
    expect(storage.session.readBackupSnapshot()?.hasSavedBodyThisMount).toBe(true);
    storage.setWriteOutcome("failed");
    act(() => { expect(storage.callRegisteredFlush().status).toBe("failed"); });
    expect(storage.session.readBackupSnapshot()?.hasSavedBodyThisMount).toBe(true);
    unmount();
    expect(storage.session.readBackupSnapshot()).toBeNull();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("初期復元", () => {
    it("保存値がない場合は現在の空マップを維持して自動保存しない", () => {
      const storage = createTestStorageSession({ initialJson: null });
      const replaceMap = jest.fn();

      renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap,
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
      }));
      act(() => jest.advanceTimersByTime(300));

      expect(replaceMap).not.toHaveBeenCalled();
      expect(storage.writes).toEqual([]);
    });

    it("本体なしのsaveStatusを返す", () => {
      const storage = createTestStorageSession({ initialJson: null });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
      }));
      expect(result.current.saveStatus).toBe("beforeSave");
    });

    it("検証済みの保存値を一度だけ復元する", () => {
      const storage = createTestStorageSession({ initialJson: storedMapJson });
      const replaceMap = jest.fn();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      );

      renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap,
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
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
          importance: "medium" as const,
        }],
      });
    });

    it("壊れた保存値を空マップで上書きしない", () => {
      const storage = createTestStorageSession({ initialJson: "{broken" });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
      }));
      act(() => jest.advanceTimersByTime(300));

      expect(storage.writes).toEqual([]);
      expect(result.current.notice).toEqual({
        kind: "warning",
        message: "保存データを復元できませんでした。空のマップで開始します。",
      });
    });

    it("Storage読み取り例外を警告へ変換して現在状態を維持する", () => {
      const storage = createTestStorageSession({
        readError: "ブラウザの保存データを読み取れませんでした。",
      });
      const replaceMap = jest.fn();
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("現在")],
        layoutMode: "manual",
        replaceMap,
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
      }));

      expect(replaceMap).not.toHaveBeenCalled();
      expect(result.current.notice?.kind).toBe("warning");
      expect(storage.writes).toEqual([]);
    });

    it("storageSessionのreadBodyの内容を復元する", () => {
      const storage = createTestStorageSession({ initialJson: mapBJson });
      const replaceMap = jest.fn();

      renderHook(() => useMapPersistence({
        nodes: [],
        layoutMode: "manual",
        replaceMap,
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
      }));

      expect(replaceMap).toHaveBeenCalledTimes(1);
      expect(replaceMap).toHaveBeenCalledWith({
        layoutMode: "manual",
        nodes: [node("B")],
      });
    });

    it("V1復元済みスナップショットを300ms後にV2で書き戻す", () => {
      const storage = createTestStorageSession({ initialJson: storedMapJson });

      const { rerender } = renderHook(
        ({ nodes }) => useMapPersistence({
          nodes,
          layoutMode: nodes.length === 0 ? "manual" : "auto",
          replaceMap: jest.fn(),
          storageSession: storage.session,
        storageMode: "persistent",
          mapName: "旅行",
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
        importance: "medium" as const,
      }] });
      act(() => jest.advanceTimersByTime(300));

      expect(storage.writes).toEqual([`{
  "version": 3,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "保存済み",
      "importance": "medium"
    }
  ]
}\n`]);
    });
  });

  describe("自動保存", () => {
    it("連続変更から300ms後に最新スナップショットだけを保存する", () => {
      const storage = createTestStorageSession({ initialJson: null });
      const { rerender } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storageSession: storage.session,
        storageMode: "persistent",
          mapName: "旅行",
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(200));
      rerender({ label: "C" });
      act(() => jest.advanceTimersByTime(299));
      expect(storage.writes).toEqual([]);

      act(() => jest.advanceTimersByTime(1));
      expect(storage.writes).toEqual([mapCJson]);
    });

    it("unmount時に保留中の保存を破棄する", () => {
      const storage = createTestStorageSession({ initialJson: null });
      const { rerender, unmount } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storageSession: storage.session,
        storageMode: "persistent",
          mapName: "旅行",
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      unmount();
      act(() => jest.advanceTimersByTime(300));

      expect(storage.writes).toEqual([]);
    });

    it("AからBを保存後にAへ戻した変更も保存する", () => {
      const storage = createTestStorageSession({ initialJson: null });
      const { rerender } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storageSession: storage.session,
        storageMode: "persistent",
          mapName: "旅行",
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(300));
      rerender({ label: "A" });
      act(() => jest.advanceTimersByTime(300));

      expect(storage.writes).toEqual([mapBJson, mapAJson]);
    });

    it("保存失敗を通知し同じ内容への再変更で再試行する", () => {
      const storage = createTestStorageSession({ initialJson: null });
      storage.setWriteOutcome("failed");
      const { result, rerender } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storageSession: storage.session,
        storageMode: "persistent",
          mapName: "旅行",
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(300));
      expect(result.current.notice).toEqual({
        kind: "error",
        message: AUTO_SAVE_FAILURE_MESSAGE,
      });
      expect(storage.writes).toEqual([]);

      storage.setWriteOutcome("saved");
      rerender({ label: "A" });
      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(300));

      expect(storage.writes).toEqual([mapBJson]);
    });
  });

  describe("保存待ちの flush", () => {
    it("flush の保存に成功したら自動保存の失敗の通知を消す", () => {
      const storage = createTestStorageSession({ initialJson: null });
      storage.setWriteOutcome("failed");
      const { result, rerender } = renderHook(
        ({ label }) => useMapPersistence({
          nodes: [node(label)],
          layoutMode: "manual",
          replaceMap: jest.fn(),
          storageSession: storage.session,
        storageMode: "persistent",
          mapName: "旅行",
        }),
        { initialProps: { label: "A" } },
      );

      rerender({ label: "B" });
      act(() => jest.advanceTimersByTime(300));
      expect(result.current.notice).toEqual({
        kind: "error",
        message: AUTO_SAVE_FAILURE_MESSAGE,
      });

      storage.setWriteOutcome("saved");
      let flushed: unknown;
      act(() => {
        flushed = storage.callRegisteredFlush();
      });

      expect(flushed).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([mapBJson]);
      expect(result.current.notice).toBeNull();
    });

    it("flush の保存に成功しても JSON 読み込みの通知は残す", async () => {
      const storage = createTestStorageSession({ initialJson: null });
      const readFile = jest.fn().mockResolvedValue({
        ok: true,
        value: mapAJson,
      });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("A")],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
        readFile,
      }));

      await act(async () => result.current.importJsonFile(new File([], "map.json")));
      expect(result.current.notice).toEqual({
        kind: "status",
        message: "マップを読み込みました。",
      });

      let flushed: unknown;
      act(() => {
        flushed = storage.callRegisteredFlush();
      });

      expect(flushed).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([mapAJson]);
      expect(result.current.notice).toEqual({
        kind: "status",
        message: "マップを読み込みました。",
      });
    });
  });

  describe("JSON入出力", () => {
    it("現在のスナップショットを書き出して成功を通知する", () => {
      const downloadJson = jest.fn();
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("A")],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storageSession: createTestStorageSession().session,
        storageMode: "persistent",
        mapName: "旅行",
        downloadJson,
      }));

      act(() => result.current.exportJson());

      expect(downloadJson).toHaveBeenCalledWith(mapAJson, "旅行");
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
        storageSession: createTestStorageSession().session,
        storageMode: "persistent",
        mapName: "旅行",
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
        storageSession: createTestStorageSession().session,
        storageMode: "persistent",
        mapName: "旅行",
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
          importance: "medium" as const,
        }],
      });
      expect(result.current.notice).toEqual({
        kind: "status",
        message: "マップを読み込みました。",
      });
    });

    it("現在と同じ内容のインポートもブラウザ保存へ反映する", async () => {
      const storage = createTestStorageSession({ initialJson: null });
      const readFile = jest.fn().mockResolvedValue({
        ok: true,
        value: mapAJson,
      });
      const { result } = renderHook(() => useMapPersistence({
        nodes: [node("A")],
        layoutMode: "manual",
        replaceMap: jest.fn(),
        storageSession: storage.session,
        storageMode: "persistent",
        mapName: "旅行",
        readFile,
      }));

      await act(async () => result.current.importJsonFile(new File([], "map.json")));
      act(() => jest.advanceTimersByTime(300));

      expect(storage.writes).toEqual([mapAJson]);
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
        storageSession: createTestStorageSession().session,
        storageMode: "persistent",
        mapName: "旅行",
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
        storageSession: createTestStorageSession().session,
        storageMode: "persistent",
        mapName: "旅行",
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
        storageSession: createTestStorageSession().session,
        storageMode: "persistent",
        mapName: "旅行",
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
