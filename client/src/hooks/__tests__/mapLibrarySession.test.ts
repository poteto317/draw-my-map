import { encodeMapIndex, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import {
  createPersistentMapSession,
  flushRegisteredSession,
  type FlushRegistration,
  type PersistentMapSessionContext,
} from "@/hooks/mapLibrarySession";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "@/services/persistence/mapLibraryStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

const SEED = "2026-01-01T00:00:00.000Z";
const NOW = "2026-10-30T01:02:03.000Z";

function indexOf(currentMapId: string, ids: readonly string[]): MapIndexV1 {
  return {
    version: 1,
    currentMapId,
    maps: ids.map((id) => ({ id, name: id, createdAt: SEED, updatedAt: SEED })),
    legacyCleanupPending: false,
  };
}

// 現在のセッション番号とインデックスをテストから書き換えられる文脈で、マップ a のセッションを作る
function setup(options: {
  sessionNumber?: number;
  index?: MapIndexV1 | null;
  failSetItem?: (key: string) => boolean;
  bodies?: Readonly<Record<string, string>>;
} = {}) {
  const index = options.index === undefined ? indexOf("a", ["a", "b"]) : options.index;
  const { storage, entries } = createRecordingStorage({
    initial: {
      ...options.bodies,
      ...(index === null ? {} : { [MAP_INDEX_STORAGE_KEY]: encodeMapIndex(index) }),
    },
    failSetItem: options.failSetItem,
  });
  const state = {
    activeSessionNumber: options.sessionNumber ?? 0,
    activeIndex: index,
  };
  const commitIndex = jest.fn((next: MapIndexV1) => {
    state.activeIndex = next;
  });
  const flushSlot: { current: FlushRegistration | null } = { current: null };
  const backupSnapshotSlot: PersistentMapSessionContext["backupSnapshotSlot"] = { current: null };
  const context: PersistentMapSessionContext = {
    storage,
    mapId: "a",
    sessionNumber: options.sessionNumber ?? 0,
    getActiveSessionNumber: () => state.activeSessionNumber,
    getActiveIndex: () => state.activeIndex,
    now: () => new Date(NOW),
    commitIndex,
    flushSlot,
    backupSnapshotSlot,
  };
  return { session: createPersistentMapSession(context), state, entries, commitIndex, flushSlot, storage, context };
}

describe("createPersistentMapSession", () => {
  it("sessionNumber と storage をプロパティとして公開する", () => {
    const { session, context } = setup({ sessionNumber: 42 });

    expect(session.sessionNumber).toBe(42);
    expect(session.storage).toBe(context.storage);
  });

  it("mapId と、作ったときのマップの本体を読む readBody を持つ", () => {
    const { session } = setup({
      bodies: { [mapBodyKey("a")]: "json-a", [mapBodyKey("b")]: "json-b" },
    });

    expect(session.mapId).toBe("a");
    expect(session.readBody()).toEqual({ ok: true, value: "json-a" });
  });

  it("現在のセッションなら本体を書き、そのマップの更新日時だけを進めたインデックスを書いて反映する", () => {
    const { session, entries, commitIndex } = setup();

    expect(session.writeBody("json-a")).toEqual({ status: "saved" });

    expect(entries()[mapBodyKey("a")]).toBe("json-a");
    expect(commitIndex).toHaveBeenCalledTimes(1);
    const touched = commitIndex.mock.calls[0][0];
    expect(touched.maps.find((map) => map.id === "a")?.updatedAt).toBe(NOW);
    expect(touched.maps.find((map) => map.id === "b")?.updatedAt).toBe(SEED);
    expect(entries()[MAP_INDEX_STORAGE_KEY]).toBe(encodeMapIndex(touched));
  });

  it("セッション番号が進んだ後は書かずに inactive を返す（同じ mapId に戻っても区別する）", () => {
    const { session, state, entries, commitIndex } = setup({ sessionNumber: 1 });
    state.activeSessionNumber = 2;

    expect(session.writeBody("stale")).toEqual({ status: "inactive" });
    expect(entries()[mapBodyKey("a")]).toBeUndefined();
    expect(commitIndex).not.toHaveBeenCalled();
  });

  it("インデックスが無い（通常のモードでない）か、マップが一覧から消えていれば inactive を返す", () => {
    const missing = setup({ index: null });
    expect(missing.session.writeBody("json")).toEqual({ status: "inactive" });

    const removed = setup();
    removed.state.activeIndex = indexOf("b", ["b"]);
    expect(removed.session.writeBody("json")).toEqual({ status: "inactive" });
    expect(removed.entries()[mapBodyKey("a")]).toBeUndefined();
  });

  it("本体を書けなければ failed を返し、インデックスは反映しない", () => {
    const { session, commitIndex } = setup({ failSetItem: (key) => key === mapBodyKey("a") });

    const result = session.writeBody("json");

    expect(result.status).toBe("failed");
    expect(commitIndex).not.toHaveBeenCalled();
  });

  it("インデックスを書けなくても本体は保存済みとして saved を返し、インデックスは反映しない", () => {
    const { session, entries, commitIndex } = setup({
      failSetItem: (key) => key === MAP_INDEX_STORAGE_KEY,
    });

    expect(session.writeBody("json")).toEqual({ status: "saved" });
    expect(entries()[mapBodyKey("a")]).toBe("json");
    expect(commitIndex).not.toHaveBeenCalled();
  });

  it("ストレージ上の内容がセッション作成時（lastPersistedSnapshotRef）と異なる場合、writeBody は conflict を返し上書きしない", () => {
    const { session, entries, commitIndex, storage } = setup({
      bodies: { [mapBodyKey("a")]: "initial-body" },
    });

    // 別タブ等でストレージ上のマップ本体が更新された状況を模倣
    storage.setItem(mapBodyKey("a"), "externally-updated-body");

    const result = session.writeBody("local-edits");

    expect(result).toEqual({ status: "conflict" });
    // ストレージ上の値は外部更新された値のまま保持され、ローカル編集で上書きされない
    expect(entries()[mapBodyKey("a")]).toBe("externally-updated-body");
    expect(commitIndex).not.toHaveBeenCalled();
  });

  it("保存成功時に lastPersistedSnapshotRef が更新され、次回の保存直前検証に反映される", () => {
    const { session, entries, storage } = setup({
      bodies: { [mapBodyKey("a")]: "initial-body" },
    });

    // 1回目の保存は一致しているので成功する
    const firstResult = session.writeBody("first-save");
    expect(firstResult).toEqual({ status: "saved" });
    expect(entries()[mapBodyKey("a")]).toBe("first-save");

    // 2回目を保存する前に別タブが上書き
    storage.setItem(mapBodyKey("a"), "external-after-first-save");

    const secondResult = session.writeBody("second-save");
    expect(secondResult).toEqual({ status: "conflict" });
    expect(entries()[mapBodyKey("a")]).toBe("external-after-first-save");
  });

  it("rebaseSnapshot を呼ぶと基準値（lastPersistedSnapshotRef）が更新され、新しい内容をベースに保存できる", () => {
    const { session, entries, storage } = setup({
      bodies: { [mapBodyKey("a")]: "initial-body" },
    });

    // 外部からストレージが更新される
    storage.setItem(mapBodyKey("a"), "external-body");

    // そのまま書こうとすると conflict
    expect(session.writeBody("local-conflict")).toEqual({ status: "conflict" });

    // 最新内容をリベース
    session.rebaseSnapshot?.("external-body");

    // リベース後は external-body を基準に新しい書き込みが成功する
    expect(session.writeBody("rebased-local-write")).toEqual({ status: "saved" });
    expect(entries()[mapBodyKey("a")]).toBe("rebased-local-write");
  });

  it("初期状態で本体が存在しない新規マップで、別タブが本体を書いた後に自タブが writeBody すると conflict を返す", () => {
    // bodies を指定せず、初期ストレージにマップ本体が存在しない（null）状態
    const { session, entries, commitIndex, storage } = setup();

    expect(storage.getItem(mapBodyKey("a"))).toBeNull();

    // 自タブが保存する前に別タブが同じマップを書き込んだ状況を模倣
    storage.setItem(mapBodyKey("a"), "external-first-write");

    const result = session.writeBody("local-first-write");

    expect(result).toEqual({ status: "conflict" });
    expect(entries()[mapBodyKey("a")]).toBe("external-first-write");
    expect(commitIndex).not.toHaveBeenCalled();
  });

  it("初期状態で本体が存在しない新規マップで、readBody を呼んでも lastPersistedSnapshotRef が別タブの値で上書きされない", () => {
    const { session, storage } = setup();

    // 自タブのセッション作成時点ではストレージに本体がない（null）
    expect(storage.getItem(mapBodyKey("a"))).toBeNull();

    // 別タブが本体を書き込む
    storage.setItem(mapBodyKey("a"), "external-body");

    // 自タブが readBody() を呼ぶ（別タブの値を読み取るが、lastPersistedSnapshotRef は初期の null を維持すべき）
    const readResult = session.readBody();
    expect(readResult).toEqual({ ok: true, value: "external-body" });

    // その後自タブが writeBody を呼ぶと、初期状態（null）からの外部変更検知により conflict となるべき
    const writeResult = session.writeBody("local-write");
    expect(writeResult).toEqual({ status: "conflict" });
  });

  it("writeBody 直前の readMapBody 読み取り失敗時は failed を返し、本体書き込みやインデックス反映を行わない", () => {
    const { session, entries, commitIndex, storage } = setup({
      bodies: { [mapBodyKey("a")]: "initial-body" },
    });

    const getItemSpy = jest.spyOn(storage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    try {
      const result = session.writeBody("local-edits");
      expect(result.status).toBe("failed");
      expect(entries()[mapBodyKey("a")]).toBe("initial-body");
      expect(commitIndex).not.toHaveBeenCalled();
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it("registerFlush は現在のセッションの登録を置き、解除では自分の登録だけを外す", () => {
    const { session, flushSlot } = setup({ sessionNumber: 3 });
    const flush = jest.fn(() => ({ status: "saved" as const }));

    const unregister = session.registerFlush(flush);
    expect(flushSlot.current).toEqual({ session: 3, flush: expect.any(Function) });
    expect(flushSlot.current?.flush()).toEqual({ status: "saved" });
    expect(flush).toHaveBeenCalledTimes(1);

    const other: FlushRegistration = { session: 3, flush: jest.fn() };
    flushSlot.current = other;
    unregister();
    expect(flushSlot.current).toBe(other);

    flushSlot.current = null;
    const unregisterAgain = session.registerFlush(flush);
    unregisterAgain();
    expect(flushSlot.current).toBeNull();
  });

  it("古いセッションの registerFlush は現在の登録を上書きせず、解除しても外さない", () => {
    const { session, state, flushSlot } = setup({ sessionNumber: 1 });
    state.activeSessionNumber = 2;
    const current: FlushRegistration = { session: 2, flush: jest.fn() };
    flushSlot.current = current;

    const unregister = session.registerFlush(jest.fn());
    expect(flushSlot.current).toBe(current);
    unregister();
    expect(flushSlot.current).toBe(current);
  });

  it("snapshot は現在の session の登録だけを読み、解除は自分の登録だけを外す", () => {
    const { session, state } = setup({ sessionNumber: 1, bodies: { [mapBodyKey("a")]: "saved-body" } });
    const first = { json: "editor-a", hydrated: true, restoreOrigin: "failed" as const, hasSavedBodyThisMount: false };
    const second = { ...first, json: "editor-b", hasSavedBodyThisMount: true };
    let latest = first;

    expect(session.readBackupSnapshot()).toBeNull();
    const unregisterFirst = session.registerBackupSnapshot(() => latest);
    expect(session.readBackupSnapshot()).toEqual(first);
    latest = second;
    expect(session.readBackupSnapshot()).toEqual(second);
    const unregisterSecond = session.registerBackupSnapshot(() => second);
    unregisterFirst();
    expect(session.readBackupSnapshot()).toEqual(second);
    unregisterSecond();
    expect(session.readBackupSnapshot()).toBeNull();

    session.registerBackupSnapshot(() => first);
    state.activeSessionNumber = 2;
    expect(session.readBackupSnapshot()).toBeNull();
    session.registerBackupSnapshot(() => first);
    expect(session.readBackupSnapshot()).toBeNull();
  });

  it("未保存編集がない（flush が unchanged を返す）場合、ストレージが外部更新されていても unchanged を返す", () => {
    const { session, flushSlot, storage } = setup({
      sessionNumber: 5,
      bodies: { [mapBodyKey("a")]: "initial-body" },
    });

    // 未編集なので writeBody を呼ばず unchanged を返す flush コールバック
    const cleanFlush = jest.fn(() => ({ status: "unchanged" as const }));
    session.registerFlush(cleanFlush);

    // 外部からストレージが書き換えられる
    storage.setItem(mapBodyKey("a"), "external-body");

    const result = flushRegisteredSession(flushSlot.current, 5);

    expect(result).toEqual({ status: "unchanged" });
    expect(cleanFlush).toHaveBeenCalledTimes(1);
  });

  it("未保存編集がある場合、ストレージが外部更新されていれば flush は conflict を返し上書きしない", () => {
    const { session, flushSlot, storage, entries } = setup({
      sessionNumber: 5,
      bodies: { [mapBodyKey("a")]: "initial-body" },
    });

    // 未保存編集があるので writeBody を呼ぶ flush コールバック
    const dirtyFlush = jest.fn(() => {
      const writeResult = session.writeBody("flushed-content");
      if (writeResult.status === "saved") return { status: "saved" as const };
      if (writeResult.status === "conflict") return { status: "conflict" as const };
      return { status: "failed" as const, error: "failed" };
    });
    session.registerFlush(dirtyFlush);

    // 外部からストレージが書き換えられる
    storage.setItem(mapBodyKey("a"), "external-body");

    const result = flushRegisteredSession(flushSlot.current, 5);

    expect(result).toEqual({ status: "conflict" });
    expect(dirtyFlush).toHaveBeenCalledTimes(1);
    expect(entries()[mapBodyKey("a")]).toBe("external-body");
  });

  it("flush 内の保存処理で readMapBody 読み取り失敗した場合は failed を返し、本体書き込みを行わない", () => {
    const { session, flushSlot, storage, entries, commitIndex } = setup({
      sessionNumber: 5,
      bodies: { [mapBodyKey("a")]: "initial-body" },
    });

    const innerFlush = jest.fn(() => {
      const written = session.writeBody("flushed-content");
      if (written.status === "failed") return { status: "failed" as const, error: written.error };
      if (written.status === "conflict") return { status: "conflict" as const };
      return { status: "saved" as const };
    });
    session.registerFlush(innerFlush);

    const getItemSpy = jest.spyOn(storage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    try {
      const result = flushRegisteredSession(flushSlot.current, 5);
      expect(result.status).toBe("failed");
      expect(innerFlush).toHaveBeenCalledTimes(1);
      expect(entries()[mapBodyKey("a")]).toBe("initial-body");
      expect(commitIndex).not.toHaveBeenCalled();
    } finally {
      getItemSpy.mockRestore();
    }
  });
});

describe("flushRegisteredSession", () => {
  it("登録が無ければ unchanged を返す", () => {
    expect(flushRegisteredSession(null, 0)).toEqual({ status: "unchanged" });
  });

  it("別のセッション番号の登録は呼ばずに unchanged を返す", () => {
    const flush = jest.fn(() => ({ status: "saved" as const }));

    expect(flushRegisteredSession({ session: 1, flush }, 2)).toEqual({ status: "unchanged" });
    expect(flush).not.toHaveBeenCalled();
  });

  it("現在のセッション番号の登録を呼び、その結果をそのまま返す", () => {
    const flush = jest.fn(() => ({ status: "failed" as const, error: "full" }));

    expect(flushRegisteredSession({ session: 2, flush }, 2)).toEqual({ status: "failed", error: "full" });
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
