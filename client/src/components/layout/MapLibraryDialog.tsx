"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { MapLibraryDeleteConfirm } from "@/components/layout/MapLibraryDeleteConfirm";
import { MapLibraryListScreen } from "@/components/layout/MapLibraryListScreen";
import { MapLibraryNameForm } from "@/components/layout/MapLibraryNameForm";
import { mapLibraryListButtonSelector } from "@/components/layout/mapLibraryListButtons";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import {
  listFocusableElements,
  useDialogFocusTrap,
} from "@/components/layout/useDialogFocusTrap";
import {
  describeMapRemoval,
  type MapIndexEntry,
} from "@/domain/mapLibrary/mapIndex";
import type {
  MapLibraryDialogFocusTarget,
  MapLibraryDialogNotices,
  OpenMapLibraryDialogScreen,
} from "@/types/mapLibraryDialog";

type MapLibraryDialogProps = {
  screen: OpenMapLibraryDialogScreen;
  maps: readonly MapIndexEntry[]; // 表示順
  currentMapId: string;
  notices: MapLibraryDialogNotices;
  focusTarget: MapLibraryDialogFocusTarget | null;
  onFocusTargetApplied: () => void;
  onEscape: () => void; // 画面ごとの戻り先はシェル側で決める
  onClose: () => void;
  onOpenCreate: () => void;
  onOpenRename: (mapId: string) => void;
  onOpenDelete: (mapId: string) => void;
  onSwitch: (mapId: string) => void;
  onCancel: () => void;
  onSubmitCreate: (nameInput: string) => void;
  onSubmitRename: (mapId: string, nameInput: string) => void;
  onConfirmDelete: (mapId: string) => void;
  // ダイアログの中のマウスのクリック（detail > 0）ごとに呼ぶ。閉じた直後のダブルクリックの続きを
  // キャンバスが無視するために、シェルがクリックの時刻を控える
  onMouseClick: () => void;
};

export function MapLibraryDialog({
  screen,
  maps,
  currentMapId,
  notices,
  focusTarget,
  onFocusTargetApplied,
  onEscape,
  onClose,
  onOpenCreate,
  onOpenRename,
  onOpenDelete,
  onSwitch,
  onCancel,
  onSubmitCreate,
  onSubmitRename,
  onConfirmDelete,
  onMouseClick,
}: MapLibraryDialogProps) {
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
  const isTargetMissing =
    (screen.kind === "delete" && removal === null)
    || (screen.kind === "rename" && renameTarget === null);

  useLayoutEffect(() => {
    onFocusTargetAppliedRef.current = onFocusTargetApplied;
    onCancelRef.current = onCancel;
  }, [onFocusTargetApplied, onCancel]);

  // 対象がもう無い名前変更・削除の画面は描画せず、キャンセルと同じく一覧へ戻す
  useLayoutEffect(() => {
    if (isTargetMissing) onCancelRef.current();
  }, [isTargetMissing]);

  // 画面が描画された後に当てる。行のボタンは要素の参照ではなく属性で探す
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    // 対象が無い画面は一覧へ戻るので、フォーカス先は戻った後の画面のために残す
    if (focusTarget === null || dialog === null || isTargetMissing) return;

    let element: HTMLElement | null;
    if (focusTarget.kind !== "screenDefault") {
      element = dialog.querySelector<HTMLElement>(mapLibraryListButtonSelector(focusTarget));
    } else if (screen.kind === "list") {
      element = dialog.querySelector<HTMLElement>(
        mapLibraryListButtonSelector({ kind: "row", mapId: currentMapId, action: "open" }),
      );
    } else if (screen.kind === "delete") {
      // 取り消せない操作なので、既定を安全側にする
      element = cancelButtonRef.current;
    } else {
      element = nameInputRef.current;
    }

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
          />
        );
    }
  };
  const screenContent = renderScreen();
  // 画面（と対象のマップ）ごとに group を作り直し、入力欄の状態も画面ごとに持ち直す
  const screenKey = screen.kind === "rename" || screen.kind === "delete"
    ? `${screen.kind}:${screen.mapId}`
    : screen.kind;

  return (
    <div
      ref={overlayRef}
      // キーボード・支援技術のクリックは detail が 0 で、ダブルクリックの続きが無いので数えない
      onClickCapture={(event) => {
        if (event.detail > 0) onMouseClick();
      }}
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
          // フォーカスが入ったときに見出しと説明（削除の確認の本文）を読ませる
          <div
            key={screenKey}
            role="group"
            aria-labelledby={headingId}
            aria-describedby={screen.kind === "delete" ? descriptionId : undefined}
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
