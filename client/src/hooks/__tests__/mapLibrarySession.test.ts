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
  return { session: createPersistentMapSession(context), state, entries, commitIndex, flushSlot };
}

describe("createPersistentMapSession", () => {
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

  it("registerFlush は現在のセッションの登録を置き、解除では自分の登録だけを外す", () => {
    const { session, flushSlot } = setup({ sessionNumber: 3 });
    const flush = jest.fn(() => ({ status: "saved" as const }));

    const unregister = session.registerFlush(flush);
    expect(flushSlot.current).toEqual({ session: 3, flush });

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
