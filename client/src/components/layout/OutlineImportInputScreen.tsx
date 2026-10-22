"use client";

import { useId, type ChangeEvent, type KeyboardEvent, type Ref } from "react";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { isOutlineTextLengthTooLong } from "@/domain/outline/outlineLimits";
import { formatOutlineCurrentLength } from "@/domain/outline/outlineMessages";
import type { OutlineInputError } from "@/hooks/useOutlineImport";

type OutlineImportInputScreenProps = {
  headingId: string; // 見出し「箇条書きのテキスト」の id
  text: string;
  textLength: number;
  inputError: OutlineInputError;
  onTextChange: (text: string) => void;
  onPreview: () => void;
  onCancel: () => void;
  textareaRef: Ref<HTMLTextAreaElement>;
};

const DESCRIPTION =
  "1行を1つのノードにします。行頭の空白（タブ・半角スペース・全角スペース）の深さで親子を決めます。行頭の「- * + ・ •」と「1.」「1)」は取り除きます。空行は無視します。";

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

// 入力欄の Enter は改行なので、押し続けだけを止める。
// ヘッダーのボタンで押し続けた Enter のリピートが、開いた直後の入力欄に空行を入れ続けないようにする（L-408）
function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  // IME の変換中は変換の確定に任せ、何もしない（L-474）
  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
  if (event.key === "Enter" && event.repeat) {
    event.preventDefault();
  }
}

// 「プレビュー」の押し続けで、続けて解析・画面の遷移をしない（L-408）
function handlePreviewKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

export function OutlineImportInputScreen({
  headingId,
  text,
  textLength,
  inputError,
  onTextChange,
  onPreview,
  onCancel,
  textareaRef,
}: OutlineImportInputScreenProps) {
  const textareaId = useId();
  const descriptionId = useId();
  const errorId = useId();
  // sequence が変わるたびに一度空にして入れ直し、同じエラーが続いても読み上げさせる（L-153・L-166）
  const shownError = useReannouncedNotice(inputError.sequence, inputError.message);
  const hasError = inputError.message !== null;
  const describedBy = hasError ? `${descriptionId} ${errorId}` : descriptionId;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onTextChange(event.target.value);
  };

  // 確定は「プレビュー」の1か所だけで行い、blur では確定しない（L-473）
  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        箇条書きのテキスト
      </h2>
      <p id={descriptionId} className="text-sm">
        {DESCRIPTION}
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={textareaId} className="text-sm font-medium">
          テキスト
        </label>
        {/* 貼り付けた内容を黙って切り詰めないよう maxLength を付けない（L-057） */}
        <textarea
          ref={textareaRef}
          id={textareaId}
          rows={12}
          spellCheck={false}
          value={text}
          aria-invalid={hasError ? "true" : undefined}
          aria-describedby={describedBy}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          onChange={handleChange}
          onKeyDown={handleTextareaKeyDown}
        />
        {/* 最初から常設し、文言だけを差し替える（L-153） */}
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className="text-sm break-words text-red-700 [overflow-wrap:anywhere] dark:text-red-300"
        >
          {shownError}
        </p>
        {/* 入力のたびに変わるので、ライブリージョンの外に出し、1文字ごとに読み上げさせない */}
        {isOutlineTextLengthTooLong(textLength) && (
          <p className="text-sm">{formatOutlineCurrentLength(textLength)}</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClassName} onClick={onCancel}>
          キャンセル
        </button>
        <button
          type="button"
          className={buttonClassName}
          onClick={onPreview}
          onKeyDown={handlePreviewKeyDown}
        >
          プレビュー
        </button>
      </div>
    </div>
  );
}
