"use client";

import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { formatBranchMoveMapOption } from "@/components/layout/branchMoveMapOption";
import { listBranchMoveParentOptions, type BranchMoveParentNode } from "@/components/layout/branchMoveParentOption";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import {
  BRANCH_MOVE_ROOT_TARGET,
  type BranchMoveError,
  type BranchMoveFocusRequest,
  type BranchMoveMapTarget,
} from "@/hooks/branchMoveDialogState";

type BranchMoveDialogProps = {
  mapMoveTargets: readonly BranchMoveMapTarget[];
  targetMapId: string;
  currentMapId: string;
  sameMap: boolean;
  parentCandidates: readonly BranchMoveParentNode[];
  nodes: readonly BranchMoveParentNode[];
  allowRoot: boolean;
  parentTarget: string;
  canSubmit: boolean;
  error: BranchMoveError;
  focusRequest: BranchMoveFocusRequest;
  onFocusRequestApplied: () => void;
  onTargetMapChange: (id: string) => void;
  onParentTargetChange: (target: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

const inputClassName = "w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900";

export function BranchMoveDialog({
  mapMoveTargets,
  targetMapId,
  currentMapId,
  sameMap,
  parentCandidates,
  nodes,
  allowRoot,
  parentTarget,
  canSubmit,
  error,
  focusRequest,
  onFocusRequestApplied,
  onTargetMapChange,
  onParentTargetChange,
  onCancel,
  onSubmit,
  onMouseClick,
}: BranchMoveDialogProps) {
  const headingId = useId();
  const mapSelectId = useId();
  const parentSelectId = useId();
  const descriptionId = useId();
  const irreversibleNoteId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });
  const shownError = useReannouncedNotice(error.sequence, error);
  const parentOptions = useMemo(() => listBranchMoveParentOptions(parentCandidates, nodes), [parentCandidates, nodes]);

  useLayoutEffect(() => {
    if (focusRequest !== "dialog") return;
    selectRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">枝を移動</h2>
        <p id={descriptionId} className="text-sm">選択したノードとすべての子孫を移動します。</p>
        <label htmlFor={mapSelectId}>移動先マップ</label>
        <select
          id={mapSelectId}
          ref={selectRef}
          className={inputClassName}
          value={targetMapId}
          onChange={(event) => onTargetMapChange(event.target.value)}
        >
          {mapMoveTargets.map((map) => (
            <option key={map.id} value={map.id}>{formatBranchMoveMapOption(map, mapMoveTargets, currentMapId)}</option>
          ))}
        </select>
        {sameMap ? (
          <>
            <label htmlFor={parentSelectId}>移動先の親</label>
            <select
              id={parentSelectId}
              className={inputClassName}
              value={parentTarget}
              onChange={(event) => onParentTargetChange(event.target.value)}
            >
              <option value="">移動先を選択してください</option>
              {allowRoot && <option value={BRANCH_MOVE_ROOT_TARGET}>新しいルート</option>}
              {parentOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>{option.text}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <p className="text-sm">移動先マップの新しいルートとして追加します。</p>
            <p id={irreversibleNoteId} className="text-sm font-medium">
              別マップへの移動は元に戻せません。移動後に移動先を開きます。
            </p>
          </>
        )}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{shownError?.message ?? ""}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border px-3 py-2 text-sm">キャンセル</button>
          <button
            type="button"
            disabled={!canSubmit}
            aria-describedby={sameMap ? undefined : irreversibleNoteId}
            onClick={onSubmit}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            移動する
          </button>
        </div>
      </div>
    </div>
  );
}
