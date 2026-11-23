"use client";

import { useId, useState, type FormEvent } from "react";
import { resolveNodeIconDraft } from "@/domain/nodes/nodeIcon";
import type { NodeKind } from "@/types/nodeKind";

export type NodeAppearanceSectionProps = {
  visible: boolean;
  disabled: boolean;
  icon: string | undefined;
  kind: NodeKind | undefined;
  onIconChange: (icon: string | undefined) => void;
  onKindChange: (kind: NodeKind | undefined) => void;
  iconError?: string | null;
};

const KIND_OPTIONS: ReadonlyArray<{ value: NodeKind | undefined; label: string }> = [
  { value: undefined, label: "なし" },
  { value: "question", label: "疑問" },
  { value: "conclusion", label: "結論" },
  { value: "evidence", label: "根拠" },
  { value: "idea", label: "アイデア" },
];

/** よく使う絵文字チップ（いずれも Extended_Pictographic 1 書記素） */
export const NODE_APPEARANCE_ICON_CHIPS = ["💡", "🔥", "✅", "❓", "⭐", "📌"] as const;

const ICON_ERROR_MESSAGE = "絵文字を1つだけ入力してください";

const chipClassName =
  "rounded-md border border-zinc-200 px-2 py-1 text-sm transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-700";
const buttonClassName =
  "rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

// 右パネルの「見た目」節。主選択ちょうど1・マップ・非保護のときだけ親が visible にする。
// 不正な icon 入力はエラー表示のみで文書へ反映しない（L-836）
export function NodeAppearanceSection({
  visible,
  disabled,
  icon,
  kind,
  onIconChange,
  onKindChange,
  iconError = null,
}: NodeAppearanceSectionProps) {
  const headingId = useId();
  const iconInputId = useId();
  const kindGroupId = useId();
  const errorId = useId();
  const [draftIcon, setDraftIcon] = useState(icon ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [seenIcon, setSeenIcon] = useState(icon);

  if (icon !== seenIcon) {
    setSeenIcon(icon);
    setDraftIcon(icon ?? "");
    setLocalError(null);
  }

  if (!visible) return null;

  const displayedError = iconError ?? localError;

  const applyDraftIcon = () => {
    const resolved = resolveNodeIconDraft(draftIcon);
    if (!resolved.ok) {
      setLocalError(ICON_ERROR_MESSAGE);
      return;
    }
    setLocalError(null);
    onIconChange(resolved.icon);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    applyDraftIcon();
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        見た目
      </h2>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">アイコン</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="よく使うアイコン">
          {NODE_APPEARANCE_ICON_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              aria-label={`アイコン ${chip}`}
              disabled={disabled}
              className={chipClassName}
              onClick={() => {
                setDraftIcon(chip);
                setLocalError(null);
                onIconChange(chip);
              }}
            >
              <span aria-hidden="true">{chip}</span>
            </button>
          ))}
        </div>
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-1">
          <label htmlFor={iconInputId} className="sr-only">
            アイコン
          </label>
          <div className="flex flex-wrap gap-1">
            <input
              id={iconInputId}
              type="text"
              value={draftIcon}
              disabled={disabled}
              aria-invalid={displayedError !== null}
              aria-describedby={displayedError !== null ? errorId : undefined}
              onChange={(event) => {
                setDraftIcon(event.target.value);
                if (localError !== null) setLocalError(null);
              }}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
            />
            <button type="submit" disabled={disabled} className={buttonClassName}>
              アイコンを設定
            </button>
            <button
              type="button"
              disabled={disabled}
              className={buttonClassName}
              onClick={() => {
                setDraftIcon("");
                setLocalError(null);
                onIconChange(undefined);
              }}
            >
              アイコンをクリア
            </button>
          </div>
          {displayedError !== null && displayedError !== "" ? (
            <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
              {displayedError}
            </p>
          ) : null}
        </form>
      </div>

      <fieldset className="flex flex-col gap-1 border-0 p-0">
        <legend id={kindGroupId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          種別
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={kindGroupId}
          className="flex flex-wrap gap-1"
        >
          {KIND_OPTIONS.map(({ value, label }) => {
            const checked = kind === value;
            return (
              <label
                key={label}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm ${
                  checked
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name={kindGroupId}
                  value={value ?? ""}
                  checked={checked}
                  disabled={disabled}
                  className="sr-only"
                  onChange={() => onKindChange(value)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
