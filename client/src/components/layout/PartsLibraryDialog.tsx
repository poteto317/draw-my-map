"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import type { Part } from "@/domain/parts/partsModel";

export type PartsLibraryDialogMode = "register" | "insert" | "delete";

export type PartsLibraryDialogProps = {
  mode: PartsLibraryDialogMode;
  parts: readonly Part[];
  canInsertChild: boolean;
  onCancel: () => void;
  onRegister: (name: string) => void;
  onInsert: (partId: string, insertMode: "root" | "child") => void;
  onDelete: (partId: string) => void;
  onMouseClick: () => void;
};

const inputClassName =
  "w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900";

function isComposing(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

function titleFor(mode: PartsLibraryDialogMode): string {
  switch (mode) {
    case "register":
      return "部品に登録";
    case "insert":
      return "部品を挿入";
    case "delete":
      return "部品を削除";
  }
}

export function PartsLibraryDialog({
  mode,
  parts,
  canInsertChild,
  onCancel,
  onRegister,
  onInsert,
  onDelete,
  onMouseClick,
}: PartsLibraryDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const nameId = useId();
  const partSelectId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const partSelectRef = useRef<HTMLSelectElement>(null);
  const [name, setName] = useState("");
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [insertMode, setInsertMode] = useState<"root" | "child">(
    canInsertChild ? "child" : "root",
  );

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });

  useLayoutEffect(() => {
    if (mode === "register") {
      nameRef.current?.focus();
      return;
    }
    partSelectRef.current?.focus();
  }, [mode]);

  const canSubmitRegister = name.trim().length > 0;
  const canSubmitPart = partId.length > 0 && parts.some((part) => part.id === partId);
  const effectiveInsertMode = insertMode === "child" && !canInsertChild ? "root" : insertMode;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "register") {
      if (!canSubmitRegister) return;
      onRegister(name);
      return;
    }
    if (!canSubmitPart) return;
    if (mode === "insert") {
      onInsert(partId, effectiveInsertMode);
      return;
    }
    onDelete(partId);
  }

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
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">{titleFor(mode)}</h2>
        <p id={descriptionId} className="text-sm">
          {mode === "register" && "選択中の枝を名前付き部品として保存します。"}
          {mode === "insert" && "保存した部品を新しいルート、または選択ノードの子として挿入します。"}
          {mode === "delete" && "部品ライブラリから削除します。マップ上のノードは変わりません。"}
        </p>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label className="flex flex-col gap-1 text-sm" htmlFor={nameId}>
              部品名
              <input
                id={nameId}
                ref={nameRef}
                className={inputClassName}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || isComposing(event)) return;
                  event.preventDefault();
                  if (canSubmitRegister) onRegister(name);
                }}
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm" htmlFor={partSelectId}>
                部品
                <select
                  id={partSelectId}
                  ref={partSelectRef}
                  className={inputClassName}
                  value={partId}
                  onChange={(event) => setPartId(event.target.value)}
                >
                  {parts.length === 0 ? (
                    <option value="">部品がありません</option>
                  ) : (
                    parts.map((part) => (
                      <option key={part.id} value={part.id}>
                        {part.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {mode === "insert" && (
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="font-medium">挿入先</legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="parts-insert-mode"
                      checked={effectiveInsertMode === "root"}
                      onChange={() => setInsertMode("root")}
                    />
                    新しいルートとして
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="parts-insert-mode"
                      checked={effectiveInsertMode === "child"}
                      disabled={!canInsertChild}
                      onChange={() => setInsertMode("child")}
                    />
                    選択ノードの子として
                    {!canInsertChild && (
                      <span className="text-zinc-500">（ノードを 1 つ選ぶと有効）</span>
                    )}
                  </label>
                </fieldset>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              onClick={onCancel}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              disabled={mode === "register" ? !canSubmitRegister : !canSubmitPart}
              onKeyDown={preventRepeatedActivationClick}
            >
              {mode === "register" ? "登録" : mode === "insert" ? "挿入" : "削除"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
