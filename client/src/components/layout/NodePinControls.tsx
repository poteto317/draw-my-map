"use client";

import { preventRepeatedEnterClick } from "@/components/layout/repeatedEnterClick";
import type { NodePin } from "@/domain/pins/pinsModel";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { Node } from "@/types/node";

export type NodePinControlsProps = {
  pins: readonly NodePin[];
  nodes: readonly Node[];
  canRegister: boolean;
  onRegister: () => void;
  onJump: (nodeId: number) => void;
  onDelete: (nodeId: number) => void;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700";

function labelForPin(nodes: readonly Node[], nodeId: number): string {
  const node = nodes.find((entry) => entry.id === nodeId);
  return node === undefined ? `ノード ${nodeId}` : getNodeDisplayLabel(node.label);
}

export function NodePinControls({
  pins,
  nodes,
  canRegister,
  onRegister,
  onJump,
  onDelete,
}: NodePinControlsProps) {
  return (
    <div
      role="group"
      aria-label="ノードピン"
      className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200"
    >
      <button
        className={buttonClassName}
        type="button"
        disabled={!canRegister}
        onClick={onRegister}
        onKeyDown={preventRepeatedEnterClick}
      >
        ピン
      </button>
      {pins.length > 0 && (
        <ul
          aria-label="保存したノードピン"
          className="flex min-w-0 max-w-full gap-2 overflow-x-auto p-1 whitespace-nowrap"
        >
          {pins.map((pin) => {
            const label = labelForPin(nodes, pin.nodeId);
            return (
              <li key={pin.nodeId} className="flex shrink-0 items-center gap-1">
                <button
                  className={`${buttonClassName} max-w-48 truncate`}
                  type="button"
                  title={label}
                  aria-label={`${label}へジャンプ`}
                  onClick={() => onJump(pin.nodeId)}
                  onKeyDown={preventRepeatedEnterClick}
                >
                  {label}
                </button>
                <button
                  className={buttonClassName}
                  type="button"
                  aria-label={`${label}のピンを削除`}
                  onClick={() => onDelete(pin.nodeId)}
                  onKeyDown={preventRepeatedEnterClick}
                >
                  削除
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
