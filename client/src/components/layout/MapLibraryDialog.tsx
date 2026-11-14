"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { MapLibraryDeleteConfirm } from "@/components/layout/MapLibraryDeleteConfirm";
import { MapLibraryBackupConfirm } from "@/components/layout/MapLibraryBackupConfirm";
import { MapLibraryRestoreConfirm } from "@/components/layout/MapLibraryRestoreConfirm";
import { MapLibraryListScreen } from "@/components/layout/MapLibraryListScreen";
import { MapLibraryNameForm } from "@/components/layout/MapLibraryNameForm";
import { MapLibraryTrashEmptyConfirm } from "@/components/layout/MapLibraryTrashEmptyConfirm";
import { MapLibraryTrashPermanentDeleteConfirm } from "@/components/layout/MapLibraryTrashPermanentDeleteConfirm";
import { MapLibraryTrashScreen } from "@/components/layout/MapLibraryTrashScreen";
import { mapLibraryListButtonSelector } from "@/components/layout/mapLibraryListButtons";
import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import {
  listFocusableElements,
  useDialogFocusTrap,
} from "@/components/layout/useDialogFocusTrap";
import {
  describeMapRemoval,
  type MapIndexEntry,
} from "@/domain/mapLibrary/mapIndex";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";
import type {
  MapLibraryDialogFocusTarget,
  MapLibraryDialogNotices,
  OpenMapLibraryDialogScreen,
} from "@/types/mapLibraryDialog";

type MapLibraryDialogProps = {
  screen: OpenMapLibraryDialogScreen;
  maps: readonly MapIndexEntry[]; // 表示順
  currentMapId: string;
  trashEntries: readonly MapTrashEntry[];
  trashStatus: "ok" | "corrupt";
  now?: Date;
  notices: MapLibraryDialogNotices;
  focusTarget: MapLibraryDialogFocusTarget | null;
  onFocusTargetApplied: () => void;
  onEscape: () => void; // 画面ごとの戻り先はシェル側で決める
  onClose: () => void;
  onOpenCreate: () => void;
  onOpenRename: (mapId: string) => void;
  onOpenDelete: (mapId: string) => void;
  onOpenTrash: () => void;
  onSwitch: (mapId: string) => void;
  onCancel: () => void;
  onSubmitCreate: (nameInput: string) => void;
  onSubmitRename: (mapId: string, nameInput: string) => void;
  onConfirmDelete: (mapId: string) => void;
  onConfirmPermanentDeleteActive: (mapId: string) => void;
  onRestoreTrash: (trashId: string) => void;
  onOpenTrashPermanentDelete: (trashId: string) => void;
  onConfirmTrashPermanentDelete: (trashId: string) => void;
  onOpenEmptyTrash: () => void;
  onConfirmEmptyTrash: () => void;
  onPrepareBackup: () => void;
  onDownloadBackup: () => void;
  onSelectRestoreFile: (file: File) => void;
  onConfirmRestore: () => void;
  storageMode: "persistent" | "protected";
  // ダイアログの中のマウスのクリック（detail > 0）ごとに呼ぶ。閉じた直後のダブルクリックの続きを
  // キャンバスが無視するために、シェルがクリックの時刻を控える
  onMouseClick: () => void;
};

const LIBRARY_ACTION_BY_TARGET = {
  backupButton: "backup",
  restoreButton: "restore",
  trashButton: "trash",
  emptyTrashButton: "emptyTrash",
  backToListButton: "backToList",
} as const;

function queryLibraryAction(dialog: HTMLElement, action: string): HTMLElement | null {
  return dialog.querySelector<HTMLElement>(`[data-map-library-action="${action}"]`);
}

function resolveFocusElement(
  dialog: HTMLElement,
  focusTarget: MapLibraryDialogFocusTarget,
  screenKind: OpenMapLibraryDialogScreen["kind"],
  currentMapId: string,
  refs: { cancelButton: HTMLButtonElement | null; nameInput: HTMLInputElement | null },
): HTMLElement | null {
  if (focusTarget.kind === "screenDefault") {
    switch (screenKind) {
      case "list":
        return dialog.querySelector<HTMLElement>(
          mapLibraryListButtonSelector({ kind: "row", mapId: currentMapId, action: "open" }),
        );
      case "trash":
        return (
          dialog.querySelector<HTMLElement>('[data-trash-action="restore"]')
          ?? queryLibraryAction(dialog, "backToList")
        );
      case "delete":
      case "backupConfirm":
      case "restoreConfirm":
      case "restoreReading":
      case "trashPermanentDelete":
      case "trashEmptyConfirm":
        // 取り消せない操作または中断操作なので、既定を安全側にする
        return refs.cancelButton;
      case "create":
      case "rename":
        return refs.nameInput;
    }
  }
  if (focusTarget.kind === "trashRow") {
    return (
      dialog.querySelector<HTMLElement>(
        `[data-trash-id="${focusTarget.trashId}"][data-trash-action="${focusTarget.action}"]`,
      ) ?? queryLibraryAction(dialog, "backToList")
    );
  }
  if (focusTarget.kind === "listCreateButton" || focusTarget.kind === "row") {
    return dialog.querySelector<HTMLElement>(mapLibraryListButtonSelector(focusTarget));
  }
  const action = LIBRARY_ACTION_BY_TARGET[focusTarget.kind];
  return queryLibraryAction(dialog, action) ?? queryLibraryAction(dialog, "backToList");
}

function getScreenKey(screen: OpenMapLibraryDialogScreen): string {
  switch (screen.kind) {
    case "rename":
    case "delete":
      return `${screen.kind}:${screen.mapId}`;
    case "trashPermanentDelete":
      return `${screen.kind}:${screen.trashId}`;
    default:
      return screen.kind;
  }
}

export function MapLibraryDialog({
  screen,
  maps,
  currentMapId,
  trashEntries,
  trashStatus,
  now,
  notices,
  focusTarget,
  onFocusTargetApplied,
  onEscape,
  onClose,
  onOpenCreate,
  onOpenRename,
  onOpenDelete,
  onOpenTrash,
  onSwitch,
  onCancel,
  onSubmitCreate,
  onSubmitRename,
  onConfirmDelete,
  onConfirmPermanentDeleteActive,
  onRestoreTrash,
  onOpenTrashPermanentDelete,
  onConfirmTrashPermanentDelete,
  onOpenEmptyTrash,
  onConfirmEmptyTrash,
  onPrepareBackup,
  onDownloadBackup,
  onSelectRestoreFile,
  onConfirmRestore,
  storageMode,
  onMouseClick,
}: MapLibraryDialogProps) {
  const [defaultNow, setDefaultNow] = useState(() => new Date());
  const effectiveNow = now ?? defaultNow;
  const handleOpenTrash = () => {
    if (now === undefined) setDefaultNow(new Date());
    onOpenTrash();
  };
  const headingId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const onFocusTargetAppliedRef = useRef(onFocusTargetApplied);
  const onCancelRef = useRef(onCancel);

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape });
  const shownNotices = useReannouncedNotice(notices.sequence, notices);

  // 次に開くマップは describeMapRemoval だけで決める（表示順。L-170）
  const removal =
    screen.kind === "delete"
      ? describeMapRemoval(maps, currentMapId, screen.mapId)
      : null;
  const renameTarget =
    screen.kind === "rename"
      ? (maps.find((map) => map.id === screen.mapId) ?? null)
      : null;
  const trashPermanentDeleteTarget =
    screen.kind === "trashPermanentDelete"
      ? (trashEntries.find((entry) => entry.id === screen.trashId) ?? null)
      : null;
  const isTargetMissing =
    (screen.kind === "delete" && removal === null)
    || (screen.kind === "rename" && renameTarget === null)
    || (screen.kind === "trashPermanentDelete" && trashPermanentDeleteTarget === null);

  useLayoutEffect(() => {
    onFocusTargetAppliedRef.current = onFocusTargetApplied;
    onCancelRef.current = onCancel;
  }, [onFocusTargetApplied, onCancel]);

  // 対象がもう無い名前変更・削除・ゴミ箱個別削除の画面は描画せず、キャンセルと同じく前画面へ戻す
  useLayoutEffect(() => {
    if (isTargetMissing) onCancelRef.current();
  }, [isTargetMissing]);

  // 画面が描画された後に当てる。行のボタンは要素の参照ではなく属性で探す
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    // 対象が無い画面は前画面へ戻るので、フォーカス先は戻った後の画面のために残す
    if (focusTarget === null || dialog === null || isTargetMissing) return;

    const element = resolveFocusElement(
      dialog,
      focusTarget,
      screen.kind,
      currentMapId,
      { cancelButton: cancelButtonRef.current, nameInput: nameInputRef.current },
    );

    (element ?? listFocusableElements(dialog)[0])?.focus();
    onFocusTargetAppliedRef.current();
  }, [focusTarget, screen.kind, currentMapId, isTargetMissing]);

  const renderScreen = () => {
    switch (screen.kind) {
      case "list":
        return (
          <MapLibraryListScreen
            headingId={headingId}
            maps={maps}
            currentMapId={currentMapId}
            onOpenCreate={onOpenCreate}
            onClose={onClose}
            onSwitch={onSwitch}
            onOpenRename={onOpenRename}
            onOpenDelete={onOpenDelete}
            onPrepareBackup={onPrepareBackup}
            onSelectRestoreFile={onSelectRestoreFile}
            trashCount={trashEntries.length}
            trashStatus={trashStatus}
            onOpenTrash={handleOpenTrash}
            storageMode={storageMode}
          />
        );
      case "create":
        return (
          <MapLibraryNameForm
            mode="create"
            headingId={headingId}
            initialName=""
            inputRef={nameInputRef}
            onSubmit={onSubmitCreate}
            onCancel={onCancel}
          />
        );
      case "rename":
        if (renameTarget === null) return null;
        return (
          <MapLibraryNameForm
            mode="rename"
            headingId={headingId}
            initialName={renameTarget.name}
            inputRef={nameInputRef}
            onSubmit={(nameInput) => onSubmitRename(screen.mapId, nameInput)}
            onCancel={onCancel}
          />
        );
      case "delete":
        if (removal === null) return null;
        return (
          <MapLibraryDeleteConfirm
            headingId={headingId}
            descriptionId={descriptionId}
            target={removal.target}
            isCurrent={removal.isCurrent}
            nextMapName={removal.nextMap?.name ?? null}
            isLast={removal.isLast}
            cancelButtonRef={cancelButtonRef}
            onConfirm={() => onConfirmDelete(screen.mapId)}
            onCancel={onCancel}
            allowPermanentDelete={screen.allowPermanentDelete}
            onConfirmPermanentDelete={() => onConfirmPermanentDeleteActive(screen.mapId)}
          />
        );
      case "trash":
        return (
          <MapLibraryTrashScreen
            headingId={headingId}
            entries={trashEntries}
            trashStatus={trashStatus}
            now={effectiveNow}
            onRestore={onRestoreTrash}
            onOpenPermanentDelete={onOpenTrashPermanentDelete}
            onOpenEmptyTrash={onOpenEmptyTrash}
            onBackToList={onCancel}
          />
        );
      case "trashPermanentDelete":
        if (trashPermanentDeleteTarget === null) return null;
        return (
          <MapLibraryTrashPermanentDeleteConfirm
            headingId={headingId}
            descriptionId={descriptionId}
            target={trashPermanentDeleteTarget}
            cancelButtonRef={cancelButtonRef}
            onConfirm={() => onConfirmTrashPermanentDelete(screen.trashId)}
            onCancel={onCancel}
          />
        );
      case "trashEmptyConfirm":
        return (
          <MapLibraryTrashEmptyConfirm
            headingId={headingId}
            descriptionId={descriptionId}
            trashStatus={trashStatus}
            count={trashEntries.length}
            cancelButtonRef={cancelButtonRef}
            onConfirm={onConfirmEmptyTrash}
            onCancel={onCancel}
          />
        );
      case "backupConfirm":
        return <MapLibraryBackupConfirm headingId={headingId} descriptionId={descriptionId} preview={screen.preview} cancelButtonRef={cancelButtonRef} onConfirm={onDownloadBackup} onCancel={onCancel} />;
      case "restoreReading":
        return <div className="flex flex-col gap-3"><h2 id={headingId}>バックアップを読み込み中</h2><p>読み込み中です…</p><button ref={cancelButtonRef} type="button" onKeyDown={suppressBackupRestoreActionKey} onClick={onCancel}>キャンセル</button></div>;
      case "restoreConfirm":
        return <MapLibraryRestoreConfirm headingId={headingId} descriptionId={descriptionId} preview={screen.preview} cancelButtonRef={cancelButtonRef} onConfirm={onConfirmRestore} onCancel={onCancel} />;
    }
  };
  const screenContent = renderScreen();
  // 画面（と対象のマップ・ゴミ箱項目）ごとに group を作り直し、入力欄の状態も画面ごとに持ち直す
  const screenKey = getScreenKey(screen);
  const hasDescription =
    screen.kind === "delete"
    || screen.kind === "backupConfirm"
    || screen.kind === "restoreConfirm"
    || screen.kind === "trashPermanentDelete"
    || screen.kind === "trashEmptyConfirm";

  return (
    <div
      ref={overlayRef}
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        // 余白を押したときにフォーカスを body へ落とさず、ダイアログ自身に受け止める。Tab の巡回には入れない
        tabIndex={-1}
        aria-modal="true"
        // 画面ごとの名前と説明は、下の group に持たせる。ダイアログ自身は画面によらない名前にして、
        // 開いたときに見出しが二度読まれないようにする
        aria-label="マップの管理"
        className="flex max-h-full w-full max-w-[28rem] flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        {screenContent !== null && (
          // ダイアログの要素は画面が変わっても同じなので、画面ごとに新しい group を作り、
          // フォーカスが入ったときに見出しと説明（確認の本文）を読ませる
          <div
            key={screenKey}
            role="group"
            aria-labelledby={headingId}
            aria-describedby={hasDescription ? descriptionId : undefined}
          >
            {screenContent}
          </div>
        )}
        <div className="text-sm">
          <p role="status" aria-live="polite" className="text-zinc-600 dark:text-zinc-400">
            {shownNotices?.status ?? ""}
          </p>
          <p role="alert" aria-live="assertive" className="text-red-700 dark:text-red-300">
            {shownNotices?.alert ?? ""}
          </p>
        </div>
      </div>
    </div>
  );
}
