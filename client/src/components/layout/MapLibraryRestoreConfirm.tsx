import type { Ref } from "react";
import { MapLibraryConfirmActions } from "@/components/layout/MapLibraryConfirmActions";
import type { LibraryRestorePreview } from "@/hooks/mapLibraryState";

type Props = {
  headingId: string;
  descriptionId: string;
  preview: LibraryRestorePreview;
  cancelButtonRef: Ref<HTMLButtonElement>;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MapLibraryRestoreConfirm({ headingId, descriptionId, preview, cancelButtonRef, onConfirm, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">復元を確認</h2>
      <div id={descriptionId} className="flex flex-col gap-2 text-sm">
        <p>バックアップの {preview.backup.maps.length}件のマップを新しい ID で追加します。</p>
        <ul aria-label="追加するマップ">{preview.backup.maps.map((map) => <li key={map.id}>{map.name}</li>)}</ul>
        <p>既存のマップと現在のマップはそのまま保持します。</p>
      </div>
      <MapLibraryConfirmActions cancelButtonRef={cancelButtonRef} confirmText="マップを追加" onConfirm={onConfirm} onCancel={onCancel} />
    </div>
  );
}
