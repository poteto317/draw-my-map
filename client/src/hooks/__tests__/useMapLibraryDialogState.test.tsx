import { useLayoutEffect, useMemo, useState } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryDialog } from "@/components/layout/MapLibraryDialog";
import {
  AUTO_SAVE_FAILURE_MESSAGE,
  bodyRemovalFailedNotice,
  createFlushFailedNotice,
  currentBodyRemovalFailedNotice,
  currentMapDeletedNotice,
  indexWriteFailedNotice,
  lastBodyRemovalFailedNotice,
  lastMapDeletedNotice,
  mapCreatedNotice,
  mapDeletedNotice,
  mapIdUnavailableNotice,
  mapRenamedNotice,
  mapSwitchedNotice,
  switchFlushFailedNotice,
} from "@/domain/mapLibrary/mapLibraryMessages";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type {
  MapLibraryOperationResult,
  UseMapLibraryResult,
} from "@/hooks/useMapLibrary";
import {
  selectFocusAfterRemoval,
  useMapLibraryDialogState,
} from "@/hooks/useMapLibraryDialogState";
import { createProtectedStorageSession } from "@/services/persistence/protectedStorageSession";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

type FakeLibrary = Pick<
  UseMapLibraryResult,
  "createMap" | "switchMap" | "renameMap" | "deleteMap" | "moveBranchToMap"
>;

function entry(id: string, name: string): MapIndexEntry {
  return {
    id,
    name,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
  };
}

// 表示順
const threeMaps: MapIndexEntry[] = [entry("a", "A"), entry("b", "B"), entry("c", "C")];

// 本物と同じ結果型を返す（L-171）。既定は本物が開いているマップの切り替えなどで返す「変化なし」
const UNCHANGED: MapLibraryOperationResult = {
  ok: true,
  remounted: false,
  notice: null,
  saveRetryNotice: null,
};

function remountedResult(notice: OperationNotice): MapLibraryOperationResult {
  return { ok: true, remounted: true, notice, saveRetryNotice: null };
}

function keptResult(
  notice: OperationNotice | null,
  saveRetryNotice: OperationNotice | null = null,
): MapLibraryOperationResult {
  return { ok: true, remounted: false, notice, saveRetryNotice };
}

function failedResult(notice: OperationNotice): MapLibraryOperationResult {
  return { ok: false, notice };
}

function createFakeLibrary(): jest.Mocked<FakeLibrary> {
  return {
    createMap: jest.fn<MapLibraryOperationResult, [string]>(() => UNCHANGED),
    switchMap: jest.fn<MapLibraryOperationResult, [string]>(() => UNCHANGED),
    renameMap: jest.fn<MapLibraryOperationResult, [string, string]>(() => UNCHANGED),
    deleteMap: jest.fn<MapLibraryOperationResult, [string]>(() => UNCHANGED),
    moveBranchToMap: jest.fn<MapLibraryOperationResult, [MapStorageSession, string, number]>(() => UNCHANGED),
  };
}

type HookProps = {
  library: FakeLibrary;
  maps: readonly MapIndexEntry[];
  startupNotice: OperationNotice | null;
};

function renderDialogState(overrides: Partial<HookProps> = {}) {
  const initialProps: HookProps = {
    library: createFakeLibrary(),
    maps: threeMaps,
    startupNotice: null,
    ...overrides,
  };
  const rendered = renderHook(
    (props: HookProps) => useMapLibraryDialogState(props),
    { initialProps },
  );
  return { ...rendered, props: initialProps };
}

const EMPTY_NOTICES = { status: "", alert: "", sequence: expect.any(Number) };

describe("useMapLibraryDialogState の枝の別マップへの移動", () => {
  const session = createProtectedStorageSession("a", null);
  const moveFailure: OperationNotice = { kind: "error", message: "枝を移動できませんでした。" };

  it("移動先を開いた成功はシェルの通知に出し、ヘッダーの「マップ一覧」へ戻す", () => {
    const library = createFakeLibrary();
    const notice: OperationNotice = { kind: "status", message: "枝を移動しました。" };
    const success = remountedResult(notice);
    library.moveBranchToMap.mockReturnValue(success);
    const { result } = renderDialogState({ library });
    let returned: MapLibraryOperationResult | undefined;

    act(() => {
      returned = result.current.moveBranchToMap(session, "b", 2);
    });

    expect(library.moveBranchToMap).toHaveBeenCalledWith(session, "b", 2);
    expect(returned).toBe(success);
    expect(result.current.shellNotice).toEqual({ sequence: 1, notice });
    expect(result.current.headerFocusRequest).toBe("list");
  });

  it("保護モードへ移った失敗はシェルの通知に出し、ヘッダーの「JSON書き出し」へ移す", () => {
    const library = createFakeLibrary();
    library.moveBranchToMap.mockReturnValue({ ok: false, notice: moveFailure, enteredProtectedMode: true });
    const { result } = renderDialogState({ library });

    act(() => {
      result.current.moveBranchToMap(session, "b", 2);
    });

    expect(result.current.shellNotice).toEqual({ sequence: 1, notice: moveFailure });
    expect(result.current.headerFocusRequest).toBe("export");
  });

  it("保護モードへ移らない失敗はシェルの状態を変えず、枝の移動のダイアログへ任せる", () => {
    const library = createFakeLibrary();
    library.moveBranchToMap.mockReturnValue(failedResult(moveFailure));
    const { result } = renderDialogState({ library });

    act(() => {
      result.current.moveBranchToMap(session, "b", 2);
    });

    expect(result.current.shellNotice).toBeNull();
    expect(result.current.headerFocusRequest).toBeNull();
  });

  it("起動の通知を出した後でも、保護モードへ移った失敗をシェルの通知に出す", () => {
    const library = createFakeLibrary();
    library.moveBranchToMap.mockReturnValue({ ok: false, notice: moveFailure, enteredProtectedMode: true });
    const startupNotice: OperationNotice = { kind: "warning", message: "一覧を作り直しました。" };
    const { result } = renderDialogState({ library, startupNotice });
    expect(result.current.shellNotice).toEqual({ sequence: 1, notice: startupNotice });

    act(() => {
      result.current.moveBranchToMap(session, "b", 2);
    });

    expect(result.current.shellNotice).toEqual({ sequence: 2, notice: moveFailure });
  });
});

describe("useMapLibraryDialogState", () => {
  it("最初は閉じていて、通知もフォーカスの要求も無い", () => {
    const { result } = renderDialogState();

    expect(result.current.screen).toEqual({ kind: "closed" });
    expect(result.current.notices).toEqual(EMPTY_NOTICES);
    expect(result.current.focusTarget).toBeNull();
    expect(result.current.headerFocusRequest).toBeNull();
    expect(result.current.shellNotice).toBeNull();
  });

  describe("画面を開く", () => {
    it.each([
      ["openList", { kind: "list" }],
      ["openCreateFromHeader", { kind: "create", origin: "header" }],
      ["openCreateFromList", { kind: "create", origin: "list" }],
    ] as const)("%s で対応する画面を開き、既定のフォーカス先にする", (method, expected) => {
      const { result } = renderDialogState();

      act(() => result.current[method]());

      expect(result.current.screen).toEqual(expected);
      expect(result.current.focusTarget).toEqual({ kind: "screenDefault" });
      expect(result.current.notices).toEqual(EMPTY_NOTICES);
    });

    it("openRename・openDelete で対象の画面を開き、前の通知を空にする", () => {
      const library = createFakeLibrary();
      library.renameMap.mockReturnValue(failedResult(indexWriteFailedNotice("名前を変更")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openRename("b"));
      act(() => result.current.submitRename("b", "新しい名前"));
      expect(result.current.notices.alert).not.toBe("");

      act(() => result.current.openDelete("c"));

      expect(result.current.screen).toEqual({ kind: "delete", mapId: "c" });
      expect(result.current.focusTarget).toEqual({ kind: "screenDefault" });
      expect(result.current.notices).toEqual(EMPTY_NOTICES);

      act(() => result.current.openRename("a"));
      expect(result.current.screen).toEqual({ kind: "rename", mapId: "a" });
    });
  });

  describe("back と close の行き先", () => {
    it("ヘッダーから開いた新規作成では、閉じてヘッダーの「新しいマップ」へ戻す", () => {
      const { result } = renderDialogState();
      act(() => result.current.openCreateFromHeader());

      act(() => result.current.back());

      expect(result.current.screen).toEqual({ kind: "closed" });
      expect(result.current.headerFocusRequest).toBe("create");
      expect(result.current.focusTarget).toBeNull();
    });

    it("一覧から開いた新規作成では、一覧の「新しいマップ」へ戻す", () => {
      const { result } = renderDialogState();
      act(() => result.current.openList());
      act(() => result.current.openCreateFromList());

      act(() => result.current.back());

      expect(result.current.screen).toEqual({ kind: "list" });
      expect(result.current.focusTarget).toEqual({ kind: "listCreateButton" });
      expect(result.current.headerFocusRequest).toBeNull();
    });

    it.each([
      ["openRename", "rename"],
      ["openDelete", "delete"],
    ] as const)("%s から戻ると、一覧のその行の同じボタンへ戻す", (method, action) => {
      const { result } = renderDialogState();
      act(() => result.current.openList());
      act(() => result.current[method]("b"));

      act(() => result.current.back());

      expect(result.current.screen).toEqual({ kind: "list" });
      expect(result.current.focusTarget).toEqual({ kind: "row", mapId: "b", action });
    });

    it("一覧へ戻るときは、戻る前の画面の失敗の通知を空にする", () => {
      const library = createFakeLibrary();
      library.renameMap.mockReturnValue(failedResult(indexWriteFailedNotice("名前を変更")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openRename("b"));
      act(() => result.current.submitRename("b", "新しい名前"));

      act(() => result.current.back());

      expect(result.current.screen).toEqual({ kind: "list" });
      expect(result.current.notices).toEqual(EMPTY_NOTICES);
    });

    it("閉じているときの back は何も変えず、ヘッダーへのフォーカスも求めない", () => {
      const { result } = renderDialogState();
      const before = {
        screen: result.current.screen,
        focusTarget: result.current.focusTarget,
        headerFocusRequest: result.current.headerFocusRequest,
        notices: result.current.notices,
      };
      expect(before.screen).toEqual({ kind: "closed" });

      act(() => result.current.back());

      expect(result.current.screen).toBe(before.screen);
      expect(result.current.focusTarget).toBe(before.focusTarget);
      expect(result.current.headerFocusRequest).toBeNull();
      expect(result.current.notices).toBe(before.notices);
    });

    it("一覧で戻ると、閉じてヘッダーの「マップ一覧」へ戻す", () => {
      const { result } = renderDialogState();
      act(() => result.current.openList());

      act(() => result.current.back());

      expect(result.current.screen).toEqual({ kind: "closed" });
      expect(result.current.headerFocusRequest).toBe("list");
    });

    it("close は閉じて、ダイアログ内の通知を空にし、ヘッダーの「マップ一覧」へ戻す", () => {
      const library = createFakeLibrary();
      library.switchMap.mockReturnValue(failedResult(indexWriteFailedNotice("マップを切り替え")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.switchTo("b"));
      expect(result.current.notices.alert).not.toBe("");

      act(() => result.current.close());

      expect(result.current.screen).toEqual({ kind: "closed" });
      expect(result.current.notices).toEqual(EMPTY_NOTICES);
      expect(result.current.headerFocusRequest).toBe("list");
      expect(result.current.focusTarget).toBeNull();
    });
  });

  describe("再マウントを伴う成功", () => {
    it.each([
      [
        "作成",
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.createMap.mockReturnValue(remountedResult(mapCreatedNotice("読書メモ"))),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.submitCreate("読書メモ"),
        mapCreatedNotice("読書メモ"),
      ],
      [
        "切り替え",
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.switchMap.mockReturnValue(remountedResult(mapSwitchedNotice("B"))),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.switchTo("b"),
        mapSwitchedNotice("B"),
      ],
      [
        "開いているマップの削除",
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.deleteMap.mockReturnValue(remountedResult(currentMapDeletedNotice("A", "B"))),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.confirmDelete("a"),
        currentMapDeletedNotice("A", "B"),
      ],
      [
        "最後の削除",
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.deleteMap.mockReturnValue(remountedResult(lastMapDeletedNotice("A"))),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.confirmDelete("a"),
        lastMapDeletedNotice("A"),
      ],
      [
        "開いているマップの本体を消せなかった削除",
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.deleteMap.mockReturnValue(
            remountedResult(currentBodyRemovalFailedNotice("A", "B")),
          ),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.confirmDelete("a"),
        currentBodyRemovalFailedNotice("A", "B"),
      ],
      [
        "最後のマップの本体を消せなかった削除",
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.deleteMap.mockReturnValue(remountedResult(lastBodyRemovalFailedNotice("A"))),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.confirmDelete("a"),
        lastBodyRemovalFailedNotice("A"),
      ],
    ])("%sの成功で閉じ、シェルの通知に出してヘッダーの「マップ一覧」へ戻す", (_, setup, run, notice) => {
      const library = createFakeLibrary();
      setup(library);
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());

      act(() => run(result.current));

      expect(result.current.screen).toEqual({ kind: "closed" });
      expect(result.current.shellNotice).toEqual({ sequence: 1, notice });
      expect(result.current.headerFocusRequest).toBe("list");
      // 同じ結果をダイアログ内とシェルに重ねない（L-249）
      expect(result.current.notices).toEqual(EMPTY_NOTICES);
      expect(result.current.focusTarget).toBeNull();
    });

    it("成功のたびにシェルの通知の sequence が1ずつ増える", () => {
      const library = createFakeLibrary();
      library.switchMap
        .mockReturnValueOnce(remountedResult(mapSwitchedNotice("B")))
        .mockReturnValueOnce(remountedResult(mapSwitchedNotice("B")));
      const { result } = renderDialogState({ library });

      act(() => result.current.openList());
      act(() => result.current.switchTo("b"));
      expect(result.current.shellNotice?.sequence).toBe(1);

      act(() => result.current.openList());
      act(() => result.current.switchTo("b"));
      expect(result.current.shellNotice).toEqual({
        sequence: 2,
        notice: mapSwitchedNotice("B"),
      });
    });

    it("開いているマップの「開く」は、何もせず閉じてヘッダーの「マップ一覧」へ戻し、シェルの通知を変えない", () => {
      const library = createFakeLibrary();
      library.switchMap.mockReturnValueOnce(remountedResult(mapSwitchedNotice("B")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.switchTo("b"));
      const shellNotice = result.current.shellNotice;
      act(() => result.current.consumeHeaderFocusRequest());

      act(() => result.current.openList());
      act(() => result.current.switchTo("b"));

      expect(library.switchMap).toHaveBeenLastCalledWith("b");
      expect(result.current.screen).toEqual({ kind: "closed" });
      expect(result.current.headerFocusRequest).toBe("list");
      expect(result.current.shellNotice).toBe(shellNotice);
      expect(result.current.notices).toEqual(EMPTY_NOTICES);
    });
  });

  describe("失敗", () => {
    const startupWarning: OperationNotice = {
      kind: "warning",
      message: "保存データを復元できませんでした。空のマップで開始します。",
    };

    it.each([
      [
        "削除のインデックスの失敗",
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.openDelete("b"),
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.deleteMap.mockReturnValue(failedResult(indexWriteFailedNotice("マップを削除"))),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.confirmDelete("b"),
        { kind: "delete", mapId: "b" },
        indexWriteFailedNotice("マップを削除"),
      ],
      [
        "作成のインデックスの失敗",
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.openCreateFromList(),
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.createMap.mockReturnValue(failedResult(indexWriteFailedNotice("マップを作成"))),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.submitCreate("読書メモ"),
        { kind: "create", origin: "list" },
        indexWriteFailedNotice("マップを作成"),
      ],
      [
        "id を決められない作成",
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.openCreateFromHeader(),
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.createMap.mockReturnValue(failedResult(mapIdUnavailableNotice())),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.submitCreate("読書メモ"),
        { kind: "create", origin: "header" },
        mapIdUnavailableNotice(),
      ],
      [
        "切り替えの前の flush の失敗",
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.openList(),
        (lib: jest.Mocked<FakeLibrary>) =>
          lib.switchMap.mockReturnValue(failedResult(switchFlushFailedNotice())),
        (state: ReturnType<typeof useMapLibraryDialogState>) => state.switchTo("b"),
        { kind: "list" },
        switchFlushFailedNotice(),
      ],
    ])("%sでは、画面・フォーカス先・シェルの通知を変えず、alert だけに文言を出す", (_, open, setup, run, expectedScreen, notice) => {
      const library = createFakeLibrary();
      setup(library);
      const { result } = renderDialogState({ library, startupNotice: startupWarning });
      act(() => open(result.current));
      const focusTarget = result.current.focusTarget;
      const shellNotice = result.current.shellNotice;

      act(() => run(result.current));

      expect(result.current.screen).toEqual(expectedScreen);
      expect(result.current.focusTarget).toBe(focusTarget);
      expect(result.current.notices).toEqual({ status: "", alert: notice.message, sequence: expect.any(Number) });
      expect(result.current.shellNotice).toBe(shellNotice);
      expect(result.current.headerFocusRequest).toBeNull();
    });

    it("画面とフォーカス先を変えずに alert に文言を出し、続けて成功すると alert が空になる", () => {
      const library = createFakeLibrary();
      library.createMap
        .mockReturnValueOnce(failedResult(createFlushFailedNotice()))
        .mockReturnValueOnce(remountedResult(mapCreatedNotice("読書メモ")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openCreateFromList());
      const focusTarget = result.current.focusTarget;

      act(() => result.current.submitCreate("読書メモ"));

      expect(result.current.screen).toEqual({ kind: "create", origin: "list" });
      expect(result.current.focusTarget).toBe(focusTarget);
      expect(result.current.notices).toEqual({
        sequence: expect.any(Number),
        status: "",
        alert: createFlushFailedNotice().message,
      });
      expect(result.current.shellNotice).toBeNull();

      act(() => result.current.submitCreate("読書メモ"));

      expect(result.current.screen).toEqual({ kind: "closed" });
      expect(result.current.notices).toEqual(EMPTY_NOTICES);
    });

    it("同じ失敗が続くと、文言は同じまま notices の sequence を進める", () => {
      const library = createFakeLibrary();
      library.switchMap.mockReturnValue(failedResult(indexWriteFailedNotice("マップを切り替え")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());

      act(() => result.current.switchTo("b"));
      const first = result.current.notices;
      act(() => result.current.switchTo("b"));
      const second = result.current.notices;

      expect(second.alert).toBe(first.alert);
      expect(second.sequence).toBeGreaterThan(first.sequence);
    });

    it("失敗すると前の status を空にする", () => {
      const library = createFakeLibrary();
      library.renameMap
        .mockReturnValueOnce(keptResult(mapRenamedNotice("新しい名前")))
        .mockReturnValueOnce(failedResult(indexWriteFailedNotice("名前を変更")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openRename("b"));
      act(() => result.current.submitRename("b", "新しい名前"));
      expect(result.current.notices.status).not.toBe("");

      act(() => result.current.submitRename("b", "別の名前"));

      expect(result.current.notices).toEqual({
        sequence: expect.any(Number),
        status: "",
        alert: indexWriteFailedNotice("名前を変更").message,
      });
    });

    it("一覧からの切り替えの失敗では、一覧のまま alert に文言を出す", () => {
      const library = createFakeLibrary();
      library.switchMap.mockReturnValue(failedResult(indexWriteFailedNotice("マップを切り替え")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());

      act(() => result.current.switchTo("b"));

      expect(result.current.screen).toEqual({ kind: "list" });
      expect(result.current.notices.alert).toBe(
        indexWriteFailedNotice("マップを切り替え").message,
      );
      expect(result.current.headerFocusRequest).toBeNull();
    });
  });

  describe("名前変更の成功", () => {
    it("一覧へ戻り、status に通知を出し、その行の「名前を変更」へ戻す", () => {
      const library = createFakeLibrary();
      library.renameMap.mockReturnValue(keptResult(mapRenamedNotice("読書メモ")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openRename("b"));

      act(() => result.current.submitRename("b", " 読書メモ"));

      expect(library.renameMap).toHaveBeenCalledWith("b", " 読書メモ");
      expect(result.current.screen).toEqual({ kind: "list" });
      expect(result.current.notices).toEqual({
        sequence: expect.any(Number),
        status: "マップの名前を「読書メモ」に変更しました。",
        alert: "",
      });
      expect(result.current.focusTarget).toEqual({ kind: "row", mapId: "b", action: "rename" });
      expect(result.current.shellNotice).toBeNull();
    });

    it("名前が変わらないとき（notice: null）は、通知を空のまま一覧へ戻る", () => {
      const { result } = renderDialogState();
      act(() => result.current.openList());
      act(() => result.current.openRename("b"));

      act(() => result.current.submitRename("b", "B"));

      expect(result.current.screen).toEqual({ kind: "list" });
      expect(result.current.notices).toEqual(EMPTY_NOTICES);
      expect(result.current.focusTarget).toEqual({ kind: "row", mapId: "b", action: "rename" });
    });
  });

  describe("開いていないマップの削除の成功", () => {
    it.each([
      ["b", { kind: "row", mapId: "c", action: "open" }],
      ["c", { kind: "row", mapId: "b", action: "open" }],
    ] as const)("[A, B, C] で %s を消すと、フォーカス先は %o", (removedId, expected) => {
      const library = createFakeLibrary();
      library.deleteMap.mockReturnValue(keptResult(mapDeletedNotice("X")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openDelete(removedId));

      act(() => result.current.confirmDelete(removedId));

      expect(library.deleteMap).toHaveBeenCalledWith(removedId);
      expect(result.current.screen).toEqual({ kind: "list" });
      expect(result.current.focusTarget).toEqual(expected);
      expect(result.current.notices).toEqual({
        sequence: expect.any(Number),
        status: mapDeletedNotice("X").message,
        alert: "",
      });
      expect(result.current.shellNotice).toBeNull();
    });

    it("保存の再試行の失敗があると、status と alert の両方に文言を出す", () => {
      const library = createFakeLibrary();
      library.deleteMap.mockReturnValue(
        keptResult(mapDeletedNotice("B"), { kind: "error", message: AUTO_SAVE_FAILURE_MESSAGE }),
      );
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openDelete("b"));

      act(() => result.current.confirmDelete("b"));

      expect(result.current.notices).toEqual({
        sequence: expect.any(Number),
        status: mapDeletedNotice("B").message,
        alert: AUTO_SAVE_FAILURE_MESSAGE,
      });
    });

    it("本体の削除の失敗の warning と保存の再試行の失敗が重なると、alert に両方の文言を出す", () => {
      const library = createFakeLibrary();
      library.deleteMap.mockReturnValue(
        keptResult(bodyRemovalFailedNotice("B"), {
          kind: "error",
          message: AUTO_SAVE_FAILURE_MESSAGE,
        }),
      );
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openDelete("b"));

      act(() => result.current.confirmDelete("b"));

      expect(result.current.notices).toEqual({
        sequence: expect.any(Number),
        status: "",
        alert: `${bodyRemovalFailedNotice("B").message} ${AUTO_SAVE_FAILURE_MESSAGE}`,
      });
    });

    it("本体の削除の失敗の warning は alert だけに出す", () => {
      const library = createFakeLibrary();
      library.deleteMap.mockReturnValue(keptResult(bodyRemovalFailedNotice("B")));
      const { result } = renderDialogState({ library });
      act(() => result.current.openList());
      act(() => result.current.openDelete("b"));

      act(() => result.current.confirmDelete("b"));

      expect(result.current.notices).toEqual({
        sequence: expect.any(Number),
        status: "",
        alert: bodyRemovalFailedNotice("B").message,
      });
    });
  });

  describe("selectFocusAfterRemoval", () => {
    it("次の行があれば次の行の「開く」", () => {
      expect(selectFocusAfterRemoval(threeMaps, "a")).toEqual({
        kind: "row",
        mapId: "b",
        action: "open",
      });
    });

    it("次の行が無ければ前の行の「開く」", () => {
      expect(selectFocusAfterRemoval(threeMaps, "c")).toEqual({
        kind: "row",
        mapId: "b",
        action: "open",
      });
    });

    it("1件だけなら一覧の「新しいマップ」", () => {
      expect(selectFocusAfterRemoval([entry("a", "A")], "a")).toEqual({
        kind: "listCreateButton",
      });
    });
  });

  describe("フォーカスの要求を使い切る", () => {
    it("consumeFocusTarget で null に戻り、再描画しても新しい要求を作らない", () => {
      const { result, rerender, props } = renderDialogState();
      act(() => result.current.openList());
      const focusTarget = result.current.focusTarget;
      rerender({ ...props });
      // 描画のたびに新しいオブジェクトを作らない
      expect(result.current.focusTarget).toBe(focusTarget);

      act(() => result.current.consumeFocusTarget());
      expect(result.current.focusTarget).toBeNull();

      rerender({ ...props });
      expect(result.current.focusTarget).toBeNull();
    });

    it("consumeHeaderFocusRequest で null に戻る", () => {
      const { result } = renderDialogState();
      act(() => result.current.openList());
      act(() => result.current.close());
      expect(result.current.headerFocusRequest).toBe("list");

      act(() => result.current.consumeHeaderFocusRequest());

      expect(result.current.headerFocusRequest).toBeNull();
    });

    it("操作の関数は、再描画や library・maps の差し替えで変わらない", () => {
      const { result, rerender, props } = renderDialogState();
      const first = result.current;

      act(() => result.current.openList());
      rerender({ ...props, library: createFakeLibrary(), maps: [...threeMaps] });

      const methods = [
        "openList",
        "openCreateFromHeader",
        "openCreateFromList",
        "openRename",
        "openDelete",
        "back",
        "close",
        "submitCreate",
        "switchTo",
        "submitRename",
        "confirmDelete",
        "consumeFocusTarget",
        "consumeHeaderFocusRequest",
      ] as const;
      for (const method of methods) {
        expect(result.current[method]).toBe(first[method]);
      }
    });

    it("差し替えた後の library と maps を使う", () => {
      const { result, rerender, props } = renderDialogState();
      const library = createFakeLibrary();
      library.deleteMap.mockReturnValue(keptResult(mapDeletedNotice("B")));
      rerender({ ...props, library, maps: [entry("b", "B"), entry("a", "A")] });
      act(() => result.current.openList());

      act(() => result.current.confirmDelete("b"));

      expect(library.deleteMap).toHaveBeenCalledWith("b");
      expect(result.current.focusTarget).toEqual({ kind: "row", mapId: "a", action: "open" });
    });
  });

  describe("startupNotice", () => {
    const warning: OperationNotice = {
      kind: "warning",
      message: "保存データを復元できませんでした。空のマップで開始します。",
    };

    it("null から値に変わったときに1回だけシェルの通知にする", () => {
      const { result, rerender, props } = renderDialogState();
      expect(result.current.shellNotice).toBeNull();

      rerender({ ...props, startupNotice: warning });
      expect(result.current.shellNotice).toEqual({ sequence: 1, notice: warning });
      const shown = result.current.shellNotice;

      rerender({ ...props, startupNotice: { ...warning, message: "別の通知" } });
      expect(result.current.shellNotice).toBe(shown);

      rerender({ ...props, startupNotice: null });
      rerender({ ...props, startupNotice: warning });
      expect(result.current.shellNotice).toBe(shown);
    });

    it("最初から値がある場合も sequence: 1 で1回だけ", () => {
      const { result, rerender, props } = renderDialogState({ startupNotice: warning });
      expect(result.current.shellNotice).toEqual({ sequence: 1, notice: warning });

      rerender({ ...props, startupNotice: { ...warning } });
      expect(result.current.shellNotice).toEqual({ sequence: 1, notice: warning });
    });

    it("起動の通知の後に作成に成功すると、sequence: 2 の作成の通知になる", () => {
      const library = createFakeLibrary();
      library.createMap.mockReturnValue(remountedResult(mapCreatedNotice("読書メモ")));
      const { result } = renderDialogState({ library, startupNotice: warning });
      act(() => result.current.openCreateFromHeader());

      act(() => result.current.submitCreate("読書メモ"));

      expect(result.current.shellNotice).toEqual({
        sequence: 2,
        notice: mapCreatedNotice("読書メモ"),
      });
    });
  });
});

// 設計書の「フォーカスの戻し先」の表を、ダイアログと組み合わせて実際のフォーカスで確かめる
describe("useMapLibraryDialogState と MapLibraryDialog のフォーカスの戻し先", () => {
  function Harness({
    fakeLibrary,
    initialMaps,
    onHeaderFocusRequest,
  }: {
    fakeLibrary: FakeLibrary;
    initialMaps: readonly MapIndexEntry[];
    onHeaderFocusRequest: (request: string) => void;
  }) {
    const [maps, setMaps] = useState(initialMaps);
    // 本物の useMapLibrary と同じく、開いていないマップの削除の成功で maps から対象を除く
    const library = useMemo<FakeLibrary>(() => ({
      ...fakeLibrary,
      deleteMap: (id) => {
        const result = fakeLibrary.deleteMap(id);
        if (result.ok && !result.remounted) {
          setMaps((current) => current.filter((map) => map.id !== id));
        }
        return result;
      },
    }), [fakeLibrary]);
    const state = useMapLibraryDialogState({ library, maps, startupNotice: null });
    useLayoutEffect(() => {
      if (state.headerFocusRequest !== null) onHeaderFocusRequest(state.headerFocusRequest);
    }, [state.headerFocusRequest, onHeaderFocusRequest]);
    return (
      <>
        <button type="button" onClick={state.openList}>
          ヘッダーのマップ一覧
        </button>
        <button type="button" onClick={state.openCreateFromHeader}>
          ヘッダーの新しいマップ
        </button>
        {state.screen.kind !== "closed" && (
          <MapLibraryDialog
            screen={state.screen}
            maps={maps}
            currentMapId="a"
            notices={state.notices}
            focusTarget={state.focusTarget}
            onFocusTargetApplied={state.consumeFocusTarget}
            onEscape={state.back}
            onClose={state.close}
            onOpenCreate={state.openCreateFromList}
            onOpenRename={state.openRename}
            onOpenDelete={state.openDelete}
            onSwitch={state.switchTo}
            onCancel={state.back}
            onSubmitCreate={state.submitCreate}
            onSubmitRename={state.submitRename}
            onConfirmDelete={state.confirmDelete}
            onMouseClick={() => {}}
          />
        )}
      </>
    );
  }

  function renderHarness(
    initialMaps: readonly MapIndexEntry[],
    library: jest.Mocked<FakeLibrary> = createFakeLibrary(),
  ) {
    const onHeaderFocusRequest = jest.fn();
    library.deleteMap.mockImplementation((id) => {
      const target = initialMaps.find((map) => map.id === id);
      return keptResult(mapDeletedNotice(target?.name ?? ""));
    });
    render(
      <Harness
        fakeLibrary={library}
        initialMaps={initialMaps}
        onHeaderFocusRequest={onHeaderFocusRequest}
      />,
    );
    return { library, onHeaderFocusRequest };
  }

  async function openList(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "ヘッダーのマップ一覧" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^A/ })).toHaveFocus());
  }

  async function deleteFromList(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole("button", { name: `削除: ${name}` }));
    await user.click(screen.getByRole("button", { name: "このマップを削除" }));
  }

  it("開いていない別のマップの削除の成功で、次の行の「開く」、次の行が無ければ前の行の「開く」へ戻す", async () => {
    const user = userEvent.setup();
    renderHarness([entry("a", "A"), entry("b", "B"), entry("c", "C"), entry("d", "D")]);
    await openList(user);

    await deleteFromList(user, "B");
    await waitFor(() => expect(screen.getByRole("button", { name: /^C/ })).toHaveFocus());

    await deleteFromList(user, "D");
    await waitFor(() => expect(screen.getByRole("button", { name: /^C/ })).toHaveFocus());
    // ダイアログ内の通知は次のフレームで入る
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("マップ「D」を削除しました。"),
    );
  });

  it("名前変更の成功で、その行の「名前を変更」へ戻す", async () => {
    const user = userEvent.setup();
    const library = createFakeLibrary();
    library.renameMap.mockReturnValue(keptResult(mapRenamedNotice("読書メモ")));
    renderHarness([entry("a", "A"), entry("b", "B")], library);
    await openList(user);

    await user.click(screen.getByRole("button", { name: "名前を変更: B" }));
    await user.type(screen.getByRole("textbox", { name: "マップ名" }), "読書メモ{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "名前を変更: B" })).toHaveFocus(),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "マップの名前を「読書メモ」に変更しました。",
      ),
    );
  });

  it.each([
    ["名前を変更: B", "キャンセル"],
    ["削除: B", "キャンセル"],
    ["名前を変更: B", "{Escape}"],
  ])("「%s」から開いた画面を %s で閉じると、その行の同じボタンへ戻す", async (rowButton, how) => {
    const user = userEvent.setup();
    renderHarness([entry("a", "A"), entry("b", "B")]);
    await openList(user);

    await user.click(screen.getByRole("button", { name: rowButton }));
    if (how === "{Escape}") {
      await user.keyboard("{Escape}");
    } else {
      await user.click(screen.getByRole("button", { name: how }));
    }

    await waitFor(() => expect(screen.getByRole("button", { name: rowButton })).toHaveFocus());
  });

  it("操作の失敗では、画面とフォーカスを変えない", async () => {
    const user = userEvent.setup();
    const library = createFakeLibrary();
    library.renameMap.mockReturnValue(failedResult(indexWriteFailedNotice("名前を変更")));
    renderHarness([entry("a", "A"), entry("b", "B")], library);
    await openList(user);
    await user.click(screen.getByRole("button", { name: "名前を変更: B" }));
    const input = screen.getByRole("textbox", { name: "マップ名" });

    await user.type(input, "読書メモ{Enter}");

    expect(input).toHaveFocus();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        indexWriteFailedNotice("名前を変更").message,
      ),
    );
  });

  it.each([
    ["閉じる", "list"],
    ["開いているマップの「開く」", "list"],
    ["Escape", "list"],
  ])("一覧を %s で閉じると、ヘッダーの「マップ一覧」への要求を出す", async (how, request) => {
    const user = userEvent.setup();
    const { onHeaderFocusRequest, library } = renderHarness([entry("a", "A"), entry("b", "B")]);
    await openList(user);

    if (how === "閉じる") {
      await user.click(screen.getByRole("button", { name: "閉じる" }));
    } else if (how === "Escape") {
      await user.keyboard("{Escape}");
    } else {
      await user.click(screen.getByRole("button", { name: /^A/ }));
      expect(library.switchMap).toHaveBeenCalledWith("a");
    }

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onHeaderFocusRequest).toHaveBeenLastCalledWith(request);
  });

  it("ヘッダーから開いた新規作成を Escape で閉じると、ヘッダーの「新しいマップ」への要求を出す", async () => {
    const user = userEvent.setup();
    const { onHeaderFocusRequest } = renderHarness([entry("a", "A")]);

    await user.click(screen.getByRole("button", { name: "ヘッダーの新しいマップ" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onHeaderFocusRequest).toHaveBeenLastCalledWith("create");
  });

  it("再マウントを伴う成功では、ダイアログを閉じてヘッダーの「マップ一覧」への要求を出す", async () => {
    const user = userEvent.setup();
    const library = createFakeLibrary();
    library.switchMap.mockReturnValue(remountedResult(mapSwitchedNotice("B")));
    const { onHeaderFocusRequest } = renderHarness([entry("a", "A"), entry("b", "B")], library);
    await openList(user);

    await user.click(screen.getByRole("button", { name: /^B/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onHeaderFocusRequest).toHaveBeenLastCalledWith("list");
  });
});
