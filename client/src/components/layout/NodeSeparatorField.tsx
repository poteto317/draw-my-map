"use client";

import { useId } from "react";
import type { KeyboardEvent, Ref } from "react";
import {
  NODE_SEPARATOR_CUSTOM_ID,
  NODE_SEPARATOR_CUSTOM_LABEL,
  NODE_SEPARATOR_PRESETS,
} from "@/domain/nodes/nodeSeparator";

type NodeSeparatorFieldProps = {
  // プリセットの id、または NODE_SEPARATOR_CUSTOM_ID
  preset: string;
  customSeparator: string;
  selectRef: Ref<HTMLSelectElement>;
  onPresetChange: (presetId: string) => void;
  onCustomSeparatorChange: (value: string) => void;
  // 「その他」の入力欄で、IME 変換中でもリピートでもない Enter を押したとき。確定できるかは呼び出し側が判定する
  onCustomEnter: () => void;
};

const fieldClassName = "w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900";

// 分割・統合のダイアログが共有する区切り文字の入力（プルダウン + 「その他」の入力。どちらも可視のラベルつき）
export function NodeSeparatorField({
  preset,
  customSeparator,
  selectRef,
  onPresetChange,
  onCustomSeparatorChange,
  onCustomEnter,
}: NodeSeparatorFieldProps) {
  const selectId = useId();
  const customId = useId();

  // プルダウンの Enter では確定しない（プレビューを見る前の確定を避ける）。確定は「その他」の入力欄とボタンに限る
  const handleCustomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!event.repeat) onCustomEnter();
  };

  return (
    <>
      <label htmlFor={selectId} className="text-sm">区切り文字</label>
      <select
        id={selectId}
        ref={selectRef}
        className={fieldClassName}
        value={preset}
        onChange={(event) => onPresetChange(event.target.value)}
      >
        {NODE_SEPARATOR_PRESETS.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
        <option value={NODE_SEPARATOR_CUSTOM_ID}>{NODE_SEPARATOR_CUSTOM_LABEL}</option>
      </select>
      {preset === NODE_SEPARATOR_CUSTOM_ID && (
        <>
          <label htmlFor={customId} className="text-sm">その他の区切り文字</label>
          <input
            id={customId}
            type="text"
            className={fieldClassName}
            value={customSeparator}
            onChange={(event) => onCustomSeparatorChange(event.target.value)}
            onKeyDown={handleCustomKeyDown}
          />
        </>
      )}
    </>
  );
}
