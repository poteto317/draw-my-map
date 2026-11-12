import {
  emitStorageEventForTesting,
  subscribeStorageEvent,
  type StorageEventListener,
} from "../storageEventHub";

describe("storageEventHub", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    // 知見 L-643: テスト途中で expect が失敗しても確実にリスナーを全解除する
    while (cleanups.length > 0) {
      try {
        cleanups.pop()?.();
      } catch {
        // noop
      }
    }
  });

  function safeSubscribe(listener: StorageEventListener): () => void {
    const cleanup = subscribeStorageEvent(listener);
    cleanups.push(cleanup);
    return cleanup;
  }

  it("storage イベントリスナーを登録し、イベント発行時に呼び出されること", () => {
    const listener = jest.fn();
    safeSubscribe(listener);

    const event = new StorageEvent("storage", {
      key: "draw-my-map.maps.v1.doc.map-1",
      newValue: JSON.stringify({ version: 3 }),
    });
    emitStorageEventForTesting(event);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("クリーンアップ関数を呼び出すと購読が解除され、以降イベントが通知されないこと", () => {
    const listener = jest.fn();
    const cleanup = safeSubscribe(listener);

    const event1 = new StorageEvent("storage", { key: "key-1" });
    emitStorageEventForTesting(event1);
    expect(listener).toHaveBeenCalledTimes(1);

    cleanup();

    const event2 = new StorageEvent("storage", { key: "key-2" });
    emitStorageEventForTesting(event2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("複数のリスナーを個別に登録・解除できること", () => {
    const listenerA = jest.fn();
    const listenerB = jest.fn();
    const cleanupA = safeSubscribe(listenerA);
    safeSubscribe(listenerB);

    const event1 = new StorageEvent("storage", { key: "key-1" });
    emitStorageEventForTesting(event1);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);

    cleanupA();

    const event2 = new StorageEvent("storage", { key: "key-2" });
    emitStorageEventForTesting(event2);
    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(2);
  });

  it("window が未定義の環境では noop クリーンアップ関数を返すこと", () => {
    const originalWindow = global.window;
    try {
      // @ts-expect-error テスト用の一時的な未定義化
      delete global.window;
      const cleanup = subscribeStorageEvent(jest.fn());
      expect(typeof cleanup).toBe("function");
      expect(() => cleanup()).not.toThrow();
    } finally {
      // 知見 L-643: 必ず元の環境を復元する
      global.window = originalWindow;
    }
  });
});
