import { createTestStorageSession } from "@/testing/createTestStorageSession";

describe("createTestStorageSession", () => {
  it("snapshot の未登録・更新・解除を再現し、保存済み本体を代用しない", () => {
    const storage = createTestStorageSession({ initialJson: "persisted" });
    const snapshot = { json: "editor", hydrated: true, restoreOrigin: "failed" as const, hasSavedBodyThisMount: false };
    expect(storage.session.readBackupSnapshot()).toBeNull();
    const unregister = storage.session.registerBackupSnapshot(() => snapshot);
    expect(storage.session.readBackupSnapshot()).toEqual(snapshot);
    unregister();
    expect(storage.session.readBackupSnapshot()).toBeNull();
    expect(storage.session.readBody()).toEqual({ ok: true, value: "persisted" });
  });

  it("登録した flush の数を数え、解除で減らす", () => {
    const storage = createTestStorageSession();
    expect(storage.registeredFlushCount()).toBe(0);

    const unregisterFirst = storage.session.registerFlush(() => ({ status: "saved" }));
    const unregisterSecond = storage.session.registerFlush(() => ({ status: "saved" }));
    expect(storage.registeredFlushCount()).toBe(2);

    unregisterFirst();
    expect(storage.registeredFlushCount()).toBe(1);
    unregisterSecond();
    expect(storage.registeredFlushCount()).toBe(0);
  });

  it("登録が無いときの callRegisteredFlush は unchanged を返す", () => {
    const storage = createTestStorageSession();

    expect(storage.callRegisteredFlush()).toEqual({ status: "unchanged" });
  });

  it("callRegisteredFlush は最後に登録した flush だけを呼び、その結果を返す", () => {
    const storage = createTestStorageSession();
    const first = jest.fn(() => ({ status: "saved" as const }));
    const second = jest.fn(() => ({ status: "failed" as const, error: "失敗" }));
    storage.session.registerFlush(first);
    storage.session.registerFlush(second);

    expect(storage.callRegisteredFlush()).toEqual({ status: "failed", error: "失敗" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("解除した後の callRegisteredFlush は unchanged を返し、解除した flush を呼ばない", () => {
    const storage = createTestStorageSession();
    const flush = jest.fn(() => ({ status: "saved" as const }));
    const unregister = storage.session.registerFlush(flush);

    unregister();

    expect(storage.callRegisteredFlush()).toEqual({ status: "unchanged" });
    expect(flush).not.toHaveBeenCalled();
  });

  it("同じ関数を二重に登録しても、解除は1件ずつ行う", () => {
    const storage = createTestStorageSession();
    const flush = jest.fn(() => ({ status: "saved" as const }));
    const unregisterFirst = storage.session.registerFlush(flush);
    storage.session.registerFlush(flush);

    unregisterFirst();

    expect(storage.registeredFlushCount()).toBe(1);
    expect(storage.callRegisteredFlush()).toEqual({ status: "saved" });
  });
});
