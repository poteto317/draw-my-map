"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { MAP_GROUP_LABEL_MAX_CODEPOINTS } from "@/types/mapGroup";

export type GroupDetailSectionProps = {
  visible: boolean;
  disabled: boolean;
  label: string;
  onLabelChange: (label: string) => void;
};

function limitGroupLabelCodepoints(value: string): string {
  // UTF-16 単位が上限以下ならコードポイントも必ず収まる
  if (value.length <= MAP_GROUP_LABEL_MAX_CODEPOINTS) return value;
  const codePoints = Array.from(value);
  if (codePoints.length <= MAP_GROUP_LABEL_MAX_CODEPOINTS) return value;
  return codePoints.slice(0, MAP_GROUP_LABEL_MAX_CODEPOINTS).join("");
}

// 右パネルの「グループ」節。グループ選択時だけ親が visible にする（設計 §6 N10）
// ラベルは下書きを持ち、blur / Enter で確定（打鍵ごとに履歴を積まない）
export function GroupDetailSection({
  visible,
  disabled,
  label,
  onLabelChange,
}: GroupDetailSectionProps) {
  const headingId = useId();
  const labelId = useId();
  const [draft, setDraft] = useState(label);
  const [seenLabel, setSeenLabel] = useState(label);
  // Enter 確定の直後に届く blur で二重確定しない（NodeLabelEditor と同型）
  const actionHandledRef = useRef(false);

  if (label !== seenLabel) {
    setSeenLabel(label);
    setDraft(label);
  }

  if (!visible) return null;

  const commit = () => {
    const next = limitGroupLabelCodepoints(draft);
    if (next !== draft) setDraft(next);
    if (next === label) return;
    onLabelChange(next);
  };

  const handleBlur = () => {
    if (actionHandledRef.current) return;
    actionHandledRef.current = true;
    commit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 押し続け Enter で確定が連発しないようにする（NodeLabelEditor と同型）
    if (event.key === "Enter" && event.repeat) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (actionHandledRef.current) return;
      actionHandledRef.current = true;
      commit();
      event.currentTarget.blur();
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        グループ
      </h2>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={labelId}
          className={`text-xs font-medium text-zinc-700 dark:text-zinc-300 ${
            disabled ? "opacity-50" : ""
          }`}
        >
          ラベル
        </label>
        <input
          id={labelId}
          type="text"
          value={draft}
          disabled={disabled}
          placeholder="グループ"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          onFocus={() => {
            actionHandledRef.current = false;
          }}
          onChange={(event) => {
            actionHandledRef.current = false;
            setDraft(limitGroupLabelCodepoints(event.target.value));
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </div>
    </section>
  );
}
