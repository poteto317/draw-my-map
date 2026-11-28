"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { guardSingleClick } from "@/components/layout/mapFolderScreenControls";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import {
  type DockSlotGroup,
  type DockSlotId,
} from "@/domain/dock/dockSlotCatalog";
import { groupDockSlotDefs } from "@/domain/dock/groupDockSlotDefs";
import { moveVisibleDockSlot } from "@/domain/dock/moveVisibleDockSlot";

export type DockApplyResult =
  | { ok: true }
  | { ok: false; message: string };

export type DockCustomizeDialogProps = {
  open: boolean;
  draftVisibleSlotIds: readonly DockSlotId[];
  onDraftChange: (next: DockSlotId[]) => void;
  onApply: () => void | Promise<DockApplyResult | void>;
  onCancel: () => void;
  onResetDefault: () => void;
  dialogMouseClickedAtRef: RefObject<number | null>;
  /** 閉じた後にフォーカスを戻す要素（カスタマイズボタン） */
  initialFocusRef: RefObject<HTMLElement | null>;
};

const GROUP_LABELS: Record<DockSlotGroup, string> = {
  edit: "編集",
  "view-tools": "表示ツール",
  session: "セッション",
  voice: "音声",
  io: "入出力",
  "collab-share": "共同編集・共有",
};

type DockCustomizeDialogModalProps = Omit<
  DockCustomizeDialogProps,
  "open" | "initialFocusRef"
>;

function DockCustomizeDialogModal({
  draftVisibleSlotIds,
  onDraftChange,
  onApply,
  onCancel,
  onResetDefault,
  dialogMouseClickedAtRef,
}: DockCustomizeDialogModalProps) {
  const headingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useDialogFocusTrap({
    dialogRef,
    overlayRef,
    onEscape: onCancel,
  });

  useLayoutEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  const visibleSet = new Set(draftVisibleSlotIds);
  const canApply = draftVisibleSlotIds.length > 0 && !applying;
  const defsByGroup = groupDockSlotDefs().map(({ group, defs }) => ({
    group,
    label: GROUP_LABELS[group],
    defs,
  }));

  const toggleSlot = (id: DockSlotId, checked: boolean) => {
    if (checked) {
      if (visibleSet.has(id)) return;
      onDraftChange([...draftVisibleSlotIds, id]);
      return;
    }
    onDraftChange(draftVisibleSlotIds.filter((entry) => entry !== id));
  };

  const handleApply = async () => {
    if (!canApply) return;
    setApplying(true);
    setApplyError(null);
    try {
      const result = await onApply();
      if (result && result.ok === false) {
        setApplyError(result.message);
      }
    } catch {
      setApplyError("Dock の設定を保存できませんでした。");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClickCapture={(event) => {
        handleDialogClickCapture(event, () => {
          dialogMouseClickedAtRef.current = Date.now();
        });
      }}
      onKeyDown={(event) => {
        if (event.repeat && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="dock-customize-dialog max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-800"
        data-testid="dock-customize-dialog"
      >
        <h2
          id={headingId}
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Dock のカスタマイズ
        </h2>

        {applyError !== null && (
          <p
            role="alert"
            className="mt-3 text-sm text-red-700 dark:text-red-300"
            data-testid="dock-customize-apply-error"
          >
            {applyError}
          </p>
        )}

        <div className="dock-customize-dialog__list mt-4 flex flex-col gap-4">
          {defsByGroup.map(({ group, label, defs }) => (
            <section
              key={group}
              className="dock-customize-dialog__group"
              aria-labelledby={`dock-group-${group}`}
            >
              <h3
                id={`dock-group-${group}`}
                className="dock-customize-dialog__group-title text-sm font-semibold text-zinc-800 dark:text-zinc-100"
              >
                {label}
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {defs.map((def) => {
                  const checked = visibleSet.has(def.id);
                  const visibleIndex = draftVisibleSlotIds.indexOf(def.id);
                  const canMoveUp = checked && visibleIndex > 0;
                  const canMoveDown =
                    checked &&
                    visibleIndex >= 0 &&
                    visibleIndex < draftVisibleSlotIds.length - 1;
                  return (
                    <li
                      key={def.id}
                      className="dock-customize-dialog__row flex flex-wrap items-center gap-2"
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            toggleSlot(def.id, event.target.checked);
                          }}
                        />
                        <span>{def.label}</span>
                      </label>
                      <button
                        type="button"
                        className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200"
                        disabled={!canMoveUp}
                        aria-label={`${def.label}を上へ`}
                        onKeyDown={preventRepeatedActivationClick}
                        onClick={guardSingleClick(() => {
                          const next = moveVisibleDockSlot(
                            draftVisibleSlotIds,
                            def.id,
                            -1,
                          );
                          if (next !== null) onDraftChange(next);
                        })}
                      >
                        上へ
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200"
                        disabled={!canMoveDown}
                        aria-label={`${def.label}を下へ`}
                        onKeyDown={preventRepeatedActivationClick}
                        onClick={guardSingleClick(() => {
                          const next = moveVisibleDockSlot(
                            draftVisibleSlotIds,
                            def.id,
                            1,
                          );
                          if (next !== null) onDraftChange(next);
                        })}
                      >
                        下へ
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
            onKeyDown={preventRepeatedActivationClick}
            onClick={guardSingleClick(onResetDefault)}
          >
            既定に戻す
          </button>
          <button
            ref={cancelButtonRef}
            type="button"
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
            onKeyDown={preventRepeatedActivationClick}
            onClick={guardSingleClick(onCancel)}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={!canApply}
            onKeyDown={preventRepeatedActivationClick}
            onClick={guardSingleClick(() => {
              void handleApply();
            })}
          >
            適用
          </button>
        </div>
      </div>
    </div>
  );
}

export function DockCustomizeDialog({
  open,
  draftVisibleSlotIds,
  onDraftChange,
  onApply,
  onCancel,
  onResetDefault,
  dialogMouseClickedAtRef,
  initialFocusRef,
}: DockCustomizeDialogProps) {
  const wasOpenRef = useRef(open);

  useLayoutEffect(() => {
    if (wasOpenRef.current && !open) {
      initialFocusRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, initialFocusRef]);

  // ShareDialog / MapConflictConfirmDialog 型: 閉じたら unmount して Escape リスナを外す
  if (!open) return null;

  return (
    <DockCustomizeDialogModal
      draftVisibleSlotIds={draftVisibleSlotIds}
      onDraftChange={onDraftChange}
      onApply={onApply}
      onCancel={onCancel}
      onResetDefault={onResetDefault}
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
    />
  );
}
