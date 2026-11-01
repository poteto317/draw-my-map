import { createMapIndexEntry, encodeMapIndex } from "@/domain/mapLibrary/mapIndex";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import { MAP_INDEX_STORAGE_KEY as INDEX, mapBodyKey } from "../mapLibraryStorage";
import { BRANCH_MOVE_JOURNAL_KEY as JOURNAL } from "../branchMoveJournal";
import { recoverBranchMove, writeBranchMove, type BranchMoveWriteInput } from "../branchMoveTransaction";
const RECOVERY_ERROR = "枝の移動前の保存データを復元できませんでした。この画面での変更は保存されません。ページを閉じる前にJSONで書き出してください。";
const BROKEN_JOURNAL_ERROR = "枝の移動の記録が壊れているため、保存データを守って開きました。この画面での変更は保存されません。移動前のデータはブラウザの localStorage のキー「draw-my-map.branch-move.v1」に残っています。";
const QUOTA_ERROR = "保存領域の空きが足りないため、枝を移動できませんでした。移動の間は両方のマップの写しと移す枝の分の空きが一時的に必要です。不要なマップやイラストを減らしてやり直してください。";
const SOURCE = mapBodyKey("source"), TARGET = mapBodyKey("target");
const index = { version: 1 as const, currentMapId: "source", maps: ["source", "target"].map(id => createMapIndexEntry(id, id, "2026-10-31T00:00:00.000Z")), legacyCleanupPending: false };
const input: BranchMoveWriteInput = { sourceId: "source", targetId: "target", sourceBefore: "source original", targetBefore: null, indexBefore: encodeMapIndex(index), sourceAfter: "source after", targetAfter: "target after", indexAfter: encodeMapIndex({ ...index, currentMapId: "target" }) };
const original = { [SOURCE]: input.sourceBefore!, [INDEX]: input.indexBefore };
const journal = JSON.stringify({ version: 1, sourceId: input.sourceId, targetId: input.targetId, sourceBefore: input.sourceBefore, targetBefore: input.targetBefore, indexBefore: input.indexBefore });
it("journal→target→source→index→削除で確定する", () => {
  const { storage, operations, entries } = createRecordingStorage({ initial: original });
  expect(writeBranchMove(storage, input)).toEqual({ ok: true });
  expect(operations.map(op => op.key)).toEqual([JOURNAL, TARGET, SOURCE, INDEX, JOURNAL]);
  expect(entries()).toEqual({ [SOURCE]: input.sourceAfter, [TARGET]: input.targetAfter, [INDEX]: input.indexAfter });
});
it.each([SOURCE, TARGET, INDEX, JOURNAL])("原本不一致・既存journal %s では書かない", key => {
  const { storage, operations } = createRecordingStorage({ initial: { ...original, [key]: "changed" } });
  expect(writeBranchMove(storage, input).ok).toBe(false);
  expect(operations).toEqual([]);
});
it("書き込み前の読み取りの例外は何も書かず、やり直せる失敗として返す", () => {
  const { storage, operations } = createRecordingStorage({ initial: original, failGetItem: true });
  expect(writeBranchMove(storage, input)).toEqual({
    ok: false,
    error: "枝を移動できませんでした。保存データを確認してやり直してください。",
    recoveryRequired: false,
  });
  expect(operations).toEqual([]);
});
it.each([1, 2, 3, 4, 5])("第%i段階失敗では原本へ戻す", failure => {
  let step = 0;
  const fail = () => ++step === failure;
  const { storage, entries } = createRecordingStorage({ initial: original, failSetItem: fail, failRemoveItem: fail });
  expect(writeBranchMove(storage, input)).toMatchObject({ ok: false, recoveryRequired: false });
  expect(entries()).toEqual(original);
});
it("既存targetの原文を戻す", () => {
  const before = { ...original, [TARGET]: "  original target  " };
  const { storage, entries } = createRecordingStorage({ initial: before, failSetItem: (_k, v) => v === input.sourceAfter });
  expect(writeBranchMove(storage, { ...input, targetBefore: before[TARGET] }).ok).toBe(false);
  expect(entries()).toEqual(before);
});
it("rollback失敗でも残りを復元しjournal保持", () => {
  const { storage, entries } = createRecordingStorage({ initial: original, failSetItem: (_k, v) => v === input.indexAfter, failRemoveItem: k => k === TARGET });
  expect(writeBranchMove(storage, input)).toMatchObject({ ok: false, recoveryRequired: true });
  expect(entries()[JOURNAL]).toBe(journal);
  expect(entries()[SOURCE]).toBe(input.sourceBefore);
});
it("途中journalを復元し二度目は無書き込み", () => {
  const { storage, entries, operations } = createRecordingStorage({ initial: { ...original, [JOURNAL]: journal, [SOURCE]: input.sourceAfter, [TARGET]: input.targetAfter, [INDEX]: input.indexAfter } });
  expect(recoverBranchMove(storage)).toEqual({ kind: "recovered" });
  expect(entries()).toEqual(original);
  operations.length = 0;
  expect(recoverBranchMove(storage)).toEqual({ kind: "none" });
  expect(operations).toEqual([]);
});
it.each([TARGET, SOURCE, INDEX, JOURNAL])("復旧%s失敗でも全原本を試行し、journalを残してblockedを返す", key => {
  const { storage, operations, entries } = createRecordingStorage({ initial: { ...original, [JOURNAL]: journal }, failSetItem: k => k === key, failRemoveItem: k => k === key });
  expect(recoverBranchMove(storage)).toEqual({
    kind: "blocked",
    initialJson: input.sourceBefore,
    mapId: "source",
    mapName: "source",
    error: RECOVERY_ERROR,
  });
  expect(entries()[JOURNAL]).toBe(journal);
  expect(operations.slice(0, 3).map(op => op.key)).toEqual([TARGET, SOURCE, INDEX]);
});
it("破損journalは書き込まず、原本の無いblockedを専用の文言で返す", () => {
  const { storage, operations } = createRecordingStorage({ initial: { [JOURNAL]: "{" } });
  const result = recoverBranchMove(storage);
  expect(result).toEqual({
    kind: "blocked",
    initialJson: null,
    mapId: "branch-move-recovery",
    mapName: "無題のマップ",
    error: BROKEN_JOURNAL_ERROR,
  });
  expect(operations).toEqual([]);
});
it("nullの移動元も削除で復元する", () => {
  const nullInput = { ...input, sourceBefore: null };
  const { storage, entries } = createRecordingStorage({ initial: { [INDEX]: input.indexBefore }, failSetItem: (_k, v) => v === input.indexAfter });
  expect(writeBranchMove(storage, nullInput)).toMatchObject({ ok: false, recoveryRequired: false });
  expect(entries()).toEqual({ [INDEX]: input.indexBefore });
});
it("ジャーナルを読めないときは何も書かず、保存領域を使えないことを返す", () => {
  const { storage, operations } = createRecordingStorage({ initial: original, failGetItem: true });
  expect(recoverBranchMove(storage)).toEqual({ kind: "unavailable" });
  expect(operations).toEqual([]);
});
it("ジャーナルが容量不足で書けないときは、原因が分かる文言で返し本体を書かない", () => {
  const { storage, operations, entries } = createRecordingStorage({ initial: original, capacity: 1 });
  expect(writeBranchMove(storage, input)).toEqual({ ok: false, error: QUOTA_ERROR, recoveryRequired: false });
  expect(operations.map(op => op.key)).toEqual([JOURNAL]);
  expect(entries()).toEqual(original);
});
it("容量不足以外でジャーナルを書けないときは、これまでの文言で返す", () => {
  const { storage } = createRecordingStorage({ initial: original, failSetItem: k => k === JOURNAL, failSetItemError: "SecurityError" });
  expect(writeBranchMove(storage, input)).toEqual({
    ok: false,
    error: "枝を移動できませんでした。保存データを確認してやり直してください。",
    recoveryRequired: false,
  });
});
it("本体の書き込みが容量不足で原本へ戻せたときも、原因が分かる文言で返す", () => {
  const { storage, entries } = createRecordingStorage({ initial: original, failSetItem: (_k, v) => v === input.sourceAfter });
  expect(writeBranchMove(storage, input)).toEqual({ ok: false, error: QUOTA_ERROR, recoveryRequired: false });
  expect(entries()).toEqual(original);
});
it("補正が要るindexの原文も、中断からの復元でそのまま戻す", () => {
  const raw = JSON.stringify({ version: 1, currentMapId: "source", maps: index.maps });
  const before = { ...original, [INDEX]: raw };
  const repairedJournal = JSON.stringify({ ...JSON.parse(journal), indexBefore: raw });
  const { storage, entries } = createRecordingStorage({ initial: { ...before, [JOURNAL]: repairedJournal, [SOURCE]: input.sourceAfter, [TARGET]: input.targetAfter, [INDEX]: input.indexAfter } });
  expect(recoverBranchMove(storage)).toEqual({ kind: "recovered" });
  expect(entries()).toEqual(before);
});
describe.each([null, "target original"])("targetBefore=%s の書き込みの途中のクラッシュ", targetBefore => {
  const crashInput = { ...input, targetBefore };
  const before = targetBefore === null ? original : { ...original, [TARGET]: targetBefore };
  const after = { [SOURCE]: input.sourceAfter, [TARGET]: input.targetAfter, [INDEX]: input.indexAfter };
  // n 回の書き込みだけ届き、以降はロールバックも含めて届かない。再起動は健全な保存領域で行う
  function crashAfter(writes: number) {
    let attempted = 0;
    const crashed = () => attempted++ >= writes;
    const running = createRecordingStorage({ initial: before, failSetItem: crashed, failRemoveItem: crashed });
    writeBranchMove(running.storage, crashInput);
    return createRecordingStorage({ initial: running.entries() });
  }
  it.each([
    ["ジャーナルの前", 0, "none"],
    ["ジャーナルの後", 1, "recovered"],
    ["移動先の本体の後", 2, "recovered"],
    ["移動元の本体の後", 3, "recovered"],
    ["インデックスの後", 4, "recovered"],
  ])("%sなら再起動で原本へ戻り、次の起動は何もしない", (_stage, writes, kind) => {
    const restarted = crashAfter(writes);
    expect(recoverBranchMove(restarted.storage)).toEqual({ kind });
    expect(restarted.entries()).toEqual(before);
    restarted.operations.length = 0;
    expect(recoverBranchMove(restarted.storage)).toEqual({ kind: "none" });
    expect(restarted.operations).toEqual([]);
  });
  it("ジャーナルの削除の後なら移動後のまま", () => {
    const restarted = crashAfter(5);
    expect(recoverBranchMove(restarted.storage)).toEqual({ kind: "none" });
    expect(restarted.entries()).toEqual(after);
  });
});
it("journalが無ければ復旧せずnoneを返す", () => {
  const { storage, operations } = createRecordingStorage({ initial: original });
  expect(recoverBranchMove(storage)).toEqual({ kind: "none" });
  expect(operations).toEqual([]);
});
