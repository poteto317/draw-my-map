"use client";

import type { Ref } from "react";
import { MapLibraryConfirmActions } from "@/components/layout/MapLibraryConfirmActions";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";

type MapLibraryTrashPermanentDeleteConfirmProps = {
  headingId: string;
  descriptionId: string;
  target: MapTrashEntry;
  cancelButtonRef: Ref<HTMLButtonElement>;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MapLibraryTrashPermanentDeleteConfirm({
  headingId,
  descriptionId,
  target,
  cancelButtonRef,
  onConfirm,
  onCancel,
}: MapLibraryTrashPermanentDeleteConfirmProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        完全に削除
      </h2>
      <div id={descriptionId} className="flex flex-col gap-1 text-sm break-words [overflow-wrap:anywhere]">
        <p>ゴミ箱からマップ「{target.name}」を完全に削除します。この操作は元に戻せません。</p>
      </div>
      <MapLibraryConfirmActions
        cancelButtonRef={cancelButtonRef}
        confirmText="完全に削除"
        confirmVariant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}
