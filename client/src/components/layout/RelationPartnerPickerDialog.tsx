"use client";

import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { listRelationPartnerCandidates } from "@/domain/map/mapRelationAvailability";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { MapRelation } from "@/types/mapRelation";
import type { Node } from "@/types/node";

export type RelationPartnerPickerDialogProps = {
  fromId: number;
  nodes: readonly Node[];
  relations: readonly MapRelation[] | undefined;
  onPick: (toId: number) => void;
  onCancel: () => void;
  onMouseClick: () => void;
};

export function RelationPartnerPickerDialog({
  fromId,
  nodes,
  relations,
  onPick,
  onCancel,
  onMouseClick,
}: RelationPartnerPickerDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });

  const candidates = useMemo(
    () => listRelationPartnerCandidates({ nodes, relations, fromId }),
    [nodes, relations, fromId],
  );

  useLayoutEffect(() => {
    const firstEnabled = listRef.current?.querySelector<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    firstEnabled?.focus();
  }, []);

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
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-hidden rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">関連線の相手を選ぶ</h2>
        <p id={descriptionId} className="text-sm text-zinc-600 dark:text-zinc-300">
          現在のマップ内の他のノードから、結ぶ相手を選びます。
        </p>
        <ul
          ref={listRef}
          className="flex max-h-80 flex-col gap-1 overflow-y-auto"
          aria-label="関連線の相手候補"
        >
          {candidates.map(({ node, enabled }) => (
            <li key={node.id}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onPick(node.id)}
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-700 dark:focus:bg-zinc-700"
              >
                {getNodeDisplayLabel(node.label)}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border px-3 py-2 text-sm"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
