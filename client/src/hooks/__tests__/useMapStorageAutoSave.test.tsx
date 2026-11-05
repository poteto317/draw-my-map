import { act, renderHook } from "@testing-library/react";
import { AUTO_SAVE_FAILURE_MESSAGE } from "@/domain/mapLibrary/mapLibraryMessages";
import { useMapStorageAutoSave } from "@/hooks/useMapStorageAutoSave";
import {
  createTestStorageSession,
  type TestStorageSession,
} from "@/testing/createTestStorageSession";

const emptyMapJson = `{
  "version": 2,
  "layoutMode": "manual",
  "nodes": []
}\n`;

const changedMapJson = `{
  "version": 2,
  "layoutMode": "auto",
  "nodes": []
}\n`;

const otherMapJson = `{
  "version": 2,
  "layoutMode": "manual",
  "nodes": [],
  "other": true
}\n`;

function flushInAct<T>(flush: () => T): T {
  let result!: T;
  act(() => { result = flush(); });
  return result;
}

describe("useMapStorageAutoSave", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("復元基準から変化した最新snapshotを300ms後に保存する", () => {
    const storage = createTestStorageSession();
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([]);

    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([changedMapJson]);
  });

  it("明示要求された現在snapshotを保存する", () => {
    const storage = createTestStorageSession();
    const { result } = renderHook(() => useMapStorageAutoSave({
      currentSnapshot: emptyMapJson,
      hydrated: true,
      initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
      publishNotice: jest.fn(),
      writeBody: storage.session.writeBody,
      clearSaveFailureNotice: jest.fn(),
    }));

    act(() => result.current.requestSnapshotSave(emptyMapJson));
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([emptyMapJson]);
  });

  it("保存の失敗を1回通知し、次の変更で再試行する", () => {
    const storage = createTestStorageSession();
    const publishNotice = jest.fn();
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice,
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    storage.setWriteOutcome("failed");
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([]);
    expect(publishNotice).toHaveBeenCalledTimes(1);
    expect(publishNotice).toHaveBeenCalledWith({
      kind: "error",
      message: AUTO_SAVE_FAILURE_MESSAGE,
    });

    storage.setWriteOutcome("saved");
    rerender({ snapshot: emptyMapJson });
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([changedMapJson]);
    expect(publishNotice).toHaveBeenCalledTimes(1);
  });

  it("保存先が無効なときは通知せず、次の変更で再試行する", () => {
    const storage = createTestStorageSession();
    const publishNotice = jest.fn();
    const { rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice,
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );

    storage.setWriteOutcome("inactive");
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([]);
    expect(publishNotice).not.toHaveBeenCalled();

    // inactive では最後に保存した内容を更新しないので、同じ内容への再変更も保存する
    storage.setWriteOutcome("saved");
    rerender({ snapshot: emptyMapJson });
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([changedMapJson]);

    rerender({ snapshot: otherMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([changedMapJson, otherMapJson]);
    expect(publishNotice).not.toHaveBeenCalled();
  });

  it("復元前はcheckingで保存せず、復元失敗の仮基準は保存済みにしない", () => {
    const storage = createTestStorageSession();
    const { result, rerender } = renderHook(
      ({ hydrated, origin }) => useMapStorageAutoSave({
        currentSnapshot: emptyMapJson,
        hydrated,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: origin as "failed" | null,
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { hydrated: false, origin: null as "failed" | null } },
    );
    expect(result.current.saveStatus).toBe("checking");
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
    rerender({ hydrated: true, origin: "failed" });
    expect(result.current.saveStatus).toBe("restoreFailed");
    expect(storage.writes).toEqual([]);
  });

  it("失敗後は編集してもfailedを維持し、既知の基準へ戻ると通知を消す", () => {
    const storage = createTestStorageSession();
    const clearSaveFailureNotice = jest.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice,
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    expect(result.current.saveStatus).toBe("saved");
    storage.setWriteOutcome("failed");
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("failed");
    rerender({ snapshot: otherMapJson });
    expect(result.current.saveStatus).toBe("failed");
    rerender({ snapshot: emptyMapJson });
    expect(result.current.saveStatus).toBe("saved");
    expect(clearSaveFailureNotice).toHaveBeenCalledTimes(1);
  });

  it("タイマー保存成功でfailedと失敗通知を消す", () => {
    const storage = createTestStorageSession();
    const clearSaveFailureNotice = jest.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice,
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    storage.setWriteOutcome("failed");
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("failed");
    storage.setWriteOutcome("saved");
    rerender({ snapshot: otherMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("saved");
    expect(clearSaveFailureNotice).toHaveBeenCalledTimes(1);
  });

  it("強制保存Aの失敗後にBのタイマー保存が成功すると古い要求を解消する", () => {
    const storage = createTestStorageSession();
    const clearSaveFailureNotice = jest.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice,
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    rerender({ snapshot: changedMapJson });
    act(() => result.current.requestSnapshotSave(changedMapJson));
    storage.setWriteOutcome("failed");
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("failed");

    storage.setWriteOutcome("saved");
    rerender({ snapshot: otherMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("saved");
    expect(clearSaveFailureNotice).toHaveBeenCalledTimes(1);
    expect(storage.writes).toEqual([otherMapJson]);
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([otherMapJson]);
  });

  it("強制保存Aの失敗後にBのflushが成功すると古い要求を解消する", () => {
    const storage = createTestStorageSession();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    rerender({ snapshot: changedMapJson });
    act(() => result.current.requestSnapshotSave(changedMapJson));
    storage.setWriteOutcome("failed");
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "failed", error: "テスト用の保存失敗" });
    storage.setWriteOutcome("saved");
    rerender({ snapshot: otherMapJson });
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "saved" });
    expect(result.current.saveStatus).toBe("saved");
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
    expect(storage.writes).toEqual([otherMapJson]);
  });

  it("強制保存Aの後に確認済みCへ編集で戻ると古い要求を失効し、書かない", () => {
    const storage = createTestStorageSession();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    rerender({ snapshot: changedMapJson });
    act(() => result.current.requestSnapshotSave(changedMapJson));
    expect(result.current.saveStatus).toBe("pending");
    rerender({ snapshot: emptyMapJson });
    expect(result.current.saveStatus).toBe("saved");
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([]);
  });

  it("強制保存Aの失敗後に確認済みCへ戻ると失敗と通知を解除する", () => {
    const storage = createTestStorageSession();
    const clearSaveFailureNotice = jest.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice,
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    rerender({ snapshot: changedMapJson });
    act(() => result.current.requestSnapshotSave(changedMapJson));
    storage.setWriteOutcome("failed");
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("failed");
    rerender({ snapshot: emptyMapJson });
    expect(result.current.saveStatus).toBe("saved");
    expect(clearSaveFailureNotice).toHaveBeenCalledTimes(1);
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
    expect(storage.writes).toEqual([]);
  });

  it("強制保存Aの失敗後に仮基準へ戻っても失敗を維持する", () => {
    const storage = createTestStorageSession();
    const clearSaveFailureNotice = jest.fn();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "empty",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice,
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    rerender({ snapshot: changedMapJson });
    act(() => result.current.requestSnapshotSave(changedMapJson));
    storage.setWriteOutcome("failed");
    act(() => jest.advanceTimersByTime(300));
    rerender({ snapshot: emptyMapJson });
    expect(result.current.saveStatus).toBe("failed");
    expect(clearSaveFailureNotice).not.toHaveBeenCalled();
    expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
  });

  it("Aの書込中に発生した新しいBの強制要求はAの成功で消さない", () => {
    const storage = createTestStorageSession();
    let requestNewSave: (() => void) | null = null;
    const writeBody = (snapshot: string) => {
      if (snapshot === changedMapJson) requestNewSave?.();
      return storage.session.writeBody(snapshot);
    };
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    rerender({ snapshot: changedMapJson });
    requestNewSave = () => result.current.requestSnapshotSave(otherMapJson);
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("pending");
    rerender({ snapshot: otherMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(storage.writes).toEqual([changedMapJson, otherMapJson]);
    expect(result.current.saveStatus).toBe("saved");
  });

  it("空の仮基準はbeforeSaveで、失敗後は戻ってもfailedを維持する", () => {
    const storage = createTestStorageSession();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "empty",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    expect(result.current.saveStatus).toBe("beforeSave");
    storage.setWriteOutcome("failed");
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("failed");
    rerender({ snapshot: emptyMapJson });
    expect(result.current.saveStatus).toBe("failed");
    expect(storage.writes).toEqual([]);
  });

  it("保護モードは復元結果や編集より優先する", () => {
    const storage = createTestStorageSession();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "protected",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    expect(result.current.saveStatus).toBe("protected");
    rerender({ snapshot: changedMapJson });
    expect(result.current.saveStatus).toBe("protected");
  });

  it("同じsnapshotの強制要求は保存完了までpendingを保つ", () => {
    const storage = createTestStorageSession();
    const { result } = renderHook(() => useMapStorageAutoSave({
      currentSnapshot: emptyMapJson,
      hydrated: true,
      initialPersistedSnapshot: emptyMapJson,
      restoreOrigin: "restored",
      storageMode: "persistent",
      publishNotice: jest.fn(),
      writeBody: storage.session.writeBody,
      clearSaveFailureNotice: jest.fn(),
    }));
    act(() => result.current.requestSnapshotSave(emptyMapJson));
    expect(result.current.saveStatus).toBe("pending");
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("saved");
  });

  it("inactiveは保存成功にせずpendingを保つ", () => {
    const storage = createTestStorageSession();
    const { result, rerender } = renderHook(
      ({ snapshot }) => useMapStorageAutoSave({
        currentSnapshot: snapshot,
        hydrated: true,
        initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
        publishNotice: jest.fn(),
        writeBody: storage.session.writeBody,
        clearSaveFailureNotice: jest.fn(),
      }),
      { initialProps: { snapshot: emptyMapJson } },
    );
    storage.setWriteOutcome("inactive");
    rerender({ snapshot: changedMapJson });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.saveStatus).toBe("pending");
    expect(storage.writes).toEqual([]);
  });

  describe("flushPendingSave", () => {
    function renderAutoSave(
      storage: TestStorageSession,
      options: { hydrated?: boolean } = {},
    ) {
      const publishNotice = jest.fn();
      const clearSaveFailureNotice = jest.fn();
      const rendered = renderHook(
        ({ snapshot, hydrated }) => useMapStorageAutoSave({
          currentSnapshot: snapshot,
          hydrated,
          initialPersistedSnapshot: emptyMapJson,
        restoreOrigin: "restored",
        storageMode: "persistent",
          publishNotice,
          writeBody: storage.session.writeBody,
          clearSaveFailureNotice,
        }),
        { initialProps: { snapshot: emptyMapJson, hydrated: options.hydrated ?? true } },
      );
      return { ...rendered, publishNotice, clearSaveFailureNotice };
    }

    it("300ms未満の保存待ちを同期で1回だけ書き、後からタイマーで書き直さない", () => {
      const storage = createTestStorageSession();
      const { result, rerender, clearSaveFailureNotice } = renderAutoSave(storage);

      rerender({ snapshot: changedMapJson, hydrated: true });
      act(() => jest.advanceTimersByTime(299));
      expect(storage.writes).toEqual([]);

      let flushed: unknown;
      act(() => {
        flushed = flushInAct(result.current.flushPendingSave);
      });
      expect(flushed).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([changedMapJson]);
      expect(clearSaveFailureNotice).toHaveBeenCalledTimes(1);

      act(() => jest.advanceTimersByTime(300));
      expect(storage.writes).toEqual([changedMapJson]);
    });

    it("変更が無ければ unchanged を返して書かない", () => {
      const storage = createTestStorageSession();
      const { result, clearSaveFailureNotice } = renderAutoSave(storage);

      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
      expect(storage.writes).toEqual([]);
      expect(clearSaveFailureNotice).not.toHaveBeenCalled();
    });

    it("保存した後の再度の flush は unchanged を返す", () => {
      const storage = createTestStorageSession();
      const { result, rerender } = renderAutoSave(storage);

      rerender({ snapshot: changedMapJson, hydrated: true });
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "saved" });
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
      expect(storage.writes).toEqual([changedMapJson]);
    });

    it("復元前は unchanged を返して書かない", () => {
      const storage = createTestStorageSession();
      const { result, rerender } = renderAutoSave(storage, { hydrated: false });

      rerender({ snapshot: changedMapJson, hydrated: false });
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
      act(() => jest.advanceTimersByTime(300));
      expect(storage.writes).toEqual([]);
    });

    it("書き込みの失敗は failed を返し、エディタに自動保存の失敗を通知し、保存待ちのタイマーも取り消す", () => {
      const storage = createTestStorageSession();
      const { result, rerender, publishNotice, clearSaveFailureNotice } = renderAutoSave(storage);

      storage.setWriteOutcome("failed");
      rerender({ snapshot: changedMapJson, hydrated: true });
      act(() => {
        expect(flushInAct(result.current.flushPendingSave)).toEqual({
          status: "failed",
          error: "テスト用の保存失敗",
        });
      });
      // ダイアログを閉じても未保存であることが残るよう、エディタの通知にも出す
      expect(publishNotice).toHaveBeenCalledTimes(1);
      expect(publishNotice).toHaveBeenCalledWith({
        kind: "error",
        message: AUTO_SAVE_FAILURE_MESSAGE,
      });
      expect(clearSaveFailureNotice).not.toHaveBeenCalled();

      // タイマーが残っていれば、保存できる状態に戻したときに書かれてしまう
      storage.setWriteOutcome("saved");
      act(() => jest.advanceTimersByTime(300));
      expect(storage.writes).toEqual([]);
      expect(publishNotice).toHaveBeenCalledTimes(1);

      // 失敗では最後に保存した内容を更新しないので、次の flush で書き直せる
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([changedMapJson]);
    });

    it("保存先が無効なら unchanged を返し、通知も保存済みの更新もしない", () => {
      const storage = createTestStorageSession();
      const { result, rerender, publishNotice, clearSaveFailureNotice } = renderAutoSave(storage);

      storage.setWriteOutcome("inactive");
      rerender({ snapshot: changedMapJson, hydrated: true });
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
      expect(publishNotice).not.toHaveBeenCalled();
      expect(clearSaveFailureNotice).not.toHaveBeenCalled();

      storage.setWriteOutcome("saved");
      act(() => jest.advanceTimersByTime(300));
      expect(storage.writes).toEqual([]);
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([changedMapJson]);
    });

    it("明示要求の直後の flush は同じ内容でも書く", () => {
      const storage = createTestStorageSession();
      const { result } = renderAutoSave(storage);

      act(() => result.current.requestSnapshotSave(emptyMapJson));
      let flushed: unknown;
      act(() => {
        flushed = flushInAct(result.current.flushPendingSave);
      });
      expect(flushed).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([emptyMapJson]);

      // 強制保存の要求は消えているので、タイマーでも次の flush でも書き直さない
      act(() => jest.advanceTimersByTime(300));
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "unchanged" });
      expect(storage.writes).toEqual([emptyMapJson]);
    });

    it("rerender 直後の flush はコミットされた最新の内容を書く", () => {
      const storage = createTestStorageSession();
      const { result, rerender } = renderAutoSave(storage);

      rerender({ snapshot: changedMapJson, hydrated: true });
      rerender({ snapshot: otherMapJson, hydrated: true });
      expect(flushInAct(result.current.flushPendingSave)).toEqual({ status: "saved" });
      expect(storage.writes).toEqual([otherMapJson]);
    });

    it("flushPendingSave は再レンダーで同じ関数のまま変わらない", () => {
      const storage = createTestStorageSession();
      const { result, rerender } = renderAutoSave(storage);
      const first = result.current.flushPendingSave;

      rerender({ snapshot: changedMapJson, hydrated: true });
      expect(result.current.flushPendingSave).toBe(first);
    });

    it("アンマウントでは保存待ちを書かずに破棄する", () => {
      const storage = createTestStorageSession();
      const { rerender, unmount } = renderAutoSave(storage);

      rerender({ snapshot: changedMapJson, hydrated: true });
      unmount();
      act(() => jest.advanceTimersByTime(300));
      expect(storage.writes).toEqual([]);
    });
  });
});
