"use client";

import type { Ref } from "react";
import { MapLibraryConfirmActions } from "@/components/layout/MapLibraryConfirmActions";

type MapLibraryTrashEmptyConfirmProps = {
  headingId: string;
  descriptionId: string;
  trashStatus: "ok" | "corrupt";
  count: number;
  cancelButtonRef: Ref<HTMLButtonElement>;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MapLibraryTrashEmptyConfirm({
  headingId,
  descriptionId,
  trashStatus,
  count,
  cancelButtonRef,
  onConfirm,
  onCancel,
}: MapLibraryTrashEmptyConfirmProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        ゴミ箱を空にする
      </h2>
      <div id={descriptionId} className="flex flex-col gap-1 text-sm break-words [overflow-wrap:anywhere]">
        <p>
          {trashStatus === "corrupt"
            ? "壊れたゴミ箱の保存データをすべて削除して初期化します。この操作は元に戻せません。"
            : `ゴミ箱内の ${count} 件のマップをすべて完全に削除します。この操作は元に戻せません。`}
        </p>
      </div>
      <MapLibraryConfirmActions
        cancelButtonRef={cancelButtonRef}
        confirmText="ゴミ箱を空にする"
        confirmVariant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}
