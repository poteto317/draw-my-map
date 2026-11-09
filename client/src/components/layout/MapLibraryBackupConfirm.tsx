import type { Ref } from "react";
import { MapLibraryConfirmActions } from "@/components/layout/MapLibraryConfirmActions";
import type { LibraryBackupPreview } from "@/services/persistence/libraryBackupExport";

type Props = {
  headingId: string;
  descriptionId: string;
  preview: LibraryBackupPreview;
  cancelButtonRef: Ref<HTMLButtonElement>;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MapLibraryBackupConfirm({ headingId, descriptionId, preview, cancelButtonRef, onConfirm, onCancel }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">バックアップを確認</h2>
      <div id={descriptionId} className="flex flex-col gap-2 text-sm">
        <p>全マップのバックアップをダウンロードします。</p>
        {preview.missingBodyNames.length > 0 && <p>本体がない {preview.missingBodyNames.length} 件を空のマップとして含めます: {preview.missingBodyNames.join("、")}</p>}
        {preview.orphanBodyCount > 0 && <p>一覧にない保存データ {preview.orphanBodyCount} 件は含まれません。</p>}
      </div>
      <MapLibraryConfirmActions cancelButtonRef={cancelButtonRef} confirmText="ダウンロードを開始" onConfirm={onConfirm} onCancel={onCancel} />
    </div>
  );
}
