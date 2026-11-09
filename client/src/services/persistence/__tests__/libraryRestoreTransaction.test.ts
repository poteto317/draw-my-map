import { encodeMapIndex, type MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import type { LibraryBackupV1 } from "@/domain/mapLibrary/libraryBackupCodec";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import { BRANCH_MOVE_JOURNAL_KEY } from "../branchMoveJournal";
import { encodeLibraryRestoreJournal, LIBRARY_RESTORE_JOURNAL_KEY as JOURNAL } from "../libraryRestoreJournal";
import { MAP_INDEX_STORAGE_KEY as INDEX, mapBodyKey } from "../mapLibraryStorage";
import { planLibraryRestore, recoverLibraryRestore, writeLibraryRestore } from "../libraryRestoreTransaction";

const date = "2026-11-05T00:00:00.000Z";
const document = { version: 3 as const, layoutMode: "manual" as const, nodes: [] };
const index: MapIndexV1 = { version: 1, currentMapId: "existing", maps: [
  { id: "existing", name: "既存", createdAt: date, updatedAt: date },
], legacyCleanupPending: false };
const beforeRaw = ` ${encodeMapIndex(index)}\n`;
const backup: LibraryBackupV1 = { format: "draw-my-map-library-backup", version: 1,
  exportedAt: date, currentMapId: "source-a", maps: [
    { id: "source-a", name: "一", createdAt: date, updatedAt: date, document },
    { id: "source-b", name: "二", createdAt: date, updatedAt: date, document },
  ] };
const initial = { [INDEX]: beforeRaw, [mapBodyKey("existing")]: "existing body" };

function ids(...values: string[]) {
  let next = 0;
  return () => values[next++] ?? "never";
}

function makePlan(storage = createRecordingStorage({ initial }).storage, generateId = ids("new-a", "new-b")) {
  const result = planLibraryRestore(storage, index, beforeRaw, backup, generateId);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

it("同じファイルを再実行しても新しいIDを割り当て、既存本体と現在IDを保つ", () => {
  const f = createRecordingStorage({ initial });
  const first = makePlan(f.storage);
  expect(first.journal.bodies.map(body => body.id)).toEqual(["new-a", "new-b"]);
  expect(writeLibraryRestore(f.storage, first)).toEqual({ status: "saved" });
  const second = planLibraryRestore(f.storage, first.indexAfter, f.entries()[INDEX], backup, ids("new-a", "new-b", "again-a", "again-b"));
  expect(second.ok).toBe(true);
  if (!second.ok) throw new Error(second.error);
  expect(second.value.journal.bodies.map(body => body.id)).toEqual(["again-a", "again-b"]);
  expect(writeLibraryRestore(f.storage, second.value)).toEqual({ status: "saved" });
  expect(f.entries()[mapBodyKey("existing")]).toBe("existing body");
  expect(JSON.parse(f.entries()[INDEX]).currentMapId).toBe("existing");
  expect(f.entries()[JOURNAL]).toBeUndefined();
});

it("既存・孤立・同一バッチ内・無効IDを飛ばして予約し、10回で発行不能なら書かない", () => {
  const f = createRecordingStorage({ initial: { ...initial, [mapBodyKey("orphan")]: "untouched" } });
  const result = planLibraryRestore(f.storage, index, beforeRaw, backup,
    ids("bad.id", "existing", "orphan", "fresh", "fresh", "other"));
  expect(result.ok && result.value.journal.bodies.map(body => body.id)).toEqual(["fresh", "other"]);
  expect(f.operations).toEqual([]);
  const unavailable = planLibraryRestore(f.storage, index, beforeRaw, backup, () => "orphan");
  expect(unavailable.ok).toBe(false);
  expect(f.operations).toEqual([]);
  expect(f.entries()[mapBodyKey("orphan")]).toBe("untouched");
});

it("読取例外・一覧の生値変更・両ジャーナルの存在は書込前に拒否する", () => {
  const badRead = createRecordingStorage({ initial, failGetItem: true });
  expect(planLibraryRestore(badRead.storage, index, beforeRaw, backup, ids("a", "b")).ok).toBe(false);
  expect(badRead.operations).toEqual([]);
  for (const changed of [
    { ...initial, [INDEX]: encodeMapIndex(index) },
    { ...initial, [JOURNAL]: "occupied" },
    { ...initial, [BRANCH_MOVE_JOURNAL_KEY]: "occupied" },
  ]) {
    const f = createRecordingStorage({ initial: changed });
    expect(planLibraryRestore(f.storage, index, beforeRaw, backup, ids("a", "b")).ok).toBe(false);
    expect(f.operations).toEqual([]);
  }
});

it("write直前に全前提を再検査し、既存本体キーを上書きしない", () => {
  const f = createRecordingStorage({ initial });
  const plan = makePlan(f.storage);
  f.storage.setItem(mapBodyKey("new-b"), "other owner's body");
  f.operations.length = 0;
  expect(writeLibraryRestore(f.storage, plan).status).toBe("failed");
  expect(f.operations).toEqual([]);
  expect(f.entries()[mapBodyKey("new-b")]).toBe("other owner's body");
});

it("journal→新規本体→一覧1回→journal削除の順に確定する", () => {
  const f = createRecordingStorage({ initial });
  const plan = makePlan(f.storage);
  expect(writeLibraryRestore(f.storage, plan)).toEqual({ status: "saved" });
  expect(f.operations.map(operation => `${operation.type}:${operation.key}`)).toEqual([
    `setItem:${JOURNAL}`, `setItem:${mapBodyKey("new-a")}`, `setItem:${mapBodyKey("new-b")}`,
    `setItem:${INDEX}`, `removeItem:${JOURNAL}`,
  ]);
  expect(f.entries()).toEqual({ ...initial, [INDEX]: plan.journal.indexAfter,
    [mapBodyKey("new-a")]: plan.journal.bodies[0].json,
    [mapBodyKey("new-b")]: plan.journal.bodies[1].json });
});

it.each([JOURNAL, mapBodyKey("new-a"), mapBodyKey("new-b"), INDEX])(
  "%s のsetItem失敗は書けた分だけ戻し、元の一覧生値を保つ", failedKey => {
    const f = createRecordingStorage({ initial, failSetItem: key => key === failedKey });
    const result = writeLibraryRestore(f.storage, makePlan(f.storage));
    expect(result.status).toBe("failed");
    expect(f.entries()).toEqual(initial);
    expect(f.operations.filter(op => op.type === "setItem" && op.key === INDEX)).toHaveLength(failedKey === INDEX ? 1 : 0);
  },
);

it("journal削除失敗は一覧原文を戻し、本体を逆順に削除してjournalを最後に消す", () => {
  let removals = 0;
  const f = createRecordingStorage({ initial, failRemoveItem: key => key === JOURNAL && ++removals === 1 });
  const result = writeLibraryRestore(f.storage, makePlan(f.storage));
  expect(result.status).toBe("failed");
  expect(f.entries()).toEqual(initial);
  expect(f.operations.slice(-4).map(op => `${op.type}:${op.key}`)).toEqual([
    `setItem:${INDEX}`, `removeItem:${mapBodyKey("new-b")}`,
    `removeItem:${mapBodyKey("new-a")}`, `removeItem:${JOURNAL}`,
  ]);
});

it("body rollbackが失敗しても残りの操作を試し、journalを保持してrecoveryRequiredを返す", () => {
  const f = createRecordingStorage({ initial, failSetItem: key => key === INDEX,
    failRemoveItem: key => key === mapBodyKey("new-b") });
  const result = writeLibraryRestore(f.storage, makePlan(f.storage));
  expect(result.status).toBe("recoveryRequired");
  expect(f.entries()[JOURNAL]).toBeDefined();
  expect(f.entries()[mapBodyKey("new-a")]).toBeUndefined();
  expect(f.operations.some(op => op.type === "removeItem" && op.key === mapBodyKey("new-a"))).toBe(true);
});

it("一覧rollbackが失敗しても本体削除を試し、journalを保持する", () => {
  let indexWrites = 0;
  const f = createRecordingStorage({ initial,
    failSetItem: key => key === INDEX && ++indexWrites === 2,
    failRemoveItem: key => key === JOURNAL });
  const result = writeLibraryRestore(f.storage, makePlan(f.storage));
  expect(result.status).toBe("recoveryRequired");
  expect(f.entries()[JOURNAL]).toBeDefined();
  expect(f.entries()[INDEX]).not.toBe(beforeRaw);
  expect(f.entries()[mapBodyKey("new-a")]).toBeUndefined();
  expect(f.entries()[mapBodyKey("new-b")]).toBeUndefined();
});

describe("recoverLibraryRestore", () => {
  function interrupted(stage: "before" | "partial" | "after" = "partial") {
    const plan = makePlan();
    const bodies = plan.journal.bodies;
    const data = { ...initial, [JOURNAL]: encodeLibraryRestoreJournal(plan.journal) };
    if (stage !== "before") Object.assign(data, { [mapBodyKey("new-a")]: bodies[0].json });
    if (stage === "after") Object.assign(data, { [mapBodyKey("new-b")]: bodies[1].json, [INDEX]: plan.journal.indexAfter });
    return data;
  }

  it.each(["before", "partial", "after"] as const)("%s で中断した記録を原一覧に戻し、再実行可能", stage => {
    const f = createRecordingStorage({ initial: interrupted(stage) });
    expect(recoverLibraryRestore(f.storage)).toEqual({ kind: "recovered" });
    expect(f.entries()).toEqual(initial);
    f.operations.length = 0;
    expect(recoverLibraryRestore(f.storage)).toEqual({ kind: "none" });
    expect(f.operations).toEqual([]);
  });

  it("rollback の本体削除失敗から再起動すると、残った journal と本体を復旧できる", () => {
    const failed = createRecordingStorage({ initial, failSetItem: key => key === INDEX,
      failRemoveItem: key => key === mapBodyKey("new-b") });
    expect(writeLibraryRestore(failed.storage, makePlan(failed.storage)).status).toBe("recoveryRequired");
    const restarted = createRecordingStorage({ initial: failed.entries() });
    expect(recoverLibraryRestore(restarted.storage)).toEqual({ kind: "recovered" });
    expect(restarted.entries()).toEqual(initial);
  });

  it("確定時の journal 削除と rollback の本体削除が失敗しても再起動で復旧する", () => {
    let journalRemovals = 0;
    const failed = createRecordingStorage({ initial,
      failRemoveItem: key => key === mapBodyKey("new-b") ||
        (key === JOURNAL && ++journalRemovals === 1) });
    expect(writeLibraryRestore(failed.storage, makePlan(failed.storage)).status).toBe("recoveryRequired");
    const restarted = createRecordingStorage({ initial: failed.entries() });
    expect(recoverLibraryRestore(restarted.storage)).toEqual({ kind: "recovered" });
    expect(restarted.entries()).toEqual(initial);
  });

  it("意味が同じでも記録原文と byte が違う新規本体は消さない", () => {
    const state = { ...interrupted(), [mapBodyKey("new-b")]: ` ${JSON.stringify(document)} ` };
    const f = createRecordingStorage({ initial: state });
    expect(recoverLibraryRestore(f.storage).kind).toBe("blocked");
    expect(f.operations).toEqual([]);
    expect(f.entries()).toEqual(state);
  });

  it.each([
    ["broken journal", { [JOURNAL]: "{" }],
    ["foreign index", { [INDEX]: "foreign" }],
    ["foreign body", { [mapBodyKey("new-b")]: "foreign" }],
    ["both journals", { [BRANCH_MOVE_JOURNAL_KEY]: "occupied" }],
  ])("%s は全書込前に止まり、他者値と journal を保つ", (_name, delta) => {
    const initialState = { ...interrupted(), ...delta };
    const f = createRecordingStorage({ initial: initialState });
    const result = recoverLibraryRestore(f.storage);
    expect(result.kind).toBe("blocked");
    expect(f.operations).toEqual([]);
    expect(f.entries()).toEqual(initialState);
    if (result.kind === "blocked") {
      expect(result.initialJson).toBeNull(); // 既存本体は検証できない文字列
      expect(result.error).toContain(JOURNAL);
      expect(result.error).toContain("JSON");
    }
  });

  it("現在の本体が有効な V3 なら保護起動へ原文を渡す", () => {
    const currentJson = ` ${JSON.stringify(document)}\n`;
    const f = createRecordingStorage({ initial: { ...interrupted(), [mapBodyKey("existing")]: currentJson,
      [mapBodyKey("new-b")]: "foreign" } });
    expect(recoverLibraryRestore(f.storage)).toMatchObject({ kind: "blocked", initialJson: currentJson,
      mapId: "existing", mapName: "既存" });
    expect(f.operations).toEqual([]);
  });

  it.each([
    [1, { version: 1, layoutMode: "auto", nodes: [
      { id: 3, parentId: null, x: 10, y: 20, width: 160, height: 64, label: "旧形式" },
    ] }],
    [2, { version: 2, layoutMode: "manual", nodes: [
      { id: 4, parentId: null, x: 15, y: 25, width: 160, height: 64, label: "旧形式", importance: "medium" },
    ] }],
  ])("壊れた journal で有効な既存 V%i 本体の原文を保護起動へ渡す", (_version, legacy) => {
    const currentJson = ` ${JSON.stringify(legacy)}\n`;
    const f = createRecordingStorage({ initial: { ...interrupted(), [JOURNAL]: "{",
      [mapBodyKey("existing")]: currentJson } });
    expect(recoverLibraryRestore(f.storage)).toMatchObject({ kind: "blocked", initialJson: currentJson,
      mapId: "existing", mapName: "既存" });
    expect(f.operations).toEqual([]);
  });

  it("他者が現在マップを変更した有効な一覧では現現在本体を救出する", () => {
    const otherJson = ` ${JSON.stringify(document)}\n`;
    const foreignIndex = encodeMapIndex({ ...index, currentMapId: "other",
      maps: [...index.maps, { id: "other", name: "他者の現在", createdAt: date, updatedAt: date }] });
    const state = { ...interrupted(), [INDEX]: foreignIndex,
      [mapBodyKey("existing")]: JSON.stringify(document), [mapBodyKey("other")]: otherJson };
    const f = createRecordingStorage({ initial: state });
    expect(recoverLibraryRestore(f.storage)).toMatchObject({ kind: "blocked", initialJson: otherJson,
      mapId: "other", mapName: "他者の現在" });
    expect(f.operations).toEqual([]);
    expect(f.entries()).toEqual(state);
  });

  it("現一覧の現在本体が不正なら旧現在本体へ代用しない", () => {
    const foreignIndex = encodeMapIndex({ ...index, currentMapId: "other",
      maps: [...index.maps, { id: "other", name: "他者の現在", createdAt: date, updatedAt: date }] });
    const f = createRecordingStorage({ initial: { ...interrupted(), [INDEX]: foreignIndex,
      [mapBodyKey("existing")]: JSON.stringify(document), [mapBodyKey("other")]: "{" } });
    expect(recoverLibraryRestore(f.storage)).toMatchObject({ kind: "blocked", initialJson: null,
      mapId: "other", mapName: "他者の現在" });
    expect(f.operations).toEqual([]);
  });

  it("保存中一覧が不正な場合だけ journal の元一覧から救出する", () => {
    const currentJson = JSON.stringify(document);
    const f = createRecordingStorage({ initial: { ...interrupted(), [INDEX]: "{",
      [mapBodyKey("existing")]: currentJson } });
    expect(recoverLibraryRestore(f.storage)).toMatchObject({ kind: "blocked", initialJson: currentJson,
      mapId: "existing", mapName: "既存" });
    expect(f.operations).toEqual([]);
  });

  it("読取不能なら書かず unavailable を返す", () => {
    const f = createRecordingStorage({ initial: interrupted(), failGetItem: true });
    expect(recoverLibraryRestore(f.storage)).toEqual({ kind: "unavailable" });
    expect(f.operations).toEqual([]);
  });

  it.each([INDEX, mapBodyKey("new-a"), JOURNAL])("%s の復旧失敗で journal を残し再試行できる", key => {
    const state = interrupted("after");
    const f = createRecordingStorage({ initial: state,
      failSetItem: target => target === key, failRemoveItem: target => target === key });
    expect(recoverLibraryRestore(f.storage).kind).toBe("blocked");
    expect(f.entries()[JOURNAL]).toBe(state[JOURNAL]);
    const retry = createRecordingStorage({ initial: f.entries() });
    expect(recoverLibraryRestore(retry.storage)).toEqual({ kind: "recovered" });
    expect(retry.entries()).toEqual(initial);
  });
});
