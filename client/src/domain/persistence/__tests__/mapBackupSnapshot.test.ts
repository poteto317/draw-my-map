import { isEligibleMapBackupSnapshot } from "../mapBackupSnapshot";
import type { MapBackupSnapshot } from "@/types/mapStorageSession";

const base: MapBackupSnapshot = {
  json: '{"version":3,"layoutMode":"manual","nodes":[]}',
  hydrated: true,
  restoreOrigin: "restored",
  hasSavedBodyThisMount: false,
};

it.each([
  ["未登録", null],
  ["未hydrate", { ...base, hydrated: false }],
  ["復元結果未確定", { ...base, restoreOrigin: null }],
  ["初回復元失敗で実保存なし", { ...base, restoreOrigin: "failed", hasSavedBodyThisMount: false }],
] as const)("%sの snapshot を拒否する", (_name, snapshot) => {
  expect(isEligibleMapBackupSnapshot(snapshot)).toBe(false);
});

it.each([
  ["復元済み", { ...base, restoreOrigin: "restored" }],
  ["空から開始", { ...base, restoreOrigin: "empty" }],
  ["初回復元失敗後に実保存済み", { ...base, restoreOrigin: "failed", hasSavedBodyThisMount: true }],
] as const)("%sの snapshot を許可する", (_name, snapshot) => {
  expect(isEligibleMapBackupSnapshot(snapshot)).toBe(true);
});
