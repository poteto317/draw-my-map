"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import type { MapReviewCard } from "@/types/mapLearn";

type LearnReviewCardsPanelProps = {
  open: boolean;
  cards: readonly MapReviewCard[];
  cardIndex: number;
  showingAnswer: boolean;
  onClose: () => void;
  onFlip: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGenerate?: () => void;
  canGenerate: boolean;
  generateDisabledReason: string | null;
};

export function LearnReviewCardsPanel({
  open,
  cards,
  cardIndex,
  showingAnswer,
  onClose,
  onFlip,
  onPrevious,
  onNext,
  onGenerate,
  canGenerate,
  generateDisabledReason,
}: LearnReviewCardsPanelProps) {
  const headingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onClose });

  useLayoutEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const current = cards[cardIndex];
  const hasCards = cards.length > 0;
  const canGoBack = cardIndex > 0;
  const canGoForward = cardIndex < cards.length - 1;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, () => {})}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="flex w-full max-w-lg flex-col gap-4 rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900"
      >
        <PanelHeader headingId={headingId} hasCards={hasCards} cardIndex={cardIndex} cards={cards} />
        <div className="min-h-[8rem] rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
          {!hasCards ? (
            <p>復習カードがまだありません。「復習カードを生成」から作成してください。</p>
          ) : (
            <p className="whitespace-pre-wrap break-words">
              {showingAnswer ? current!.answer : current!.prompt}
            </p>
          )}
        </div>
        {hasCards && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {showingAnswer ? "答え" : "問題"} — Space で表裏、← → で前後
          </p>
        )}
        <span className="flex flex-wrap justify-end gap-2">
          {onGenerate && (
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canGenerate}
              title={generateDisabledReason ?? undefined}
              onClick={onGenerate}
            >
              復習カードを生成
            </button>
          )}
          {hasCards && (
            <>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                disabled={!canGoBack}
                onClick={onPrevious}
              >
                前へ
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={onFlip}
              >
                表裏をめくる
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                disabled={!canGoForward}
                onClick={onNext}
              >
                次へ
              </button>
            </>
          )}
          <button
            ref={closeRef}
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            閉じる
          </button>
        </span>
      </div>
    </div>
  );
}

function PanelHeader({
  headingId,
  hasCards,
  cardIndex,
  cards,
}: {
  headingId: string;
  hasCards: boolean;
  cardIndex: number;
  cards: readonly MapReviewCard[];
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 id={headingId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        復習カード
      </h2>
      {hasCards && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {cardIndex + 1}
          {" / "}
          {cards.length}
        </p>
      )}
    </div>
  );
}