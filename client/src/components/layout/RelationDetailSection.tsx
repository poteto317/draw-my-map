"use client";

import { useId } from "react";
import { RELATION_KIND_OPTIONS } from "@/domain/map/relationKindLabels";
import type { RelationKind } from "@/types/mapRelation";

export type RelationDetailSectionProps = {
  visible: boolean;
  disabled: boolean;
  kind: RelationKind;
  directed: boolean;
  onKindChange: (kind: RelationKind) => void;
  onDirectedChange: (directed: boolean) => void;
};

// 右パネルの「関連線」節。関連線選択時だけ親が visible にする（設計 §6 N5）
export function RelationDetailSection({
  visible,
  disabled,
  kind,
  directed,
  onKindChange,
  onDirectedChange,
}: RelationDetailSectionProps) {
  const headingId = useId();
  const kindGroupId = useId();
  const directedId = useId();

  if (!visible) return null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        関連線
      </h2>

      <fieldset className="flex flex-col gap-1 border-0 p-0">
        <legend id={kindGroupId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          意味
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={kindGroupId}
          className="flex flex-wrap gap-1"
        >
          {RELATION_KIND_OPTIONS.map(({ value, label }) => {
            const checked = kind === value;
            return (
              <label
                key={value}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm ${
                  checked
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name={kindGroupId}
                  value={value}
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

      <div className="flex items-center gap-2">
        <input
          id={directedId}
          type="checkbox"
          checked={directed}
          disabled={disabled}
          className="size-4 rounded border-zinc-300 text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => onDirectedChange(event.target.checked)}
        />
        <label
          htmlFor={directedId}
          className={`text-sm text-zinc-700 dark:text-zinc-200 ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
        >
          有向
        </label>
      </div>
    </section>
  );
}
