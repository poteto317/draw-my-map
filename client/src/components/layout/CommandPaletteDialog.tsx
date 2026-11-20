"use client";

import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { FilteredCommand } from "@/domain/commands/commandTypes";

export type CommandPaletteDialogProps = {
  open: boolean;
  query: string;
  items: readonly FilteredCommand[];
  overflowCount: number;
  activeIndex: number;
  rejectMessage: string | null;
  rejectSequence: number;
  onQueryChange: (query: string) => void;
  onMoveHighlight: (action: "up" | "down" | "home" | "end") => void;
  onExecuteActive: () => void;
  onDismiss: () => void;
  onMouseClick: () => void;
};

type CommandPaletteDialogModalProps = Omit<CommandPaletteDialogProps, "open">;

function isComposingKey(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

function CommandPaletteDialogModal({
  query,
  items,
  overflowCount,
  activeIndex,
  rejectMessage,
  rejectSequence,
  onQueryChange,
  onMoveHighlight,
  onExecuteActive,
  onDismiss,
  onMouseClick,
}: CommandPaletteDialogModalProps) {
  const idPrefix = useId();
  const headingId = `${idPrefix}-heading`;
  const inputId = `${idPrefix}-input`;
  const listboxId = `${idPrefix}-listbox`;
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onDismiss });

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const effectiveActiveIndex =
    items.length === 0
      ? -1
      : activeIndex >= 0 && activeIndex < items.length
        ? activeIndex
        : 0;

  useEffect(() => {
    if (effectiveActiveIndex < 0) return;
    const activeElement = document.getElementById(`${idPrefix}-option-${effectiveActiveIndex}`);
    activeElement?.scrollIntoView?.({ block: "nearest" });
  }, [effectiveActiveIndex, idPrefix, items]);

  const shownReject = useReannouncedNotice(
    rejectSequence,
    rejectMessage === null ? null : { message: rejectMessage },
  );

  const optionId = (index: number) => `${idPrefix}-option-${index}`;
  const activeDescendant = effectiveActiveIndex >= 0 ? optionId(effectiveActiveIndex) : undefined;

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (isComposingKey(event) || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      onMoveHighlight("down");
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onMoveHighlight("up");
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      onMoveHighlight("home");
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onMoveHighlight("end");
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      onExecuteActive();
    }
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    handleDialogClickCapture(event, onMouseClick);
    if (event.target === overlayRef.current && event.detail === 1) {
      onDismiss();
    }
  };

  const statusParts: string[] = [];
  if (overflowCount > 0) {
    statusParts.push(`他 ${overflowCount} 件`);
  }
  if (shownReject?.message) {
    statusParts.push(shownReject.message);
  }

  return (
    <div
      ref={overlayRef}
      onClickCapture={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id={headingId} className="text-lg font-semibold">
            コマンドパレット
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            閉じる
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            コマンドを検索
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            role="combobox"
            value={query}
            aria-label="コマンドを検索"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={items.length > 0}
            aria-activedescendant={activeDescendant}
            placeholder="コマンド名で検索"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div
          id={listboxId}
          role="listbox"
          aria-label="コマンド候補"
          className="flex max-h-80 shrink-0 flex-col gap-1 overflow-y-auto"
        >
          {items.map((item, index) => {
            const isActive = index === effectiveActiveIndex;
            const disabled = !item.availability.enabled;
            return (
              <div
                key={item.definition.id}
                id={optionId(index)}
                role="option"
                aria-selected={isActive}
                aria-disabled={disabled || undefined}
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  isActive
                    ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/60"
                    : "border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50"
                } ${disabled ? "opacity-70" : ""}`}
              >
                <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                  {item.displayLabel}
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {item.definition.categoryLabel}
                </span>
                {disabled && item.availability.disabledReason !== null && (
                  <span className="mt-0.5 block text-xs text-red-700 dark:text-red-300">
                    {item.availability.disabledReason}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p role="status" className="min-h-[1.25rem] text-sm text-zinc-600 dark:text-zinc-400">
          {statusParts.join(" · ")}
        </p>
      </div>
    </div>
  );
}

export function CommandPaletteDialog({ open, ...modalProps }: CommandPaletteDialogProps) {
  if (!open) return null;
  return <CommandPaletteDialogModal {...modalProps} />;
}
