"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { normalizeShareCommentBody } from "@/domain/share/normalizeShareCommentBody";
import { SHARE_COMMENT_BODY_MAX_LENGTH } from "@/domain/share/shareCommentLimits";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import type { ShareResult } from "@/domain/share/shareResult";

export type ShareCommentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** 成功したら呼び出し元が value を空にする */
  onSubmit: (body: string) => Promise<ShareResult<unknown>>;
  submitLabel: string;
  /** busy・ログイン前など */
  disabled: boolean;
  ariaLabel: string;
};

const textareaClassName = "min-h-20 w-full rounded border border-zinc-300 bg-white p-2 text-sm disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900";
const submitButtonClassName = "shrink-0 rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * コメント本文の入力欄（制御コンポーネント。所有者ダイアログと閲覧パネルで共用）。
 * 送信は「送信」ボタンと Ctrl/Cmd+Enter。IME 変換中は送らない（L-474）。二重送信は同期フラグで止める（L-653）。
 */
export function ShareCommentComposer({
  value,
  onChange,
  onSubmit,
  submitLabel,
  disabled,
  ariaLabel,
}: ShareCommentComposerProps) {
  const remainingId = useId();
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 失敗時に textarea へ戻す要求。呼び出し元の busy（disabled）が解けた描画で処理する */
  const restoreFocusRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!restoreFocusRef.current || textarea === null || textarea.disabled) return;
    restoreFocusRef.current = false;
    textarea.focus();
  }, [disabled, submitting]);
  const normalized = normalizeShareCommentBody(value);
  // 超過分は正規化結果から長さを得られないため 0 と aria-invalid で示す（送信ボタンは無効）
  const remaining = normalized.ok
    ? SHARE_COMMENT_BODY_MAX_LENGTH - normalized.value.length
    : normalized.reason === "empty"
      ? SHARE_COMMENT_BODY_MAX_LENGTH
      : 0;
  const tooLong = !normalized.ok && normalized.reason === "too-long";
  const submitDisabled = disabled || submitting || !normalized.ok;

  const submit = async () => {
    if (disabled || submittingRef.current || !normalized.ok) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // 成功時の入力のクリアは呼び出し元が行う。失敗時は入力を残す（L-001）
      const result = await onSubmit(normalized.value);
      if (!result.ok) restoreFocusRef.current = true;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className={textareaClassName}
        ref={textareaRef}
        value={value}
        disabled={disabled}
        // 送信中に打った文字が成功時のクリアで消えないよう、編集だけ止める
        readOnly={submitting}
        aria-label={ariaLabel}
        aria-describedby={remainingId}
        aria-invalid={tooLong}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center justify-between gap-2">
        <span
          id={remainingId}
          className={tooLong ? "text-xs text-red-700 dark:text-red-300" : "text-xs text-zinc-600 dark:text-zinc-400"}
        >
          {`${SHARE_COMMENT_MESSAGES.remaining} ${remaining}`}
        </span>
        <button
          type="button"
          className={submitButtonClassName}
          disabled={submitDisabled}
          onClick={() => {
            void submit();
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
