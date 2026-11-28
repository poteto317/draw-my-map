"use client";

import { useId } from "react";
import { preventRepeatedEnterClick } from "@/components/layout/repeatedEnterClick";

type NodeCollapseControlProps = {
  selectedNodeId: number | null;
  canToggle: boolean;
  collapsed: boolean;
  hiddenCount: number;
  onToggle: (nodeId: number) => void;
  disabled?: boolean;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeCollapseControl({
  selectedNodeId,
  canToggle,
  collapsed,
  hiddenCount,
  onToggle,
  disabled: interactionDisabled = false,
}: NodeCollapseControlProps) {
  const idPrefix = useId();
  const hiddenCountId = `${idPrefix}-hidden-count`;
  const disabled = interactionDisabled || selectedNodeId === null || !canToggle;

  function handleToggle() {
    if (disabled || selectedNodeId === null || !canToggle) return;
    onToggle(selectedNodeId);
  }

  // Enterの押し続けで折りたたみと展開が交互に起きないよう、リピートのclick合成を止める（preventRepeatedEnterClick）
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-expanded={disabled ? undefined : !collapsed}
        aria-describedby={hiddenCountId}
        onClick={handleToggle}
        onKeyDown={preventRepeatedEnterClick}
      >
        {collapsed ? "枝を展開" : "枝を折りたたむ"}
      </button>
      <span id={hiddenCountId}>折りたたみで非表示: {hiddenCount}件</span>
    </div>
  );
}
