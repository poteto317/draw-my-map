import { act, renderHook } from "@testing-library/react";
import { useMapLibraryDialogState } from "@/hooks/useMapLibraryDialogState";
import type { UseMapLibraryResult } from "@/hooks/useMapLibrary";
import type { LibraryBackupPreview } from "@/services/persistence/libraryBackupExport";
import type { LibraryRestorePreview } from "@/hooks/mapLibraryState";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import type { MapDocumentResult } from "@/types/mapDocument";

const maps = [{ id: "a", name: "A", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }];
type Operations = Parameters<typeof useMapLibraryDialogState>[0]["library"];
const backup = { missingBodyNames: ["B"], orphanBodyCount: 1 } as unknown as Extract<ReturnType<UseMapLibraryResult["prepareBackup"]>, { ok: true }>["value"];
const restore = { backup: { maps: [{ name: "C" }] } } as unknown as LibraryRestorePreview;

function setup() {
  const library: jest.Mocked<Operations> = {
    createMap: jest.fn(), switchMap: jest.fn(), renameMap: jest.fn(), deleteMap: jest.fn(), moveBranchToMap: jest.fn(),
    prepareBackup: jest.fn(() => ({ ok: true, value: backup })),
    downloadBackup: jest.fn<MapLibraryOperationResult, [LibraryBackupPreview]>(() => ({ ok: true, remounted: false, notice: { kind: "status", message: "ダウンロードを開始しました。" }, saveRetryNotice: null })),
    previewRestore: jest.fn<Promise<MapDocumentResult<LibraryRestorePreview>>, [File]>(async () => ({ ok: true, value: restore })),
    confirmRestore: jest.fn<MapLibraryOperationResult, [LibraryRestorePreview]>(() => ({ ok: true, remounted: false, notice: { kind: "status", message: "追加しました。" }, saveRetryNotice: null })),
  };
  const hook = renderHook(() => useMapLibraryDialogState({ library, maps, startupNotice: null }));
  act(() => hook.result.current.openList());
  return { ...hook, library };
}

it("バックアップ確認では空本体の名前を保持し、確定後は一覧に通知する", () => {
  const { result, library } = setup();
  act(() => result.current.prepareBackup());
  expect(result.current.screen).toEqual({ kind: "backupConfirm", preview: backup });
  act(() => result.current.downloadBackup());
  expect(library.downloadBackup).toHaveBeenCalledWith(backup);
  expect(result.current.screen).toEqual({ kind: "list" });
  expect(result.current.notices.status).toBe("ダウンロードを開始しました。");
});

it("ダウンロード失敗は一覧の alert に出し、同じ失敗でも再告知する", () => {
  const { result, library } = setup();
  library.downloadBackup.mockReturnValue({ ok: false, notice: { kind: "error", message: "ダウンロード失敗" } });
  act(() => result.current.prepareBackup());
  act(() => result.current.downloadBackup());
  expect(result.current.notices.alert).toBe("ダウンロード失敗");
  const first = result.current.notices.sequence;
  act(() => result.current.prepareBackup());
  act(() => result.current.downloadBackup());
  expect(result.current.notices.alert).toBe("ダウンロード失敗");
  expect(result.current.notices.sequence).toBeGreaterThan(first);
});

it("同じ読込中の連続選択を拒否し、閉じて再開した後の古い結果を捨てる", async () => {
  const { result, library } = setup();
  let complete!: (value: Awaited<ReturnType<UseMapLibraryResult["previewRestore"]>>) => void;
  library.previewRestore.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const file = new File(["{}"], "backup.json", { type: "application/json" });
  act(() => { void result.current.selectRestoreFile(file); void result.current.selectRestoreFile(file); });
  expect(library.previewRestore).toHaveBeenCalledTimes(1);
  expect(result.current.screen).toEqual({ kind: "restoreReading" });
  act(() => result.current.close());
  act(() => result.current.openList());
  await act(async () => complete({ ok: true, value: restore }));
  expect(result.current.screen).toEqual({ kind: "list" });
});

it("復元の同じ失敗を二度告知し、成功時は一覧に戻す", async () => {
  const { result, library } = setup();
  const file = new File(["{}"], "backup.json");
  library.previewRestore.mockResolvedValue({ ok: false, error: "読込失敗" });
  await act(async () => { await result.current.selectRestoreFile(file); });
  const first = result.current.notices.sequence;
  await act(async () => { await result.current.selectRestoreFile(file); });
  expect(result.current.notices.alert).toBe("読込失敗");
  expect(result.current.notices.sequence).toBeGreaterThan(first);
  library.previewRestore.mockResolvedValue({ ok: true, value: restore });
  await act(async () => { await result.current.selectRestoreFile(file); });
  expect(result.current.screen).toEqual({ kind: "restoreConfirm", preview: restore });
  act(() => result.current.confirmRestore());
  expect(result.current.screen).toEqual({ kind: "list" });
  expect(result.current.notices.status).toBe("追加しました。");
});
