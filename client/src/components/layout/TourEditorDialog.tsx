"use client";

import { useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { TourEditorDialogNotices, TourEditorFocusRequest } from "@/hooks/useMapTourEditor";
import { MAP_TOUR_STEP_MAX } from "@/types/mapTour";
import type { MapTour } from "@/types/mapTour";

type TourEditorDialogProps = {
  tour: MapTour | undefined;
  selectedStepId: string | null;
  titleDraft: string;
  captionDraft: string;
  editDisabled: boolean;
  dialogNotices: TourEditorDialogNotices;
  focusRequest: TourEditorFocusRequest | null;
  onFocusRequestApplied: () => void;
  onTitleDraftChange: (value: string) => void;
  onCaptionDraftChange: (value: string) => void;
  onSelectStep: (stepId: string) => void;
  onPreviewStep: (stepId: string) => void;
  onCreateTour: () => void;
  onSetTitle: () => void;
  onRemoveTour: () => void;
  onAddStep: () => void;
  onRemoveStep: () => void;
  onMoveStepUp: () => void;
  onMoveStepDown: () => void;
  onOverwriteStep: () => void;
  onSetCaption: () => void;
  onClose: () => void;
  onMouseClick: () => void;
};

const inputClassName = "w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900";
const secondaryButtonClassName = "rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900";

function isComposing(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

export function TourEditorDialog({
  tour,
  selectedStepId,
  titleDraft,
  captionDraft,
  editDisabled,
  dialogNotices,
  focusRequest,
  onFocusRequestApplied,
  onTitleDraftChange,
  onCaptionDraftChange,
  onSelectStep,
  onPreviewStep,
  onCreateTour,
  onSetTitle,
  onRemoveTour,
  onAddStep,
  onRemoveStep,
  onMoveStepUp,
  onMoveStepDown,
  onOverwriteStep,
  onSetCaption,
  onClose,
  onMouseClick,
}: TourEditorDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const titleId = useId();
  const captionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onClose });
  const shownNotices = useReannouncedNotice(dialogNotices.sequence, dialogNotices);

  useLayoutEffect(() => {
    if (focusRequest !== "title") return;
    titleRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

  const steps = tour?.steps ?? [];
  const selectedIndex = selectedStepId === null
    ? -1
    : steps.findIndex((step) => step.id === selectedStepId);
  const stepAtLimit = steps.length >= MAP_TOUR_STEP_MAX;
  const hasTour = tour !== undefined;

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event) || event.repeat) return;
    event.preventDefault();
    if (editDisabled) return;
    if (hasTour) onSetTitle();
    else onCreateTour();
  };

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
        className="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">ツアー</h2>
        <p id={descriptionId} className="text-sm">
          表示状態の列を編集します。各ステップはビューポート・選択・折りたたみなどのスナップショットを保持します。
        </p>
        {shownNotices?.status && <p className="text-sm text-green-700 dark:text-green-300">{shownNotices.status}</p>}
        {shownNotices?.alert && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{shownNotices.alert}</p>}

        <label htmlFor={titleId} className="text-sm">ツアーのタイトル</label>
        <input
          id={titleId}
          ref={titleRef}
          type="text"
          className={inputClassName}
          value={titleDraft}
          disabled={editDisabled}
          onChange={(event) => onTitleDraftChange(event.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
        <div className="flex flex-wrap gap-2">
          {!hasTour ? (
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-60"
              disabled={editDisabled}
              onClick={onCreateTour}
            >
              ツアーを作成
            </button>
          ) : (
            <button
              type="button"
              className={secondaryButtonClassName}
              disabled={editDisabled}
              onClick={onSetTitle}
            >
              タイトルを更新
            </button>
          )}
          {hasTour && (
            <button
              type="button"
              className={secondaryButtonClassName}
              disabled={editDisabled}
              onClick={onRemoveTour}
            >
              ツアーを削除
            </button>
          )}
        </div>

        {hasTour && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-60"
                disabled={editDisabled || stepAtLimit}
                onClick={onAddStep}
              >
                現在の表示をステップに追加
              </button>
              {stepAtLimit && <span className="text-xs text-zinc-500">最大 {MAP_TOUR_STEP_MAX} 件</span>}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">ステップ一覧</p>
              {steps.length === 0 ? (
                <p className="text-sm text-zinc-500">ステップがありません。</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {steps.map((step, index) => {
                    const selected = step.id === selectedStepId;
                    return (
                      <li key={step.id}>
                        <button
                          type="button"
                          className={`w-full rounded border px-2 py-1 text-left text-sm ${selected ? "border-blue-600 bg-blue-50 dark:bg-blue-950" : "border-zinc-300 dark:border-zinc-600"}`}
                          disabled={editDisabled}
                          onClick={() => {
                            onSelectStep(step.id);
                            onPreviewStep(step.id);
                          }}
                        >
                          ステップ {index + 1}
                          {step.caption ? ` — ${step.caption}` : ""}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {selectedStepId !== null && selectedIndex >= 0 && (
              <div className="flex flex-col gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-600">
                <p className="text-sm font-medium">ステップ {selectedIndex + 1} を編集</p>
                <label htmlFor={captionId} className="text-sm">キャプション（任意）</label>
                <textarea
                  id={captionId}
                  className={`${inputClassName} min-h-20`}
                  value={captionDraft}
                  disabled={editDisabled}
                  onChange={(event) => onCaptionDraftChange(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={editDisabled}
                    onClick={onSetCaption}
                  >
                    キャプションを保存
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={editDisabled}
                    onClick={onOverwriteStep}
                  >
                    今の表示を上書き
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={editDisabled || selectedIndex === 0}
                    onClick={onMoveStepUp}
                  >
                    上へ
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={editDisabled || selectedIndex >= steps.length - 1}
                    onClick={onMoveStepDown}
                  >
                    下へ
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    disabled={editDisabled}
                    onClick={onRemoveStep}
                  >
                    削除
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={onClose}
            onKeyDown={preventRepeatedActivationClick}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}