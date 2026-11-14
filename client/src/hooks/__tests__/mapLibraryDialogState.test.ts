import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";
import {
  backFrom,
  backToList,
  closeAfterEnteringProtectedMode,
  closeAfterSuccess,
  INITIAL_STATE,
  nextNotices,
  nextScreenAfterActiveDeletion,
  nextScreenOnBack,
  openScreen,
  returnAfterActiveDeletion,
  returnToList,
  returnToTrashAfterAction,
  selectFocusAfterRemoval,
  selectFocusAfterTrashRemoval,
  showFailure,
  type DialogState,
} from "@/hooks/mapLibraryDialogState";
import type { MapLibraryDialogScreen } from "@/types/mapLibraryDialog";
import type { LibraryBackupPreview } from "@/services/persistence/libraryBackupExport";
import type { LibraryRestorePreview } from "@/hooks/mapLibraryState";

function mapEntry(id: string, name: string): MapIndexEntry {
  return {
    id,
    name,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
  };
}

function trashEntry(id: string, name: string): MapTrashEntry {
  return {
    id,
    originalMapId: `orig-${id}`,
    name,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    deletedAt: "2026-11-10T00:00:00.000Z",
    expiresAt: "2026-12-10T00:00:00.000Z",
    hasBody: true,
  };
}

const dummyBackupPreview = {} as LibraryBackupPreview;
const dummyRestorePreview = {} as LibraryRestorePreview;

describe("mapLibraryDialogState", () => {
  describe("selectFocusAfterRemoval", () => {
    const maps = [mapEntry("a", "A"), mapEntry("b", "B"), mapEntry("c", "C")];

    it("次行・前行・listCreateButton の順にフォーカス先を選ぶ", () => {
      expect(selectFocusAfterRemoval(maps, "a")).toEqual({
        kind: "row",
        mapId: "b",
        action: "open",
      });
      expect(selectFocusAfterRemoval(maps, "c")).toEqual({
        kind: "row",
        mapId: "b",
        action: "open",
      });
      expect(selectFocusAfterRemoval([mapEntry("a", "A")], "a")).toEqual({
        kind: "listCreateButton",
      });
      expect(selectFocusAfterRemoval(maps, "missing")).toEqual({
        kind: "listCreateButton",
      });
    });
  });

  describe("selectFocusAfterTrashRemoval", () => {
    const entries = [trashEntry("t1", "T1"), trashEntry("t2", "T2"), trashEntry("t3", "T3")];

    it("次行・前行・backToListButton の順にフォーカス先を選ぶ", () => {
      expect(selectFocusAfterTrashRemoval(entries, "t1")).toEqual({
        kind: "trashRow",
        trashId: "t2",
        action: "restore",
      });
      expect(selectFocusAfterTrashRemoval(entries, "t3")).toEqual({
        kind: "trashRow",
        trashId: "t2",
        action: "restore",
      });
      expect(selectFocusAfterTrashRemoval([entries[0]], "t1")).toEqual({
        kind: "backToListButton",
      });
      expect(selectFocusAfterTrashRemoval(entries, "missing")).toEqual({
        kind: "backToListButton",
      });
    });
  });

  describe("nextScreenOnBack", () => {
    it.each<[MapLibraryDialogScreen, MapLibraryDialogScreen]>([
      [{ kind: "closed" }, { kind: "closed" }],
      [{ kind: "list" }, { kind: "closed" }],
      [{ kind: "create", origin: "header" }, { kind: "closed" }],
      [{ kind: "create", origin: "list" }, { kind: "list" }],
      [{ kind: "rename", mapId: "a" }, { kind: "list" }],
      [{ kind: "delete", mapId: "a" }, { kind: "list" }],
      [{ kind: "trash" }, { kind: "list" }],
      [{ kind: "backupConfirm", preview: dummyBackupPreview }, { kind: "list" }],
      [{ kind: "restoreReading" }, { kind: "list" }],
      [{ kind: "restoreConfirm", preview: dummyRestorePreview }, { kind: "list" }],
      [{ kind: "trashPermanentDelete", trashId: "t1" }, { kind: "trash" }],
      [{ kind: "trashEmptyConfirm" }, { kind: "trash" }],
    ])("画面 %o の戻り先は %o", (screen, expected) => {
      expect(nextScreenOnBack(screen)).toEqual(expected);
    });
  });

  describe("backFrom", () => {
    it("closed なら状態を変えない", () => {
      expect(backFrom(INITIAL_STATE)).toBe(INITIAL_STATE);
    });

    it("list / create(header) は閉じてヘッダーフォーカスを要求する", () => {
      const fromList = backFrom(openScreen(INITIAL_STATE, { kind: "list" }));
      expect(fromList.screen).toEqual({ kind: "closed" });
      expect(fromList.headerFocusRequest).toBe("list");
      expect(fromList.focusTarget).toBeNull();

      const fromHeaderCreate = backFrom(
        openScreen(INITIAL_STATE, { kind: "create", origin: "header" }),
      );
      expect(fromHeaderCreate.screen).toEqual({ kind: "closed" });
      expect(fromHeaderCreate.headerFocusRequest).toBe("create");
    });

    it("一覧・ゴミ箱の子画面から戻ると通知を消し、呼び出し元ボタンへフォーカスを戻す", () => {
      const failedRename = showFailure(
        openScreen(INITIAL_STATE, { kind: "rename", mapId: "m1" }),
        { kind: "error", message: "重複しています" },
      );
      const backRename = backFrom(failedRename);
      expect(backRename.screen).toEqual({ kind: "list" });
      expect(backRename.notices).toEqual({
        status: "",
        alert: "",
        sequence: failedRename.notices.sequence + 1,
      });
      expect(backRename.focusTarget).toEqual({ kind: "row", mapId: "m1", action: "rename" });

      expect(
        backFrom(openScreen(INITIAL_STATE, { kind: "create", origin: "list" })).focusTarget,
      ).toEqual({ kind: "listCreateButton" });
      expect(
        backFrom(openScreen(INITIAL_STATE, { kind: "delete", mapId: "m2" })).focusTarget,
      ).toEqual({ kind: "row", mapId: "m2", action: "delete" });
      expect(backFrom(openScreen(INITIAL_STATE, { kind: "trash" })).focusTarget).toEqual({
        kind: "trashButton",
      });
      expect(
        backFrom(openScreen(INITIAL_STATE, { kind: "backupConfirm", preview: dummyBackupPreview }))
          .focusTarget,
      ).toEqual({ kind: "backupButton" });
      expect(
        backFrom(openScreen(INITIAL_STATE, { kind: "restoreReading" })).focusTarget,
      ).toEqual({ kind: "restoreButton" });
      expect(
        backFrom(openScreen(INITIAL_STATE, { kind: "restoreConfirm", preview: dummyRestorePreview }))
          .focusTarget,
      ).toEqual({ kind: "restoreButton" });

      const fromTrashDelete = backFrom(
        openScreen(INITIAL_STATE, { kind: "trashPermanentDelete", trashId: "t1" }),
      );
      expect(fromTrashDelete.screen).toEqual({ kind: "trash" });
      expect(fromTrashDelete.focusTarget).toEqual({
        kind: "trashRow",
        trashId: "t1",
        action: "permanentDelete",
      });

      const fromTrashEmpty = backFrom(openScreen(INITIAL_STATE, { kind: "trashEmptyConfirm" }));
      expect(fromTrashEmpty.screen).toEqual({ kind: "trash" });
      expect(fromTrashEmpty.focusTarget).toEqual({ kind: "emptyTrashButton" });
    });
  });

  describe("returnToTrashAfterAction", () => {
    const baseState: DialogState = openScreen(INITIAL_STATE, { kind: "trashEmptyConfirm" });

    it("失敗時はゴミ箱画面に戻し、alert と focusTarget を設定する", () => {
      const next = returnToTrashAfterAction(
        baseState,
        { ok: false, notice: { kind: "error", message: "失敗しました" } },
        { kind: "emptyTrashButton" },
      );
      expect(next.screen).toEqual({ kind: "trash" });
      expect(next.notices).toEqual({
        status: "",
        alert: "失敗しました",
        sequence: baseState.notices.sequence + 1,
      });
      expect(next.focusTarget).toEqual({ kind: "emptyTrashButton" });
    });

    it("status 成功時は status に、warning 成功や saveRetryNotice は alert に出す", () => {
      const statusNext = returnToTrashAfterAction(
        baseState,
        {
          ok: true,
          remounted: false,
          notice: { kind: "status", message: "復元しました" },
          saveRetryNotice: null,
        },
        { kind: "backToListButton" },
      );
      expect(statusNext.screen).toEqual({ kind: "trash" });
      expect(statusNext.notices.status).toBe("復元しました");
      expect(statusNext.notices.alert).toBe("");

      const warningNext = returnToTrashAfterAction(
        baseState,
        {
          ok: true,
          remounted: false,
          notice: { kind: "warning", message: "後始末に失敗しました" },
          saveRetryNotice: { kind: "error", message: "保存も失敗" },
        },
        { kind: "backToListButton" },
      );
      expect(warningNext.notices.status).toBe("");
      expect(warningNext.notices.alert).toBe("後始末に失敗しました 保存も失敗");
    });
  });

  describe("closeAfterSuccess / closeAfterEnteringProtectedMode", () => {
    it("closeAfterSuccess は remounted: true かつ notice ありの時だけ shellNotice を積む", () => {
      const opened = openScreen(INITIAL_STATE, { kind: "create", origin: "list" });

      const remounted = closeAfterSuccess(opened, {
        ok: true,
        remounted: true,
        notice: { kind: "status", message: "作成しました" },
        saveRetryNotice: null,
      });
      expect(remounted.screen).toEqual({ kind: "closed" });
      expect(remounted.headerFocusRequest).toBe("list");
      expect(remounted.shellNotice).toEqual({
        sequence: 1,
        notice: { kind: "status", message: "作成しました" },
      });

      const unmountedNoop = closeAfterSuccess(opened, {
        ok: true,
        remounted: false,
        notice: { kind: "status", message: "変化なし" },
        saveRetryNotice: null,
      });
      expect(unmountedNoop.screen).toEqual({ kind: "closed" });
      expect(unmountedNoop.shellNotice).toBeNull();
    });

    it("closeAfterEnteringProtectedMode は export へフォーカス要求して shellNotice を積む", () => {
      const opened = openScreen(INITIAL_STATE, { kind: "trash" });
      const next = closeAfterEnteringProtectedMode(opened, {
        kind: "error",
        message: "保護モードへ移行しました",
      });
      expect(next.screen).toEqual({ kind: "closed" });
      expect(next.headerFocusRequest).toBe("export");
      expect(next.shellNotice).toEqual({
        sequence: 1,
        notice: { kind: "error", message: "保護モードへ移行しました" },
      });
    });
  });

  describe("nextNotices / returnToList / backToList", () => {
    it("呼び出すたびに sequence を進め、returnToList は list へ戻る", () => {
      const first = nextNotices(INITIAL_STATE, "", "同じエラー");
      const second = nextNotices({ ...INITIAL_STATE, notices: first }, "", "同じエラー");
      expect(second.sequence).toBe(first.sequence + 1);

      const listState = returnToList(
        INITIAL_STATE,
        {
          ok: true,
          remounted: false,
          notice: { kind: "status", message: "名前を変更しました" },
          saveRetryNotice: null,
        },
        { kind: "row", mapId: "a", action: "rename" },
      );
      expect(listState.screen).toEqual({ kind: "list" });
      expect(listState.notices.status).toBe("名前を変更しました");
      expect(listState.focusTarget).toEqual({ kind: "row", mapId: "a", action: "rename" });
    });

    it("backToList は既定で通知を消し、alertMessage 指定時は1回の遷移で alert を設定する", () => {
      const failed = showFailure(
        openScreen(INITIAL_STATE, { kind: "backupConfirm", preview: dummyBackupPreview }),
        { kind: "error", message: "前回の失敗" },
      );

      const cleared = backToList(failed, { kind: "backupButton" });
      expect(cleared.screen).toEqual({ kind: "list" });
      expect(cleared.notices).toEqual({
        status: "",
        alert: "",
        sequence: failed.notices.sequence + 1,
      });
      expect(cleared.focusTarget).toEqual({ kind: "backupButton" });

      const withAlert = backToList(failed, { kind: "restoreButton" }, "読み込み失敗");
      expect(withAlert.screen).toEqual({ kind: "list" });
      expect(withAlert.notices).toEqual({
        status: "",
        alert: "読み込み失敗",
        sequence: failed.notices.sequence + 1,
      });
      expect(withAlert.focusTarget).toEqual({ kind: "restoreButton" });
    });
  });

  describe("nextScreenAfterActiveDeletion / returnAfterActiveDeletion", () => {
    const deleteState: DialogState = openScreen(INITIAL_STATE, { kind: "delete", mapId: "m1" });
    const nextFocus = { kind: "row", mapId: "m2", action: "open" } as const;

    it("通常成功（remounted: false）は一覧へ戻り、status / warning / saveRetryNotice を反映する", () => {
      const statusResult = {
        ok: true as const,
        remounted: false,
        notice: { kind: "status" as const, message: "削除しました" },
        saveRetryNotice: null,
      };
      expect(nextScreenAfterActiveDeletion(statusResult, "m1")).toEqual({ kind: "list" });

      const nextStatus = returnAfterActiveDeletion(deleteState, statusResult, "m1", nextFocus);
      expect(nextStatus.screen).toEqual({ kind: "list" });
      expect(nextStatus.notices).toEqual({
        status: "削除しました",
        alert: "",
        sequence: deleteState.notices.sequence + 1,
      });
      expect(nextStatus.focusTarget).toEqual(nextFocus);

      const warningResult = {
        ok: true as const,
        remounted: false,
        notice: { kind: "warning" as const, message: "本体が残りました" },
        saveRetryNotice: { kind: "error" as const, message: "保存も失敗" },
      };
      const nextWarning = returnAfterActiveDeletion(deleteState, warningResult, "m1", nextFocus);
      expect(nextWarning.screen).toEqual({ kind: "list" });
      expect(nextWarning.notices.status).toBe("");
      expect(nextWarning.notices.alert).toBe("本体が残りました 保存も失敗");
    });

    it("再マウント成功（remounted: true）はダイアログを閉じて shellNotice を積む", () => {
      const remountedResult = {
        ok: true as const,
        remounted: true,
        notice: { kind: "status" as const, message: "現在のマップを削除しました" },
        saveRetryNotice: null,
      };
      expect(nextScreenAfterActiveDeletion(remountedResult, "m1")).toEqual({ kind: "closed" });

      const next = returnAfterActiveDeletion(deleteState, remountedResult, "m1", nextFocus);
      expect(next.screen).toEqual({ kind: "closed" });
      expect(next.headerFocusRequest).toBe("list");
      expect(next.focusTarget).toBeNull();
      expect(next.shellNotice).toEqual({
        sequence: 1,
        notice: { kind: "status", message: "現在のマップを削除しました" },
      });
    });

    it("canPermanentDelete: true の失敗は完全削除を許可した確認画面へ切り替え alert を出す", () => {
      const permanentResult = {
        ok: false as const,
        notice: { kind: "error" as const, message: "容量不足のためゴミ箱へ移せません" },
        canPermanentDelete: true,
      };
      expect(nextScreenAfterActiveDeletion(permanentResult, "m1")).toEqual({
        kind: "delete",
        mapId: "m1",
        allowPermanentDelete: true,
      });

      const next = returnAfterActiveDeletion(deleteState, permanentResult, "m1", nextFocus);
      expect(next.screen).toEqual({
        kind: "delete",
        mapId: "m1",
        allowPermanentDelete: true,
      });
      expect(next.notices).toEqual({
        status: "",
        alert: "容量不足のためゴミ箱へ移せません",
        sequence: deleteState.notices.sequence + 1,
      });
      expect(next.focusTarget).toEqual(deleteState.focusTarget);
    });

    it("enteredProtectedMode: true の失敗はダイアログを閉じ export へフォーカス要求して shellNotice を積む", () => {
      const protectedResult = {
        ok: false as const,
        notice: { kind: "error" as const, message: "保護モードへ移行しました" },
        enteredProtectedMode: true as const,
      };
      expect(nextScreenAfterActiveDeletion(protectedResult, "m1")).toEqual({ kind: "closed" });

      const next = returnAfterActiveDeletion(deleteState, protectedResult, "m1", nextFocus);
      expect(next.screen).toEqual({ kind: "closed" });
      expect(next.headerFocusRequest).toBe("export");
      expect(next.focusTarget).toBeNull();
      expect(next.shellNotice).toEqual({
        sequence: 1,
        notice: { kind: "error", message: "保護モードへ移行しました" },
      });
    });

    it("通常失敗は画面を変えず（nextScreen: null）、現在画面を保ったまま alert のみ更新する", () => {
      const normalFailure = {
        ok: false as const,
        notice: { kind: "error" as const, message: "削除に失敗しました" },
      };
      expect(nextScreenAfterActiveDeletion(normalFailure, "m1")).toBeNull();

      const permanentDeleteScreenState = openScreen(INITIAL_STATE, {
        kind: "delete",
        mapId: "m1",
        allowPermanentDelete: true,
      });
      const next = returnAfterActiveDeletion(
        permanentDeleteScreenState,
        normalFailure,
        "m1",
        nextFocus,
      );
      expect(next.screen).toEqual({
        kind: "delete",
        mapId: "m1",
        allowPermanentDelete: true,
      });
      expect(next.notices).toEqual({
        status: "",
        alert: "削除に失敗しました",
        sequence: permanentDeleteScreenState.notices.sequence + 1,
      });
      expect(next.focusTarget).toEqual(permanentDeleteScreenState.focusTarget);
    });
  });
});
