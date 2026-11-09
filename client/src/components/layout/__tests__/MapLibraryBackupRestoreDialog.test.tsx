import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MapLibraryDialog } from "@/components/layout/MapLibraryDialog";
import { useMapLibraryDialogState } from "@/hooks/useMapLibraryDialogState";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { LibraryBackupPreview } from "@/services/persistence/libraryBackupExport";
import type { LibraryRestorePreview } from "@/hooks/mapLibraryState";

type Props = Parameters<typeof MapLibraryDialog>[0];
const maps: MapIndexEntry[] = [{ id: "a", name: "A", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }];
const backup = { missingBodyNames: ["B"], orphanBodyCount: 2 } as LibraryBackupPreview;
const restore = { backup: { maps: [{ id: "c", name: "C" }, { id: "d", name: "D" }] } } as LibraryRestorePreview;
afterEach(() => jest.restoreAllMocks());
function props(screenState: Props["screen"]): Props {
  return {
    screen: screenState, maps, currentMapId: "a", storageMode: "persistent",
    notices: { status: "", alert: "", sequence: 0 }, focusTarget: { kind: "screenDefault" },
    onFocusTargetApplied: jest.fn(), onEscape: jest.fn(), onClose: jest.fn(), onOpenCreate: jest.fn(), onOpenRename: jest.fn(),
    onOpenDelete: jest.fn(), onSwitch: jest.fn(), onCancel: jest.fn(), onSubmitCreate: jest.fn(), onSubmitRename: jest.fn(),
    onConfirmDelete: jest.fn(), onPrepareBackup: jest.fn(), onDownloadBackup: jest.fn(), onSelectRestoreFile: jest.fn(),
    onConfirmRestore: jest.fn(), onMouseClick: jest.fn(),
  };
}

it.each([
  [{ kind: "backupConfirm", preview: backup } as const, "バックアップを確認", "ダウンロードを開始", "onDownloadBackup" as const],
  [{ kind: "restoreConfirm", preview: restore } as const, "復元を確認", "マップを追加", "onConfirmRestore" as const],
])("確認画面はキャンセルが先頭で既定フォーカス、抑止キー後の通常クリックは一度で実行する", (state, heading, action, callback) => {
  const p = props(state);
  render(<MapLibraryDialog {...p} />);
  const group = screen.getByRole("group", { name: heading });
  const buttons = within(group).getAllByRole("button");
  expect(buttons[0]).toHaveTextContent("キャンセル");
  expect(buttons[0]).toHaveFocus();
  const confirm = within(group).getByRole("button", { name: action });
  for (const [index, keyEvent] of [
    { key: "Enter", repeat: true }, { key: " ", repeat: true },
    { key: "Enter", isComposing: true }, { key: "Enter", keyCode: 229 },
  ].entries()) {
    // ブラウザは preventDefault された keydown から click を生成しない。
    expect(fireEvent.keyDown(confirm, keyEvent)).toBe(false);
    expect(p[callback]).toHaveBeenCalledTimes(index);
    fireEvent.click(confirm, { detail: 1 });
    expect(p[callback]).toHaveBeenCalledTimes(index + 1);
  }
  fireEvent.click(confirm, { detail: 2 });
  expect(p[callback]).toHaveBeenCalledTimes(4);
});

it("復元確認は既存マップと現在の編集を保持すると説明する", () => {
  render(<MapLibraryDialog {...props({ kind: "restoreConfirm", preview: restore })} />);
  expect(screen.getByRole("group", { name: "復元を確認" })).toHaveTextContent("2件");
  expect(screen.getByRole("group", { name: "復元を確認" })).toHaveTextContent("既存のマップ");
  expect(screen.getByRole("group", { name: "復元を確認" })).toHaveTextContent("現在のマップ");
});

it("読み込み中は進行状況とキャンセルを表示する", () => {
  const p = props({ kind: "restoreReading" });
  render(<MapLibraryDialog {...p} />);
  expect(screen.getByRole("group", { name: "バックアップを読み込み中" })).toHaveTextContent("読み込み中");
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(p.onCancel).toHaveBeenCalledTimes(1);
});

const blockedKeys = [
  { key: "Enter", repeat: true },
  { key: " ", repeat: true },
  { key: "Enter", isComposing: true },
  { key: "Enter", keyCode: 229 },
  { key: " ", isComposing: true },
  { key: " ", keyCode: 229 },
];

it.each([
  [{ kind: "backupConfirm", preview: backup } as const, "バックアップを確認"],
  [{ kind: "restoreConfirm", preview: restore } as const, "復元を確認"],
])("確認画面のキャンセルでリピートとIMEの既定動作を抑止する", (state, heading) => {
  const p = props(state);
  render(<MapLibraryDialog {...p} />);
  const cancel = within(screen.getByRole("group", { name: heading })).getByRole("button", { name: "キャンセル" });
  for (const key of blockedKeys) expect(fireEvent.keyDown(cancel, key)).toBe(false);
  expect(p.onCancel).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(cancel, { key: "Enter" })).toBe(true);
  fireEvent.click(cancel, { detail: 1 });
  expect(p.onCancel).toHaveBeenCalledTimes(1);
});

it("読込中のキャンセルでリピートとIMEを抑止し、通常clickを受ける", () => {
  const p = props({ kind: "restoreReading" });
  render(<MapLibraryDialog {...p} />);
  const cancel = screen.getByRole("button", { name: "キャンセル" });
  for (const key of blockedKeys) expect(fireEvent.keyDown(cancel, key)).toBe(false);
  expect(p.onCancel).not.toHaveBeenCalled();
  fireEvent.click(cancel, { detail: 1 });
  expect(p.onCancel).toHaveBeenCalledTimes(1);
});

it.each(["全マップをバックアップ", "バックアップから復元"])("一覧の%sはリピートとIMEを抑止する", (name) => {
  const p = props({ kind: "list" });
  render(<MapLibraryDialog {...p} />);
  const button = screen.getByRole("button", { name });
  for (const key of blockedKeys) expect(fireEvent.keyDown(button, key)).toBe(false);
  expect(p.onPrepareBackup).not.toHaveBeenCalled();
  expect(p.onSelectRestoreFile).not.toHaveBeenCalled();
});

type Operations = Parameters<typeof useMapLibraryDialogState>[0]["library"];

function makeLibrary() {
  return {
    createMap: jest.fn(), switchMap: jest.fn(), renameMap: jest.fn(), deleteMap: jest.fn(), moveBranchToMap: jest.fn(),
    prepareBackup: jest.fn(() => ({ ok: true as const, value: backup })),
    downloadBackup: jest.fn(() => ({ ok: true as const, remounted: false, notice: { kind: "status" as const, message: "ダウンロードを開始しました。" }, saveRetryNotice: null })),
    previewRestore: jest.fn(async () => ({ ok: true as const, value: restore })),
    confirmRestore: jest.fn(() => ({ ok: true as const, remounted: false, notice: { kind: "status" as const, message: "追加しました。" }, saveRetryNotice: null })),
  } satisfies Operations;
}

function ConnectedDialog({ library }: { library: Operations }) {
  const state = useMapLibraryDialogState({ library, maps, startupNotice: null });
  return state.screen.kind === "closed"
    ? <button onClick={state.openList}>一覧を開く</button>
    : <MapLibraryDialog
      screen={state.screen} maps={maps} currentMapId="a" notices={state.notices}
      focusTarget={state.focusTarget} onFocusTargetApplied={state.consumeFocusTarget}
      onEscape={state.back} onClose={state.close} onOpenCreate={state.openCreateFromList}
      onOpenRename={state.openRename} onOpenDelete={state.openDelete} onSwitch={state.switchTo}
      onCancel={state.back} onSubmitCreate={state.submitCreate} onSubmitRename={state.submitRename}
      onConfirmDelete={state.confirmDelete} onPrepareBackup={state.prepareBackup}
      onDownloadBackup={state.downloadBackup} onSelectRestoreFile={state.selectRestoreFile}
      onConfirmRestore={state.confirmRestore} storageMode="persistent" onMouseClick={() => {}}
    />;
}

it("バックアップ起点から確認キャンセルへ移っても残りのEnterで往復しない", () => {
  const library = makeLibrary();
  render(<ConnectedDialog library={library} />);
  fireEvent.click(screen.getByRole("button", { name: "一覧を開く" }));
  const start = screen.getByRole("button", { name: "全マップをバックアップ" });
  start.focus();
  expect(fireEvent.keyDown(start, { key: "Enter" })).toBe(true);
  fireEvent.click(start, { detail: 0 });
  const cancel = within(screen.getByRole("group", { name: "バックアップを確認" })).getByRole("button", { name: "キャンセル" });
  expect(cancel).toHaveFocus();
  expect(fireEvent.keyDown(cancel, { key: "Enter", repeat: true })).toBe(false);
  expect(screen.getByRole("group", { name: "バックアップを確認" })).toBeInTheDocument();
  fireEvent.click(cancel, { detail: 1 });
  const returned = screen.getByRole("button", { name: "全マップをバックアップ" });
  expect(returned).toHaveFocus();
  expect(fireEvent.keyDown(returned, { key: "Enter", repeat: true })).toBe(false);
  expect(library.prepareBackup).toHaveBeenCalledTimes(1);
  expect(fireEvent.keyDown(returned, { key: "Enter" })).toBe(true);
  fireEvent.click(returned, { detail: 0 });
  expect(library.prepareBackup).toHaveBeenCalledTimes(2);
});

it("バックアップ成功後は起点に戻り、残りのEnterを抑止する", () => {
  const library = makeLibrary();
  render(<ConnectedDialog library={library} />);
  fireEvent.click(screen.getByRole("button", { name: "一覧を開く" }));
  fireEvent.click(screen.getByRole("button", { name: "全マップをバックアップ" }), { detail: 0 });
  fireEvent.click(screen.getByRole("button", { name: "ダウンロードを開始" }), { detail: 0 });
  const start = screen.getByRole("button", { name: "全マップをバックアップ" });
  expect(start).toHaveFocus();
  expect(fireEvent.keyDown(start, { key: "Enter", repeat: true })).toBe(false);
  expect(library.prepareBackup).toHaveBeenCalledTimes(1);
  expect(library.downloadBackup).toHaveBeenCalledTimes(1);
});

it("復元の読込キャンセル後は起点に戻り、残りのSpaceでchooserを再起動しない", async () => {
  const library = makeLibrary();
  let finish!: (value: { ok: true; value: LibraryRestorePreview }) => void;
  library.previewRestore.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  render(<ConnectedDialog library={library} />);
  fireEvent.click(screen.getByRole("button", { name: "一覧を開く" }));
  const start = screen.getByRole("button", { name: "バックアップから復元" });
  const input = screen.getByLabelText("バックアップファイル", { selector: "input" });
  const chooser = jest.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  start.focus();
  expect(fireEvent.keyDown(start, { key: " " })).toBe(true);
  fireEvent.click(start, { detail: 0 });
  expect(chooser).toHaveBeenCalledTimes(1);
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["{}"], "backup.json")] });
  fireEvent.change(input);
  const cancel = screen.getByRole("button", { name: "キャンセル" });
  expect(cancel).toHaveFocus();
  expect(fireEvent.keyDown(cancel, { key: " ", repeat: true })).toBe(false);
  fireEvent.click(cancel, { detail: 1 });
  const returned = screen.getByRole("button", { name: "バックアップから復元" });
  expect(returned).toHaveFocus();
  expect(fireEvent.keyDown(returned, { key: " ", repeat: true })).toBe(false);
  expect(chooser).toHaveBeenCalledTimes(1);
  fireEvent.click(returned, { detail: 1 });
  expect(chooser).toHaveBeenCalledTimes(2);
  await act(async () => finish({ ok: true, value: restore }));
  expect(screen.getByRole("group", { name: "マップ一覧" })).toBeInTheDocument();
});

it("復元確認の通常キャンセル後は起点に戻り、残りのEnterでchooserを再起動しない", async () => {
  const library = makeLibrary();
  render(<ConnectedDialog library={library} />);
  fireEvent.click(screen.getByRole("button", { name: "一覧を開く" }));
  const input = screen.getByLabelText("バックアップファイル", { selector: "input" });
  const chooser = jest.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "バックアップから復元" }), { detail: 0 });
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["{}"], "backup.json")] });
  await act(async () => { fireEvent.change(input); });
  const cancel = screen.getByRole("button", { name: "キャンセル" });
  expect(cancel).toHaveFocus();
  expect(fireEvent.keyDown(cancel, { key: "Enter", repeat: true })).toBe(false);
  fireEvent.click(cancel, { detail: 1 });
  const returned = screen.getByRole("button", { name: "バックアップから復元" });
  expect(returned).toHaveFocus();
  expect(fireEvent.keyDown(returned, { key: "Enter", repeat: true })).toBe(false);
  expect(chooser).toHaveBeenCalledTimes(1);
});

it("復元成功後は起点に戻り、残りのEnterでchooserを再起動しない", async () => {
  const library = makeLibrary();
  render(<ConnectedDialog library={library} />);
  fireEvent.click(screen.getByRole("button", { name: "一覧を開く" }));
  const start = screen.getByRole("button", { name: "バックアップから復元" });
  const input = screen.getByLabelText("バックアップファイル", { selector: "input" });
  const chooser = jest.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  start.focus();
  expect(fireEvent.keyDown(start, { key: "Enter" })).toBe(true);
  fireEvent.click(start, { detail: 0 });
  expect(chooser).toHaveBeenCalledTimes(1);
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["{}"], "backup.json")] });
  await act(async () => { fireEvent.change(input); });
  expect(screen.getByRole("group", { name: "復元を確認" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "マップを追加" }), { detail: 0 });
  const returned = screen.getByRole("button", { name: "バックアップから復元" });
  expect(returned).toHaveFocus();
  expect(fireEvent.keyDown(returned, { key: "Enter", repeat: true })).toBe(false);
  expect(chooser).toHaveBeenCalledTimes(1);
  expect(library.confirmRestore).toHaveBeenCalledTimes(1);
});
