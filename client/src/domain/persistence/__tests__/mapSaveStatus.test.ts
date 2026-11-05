import { deriveMapSaveStatus } from "@/domain/persistence/mapSaveStatus";

type StatusInput = Parameters<typeof deriveMapSaveStatus>[0];

const base: StatusInput = {
  hydrated: true,
  restoreOrigin: "restored",
  currentSnapshot: "saved-v3",
  initialPersistedSnapshot: "saved-v3",
  confirmedSnapshot: "saved-v3",
  forcedSnapshot: null,
  hasSaveFailure: false,
  storageMode: "persistent",
};

const cases: Array<[string, Partial<StatusInput>, ReturnType<typeof deriveMapSaveStatus>]> = [
  ["復元前は確認中", { hydrated: false, restoreOrigin: null, confirmedSnapshot: null }, "checking"],
  ["復元由来が未確定なら確認中", { restoreOrigin: null }, "checking"],
  ["保護モードを復元前より優先", { storageMode: "protected", hydrated: false, restoreOrigin: null }, "protected"],
  ["保護モードを確認済み・失敗より優先", { storageMode: "protected", hasSaveFailure: true }, "protected"],
  ["復元済み本体と同一なら保存済み", {}, "saved"],
  ["復元済み本体から編集したら待機", { currentSnapshot: "edited" }, "pending"],
  ["V1旧文字列と新形式は異なるため移行待ち", {
    initialPersistedSnapshot: "legacy-v1", confirmedSnapshot: "legacy-v1", currentSnapshot: "normalized-v3",
  }, "pending"],
  ["本体なしの仮基準と同一なら保存前", {
    restoreOrigin: "empty", confirmedSnapshot: null,
  }, "beforeSave"],
  ["復元失敗の仮基準と同一なら復元失敗", {
    restoreOrigin: "failed", confirmedSnapshot: null,
  }, "restoreFailed"],
  ["本体なしで編集後は待機", {
    restoreOrigin: "empty", confirmedSnapshot: null, currentSnapshot: "edited",
  }, "pending"],
  ["復元失敗後の編集は待機", {
    restoreOrigin: "failed", confirmedSnapshot: null, currentSnapshot: "edited",
  }, "pending"],
  ["強制要求が同一snapshotなら待機", { forcedSnapshot: "saved-v3" }, "pending"],
  ["仮基準と同一でも強制要求中は待機", {
    restoreOrigin: "empty", confirmedSnapshot: null, forcedSnapshot: "saved-v3",
  }, "pending"],
  ["書込失敗は編集中も維持", { currentSnapshot: "edited", hasSaveFailure: true }, "failed"],
  ["失敗後に確認済み基準へ戻れば保存済み", { hasSaveFailure: true }, "saved"],
  ["失敗後に本体なしの仮基準へ戻っても失敗", {
    restoreOrigin: "empty", confirmedSnapshot: null, hasSaveFailure: true,
  }, "failed"],
  ["失敗後に復元失敗の仮基準へ戻っても失敗", {
    restoreOrigin: "failed", confirmedSnapshot: null, hasSaveFailure: true,
  }, "failed"],
  ["失敗後に確認済み基準へ戻っても強制要求中は失敗", {
    hasSaveFailure: true, forcedSnapshot: "saved-v3",
  }, "failed"],
  ["仮基準とは異なる保存成功基準に一致すれば保存済み", {
    restoreOrigin: "empty", initialPersistedSnapshot: "initial", confirmedSnapshot: "saved-v3",
  }, "saved"],
];

describe("deriveMapSaveStatus", () => {
  it.each(cases)("%s", (_name, overrides, expected) => {
    expect(deriveMapSaveStatus({ ...base, ...overrides })).toBe(expected);
  });

});
