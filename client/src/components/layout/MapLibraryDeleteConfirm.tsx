import type { MouseEvent, Ref } from "react";
import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";
import { TRASH_RETENTION_DAYS } from "@/domain/mapLibrary/mapTrash";

type MapLibraryDeleteConfirmProps = {
  headingId: string;
  descriptionId: string;
  target: MapIndexEntry;
  isCurrent: boolean;
  nextMapName: string | null; // 開いているマップで、ほかにマップがあるとき
  isLast: boolean;
  cancelButtonRef: Ref<HTMLButtonElement>;
  onConfirm: () => void;
  onCancel: () => void;
  allowPermanentDelete?: boolean;
  onConfirmPermanentDelete?: () => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

const dangerButtonClassName = "shrink-0 rounded-md border border-red-600 px-3 py-1 text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-red-400 dark:text-red-400 dark:hover:bg-zinc-700";

export function MapLibraryDeleteConfirm({
  headingId,
  descriptionId,
  target,
  isCurrent,
  nextMapName,
  isLast,
  cancelButtonRef,
  onConfirm,
  onCancel,
  allowPermanentDelete = false,
  onConfirmPermanentDelete,
}: MapLibraryDeleteConfirmProps) {
  const guardSingleClick = (handler: (() => void) | undefined) =>
    (event: MouseEvent<HTMLButtonElement>) => {
      // ダイアログのオーバーレイでも detail > 1 を止めるが、取り消せない削除なので部品単体でも確認を飛ばさない（二重の防御）
      if (event.detail > 1) return;
      handler?.();
    };

  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        マップを削除
      </h2>
      <div id={descriptionId} className="flex flex-col gap-1 text-sm break-words [overflow-wrap:anywhere]">
        <p>マップ「{target.name}」をゴミ箱に移動します。ゴミ箱から {TRASH_RETENTION_DAYS} 日間復元できます。</p>
        {isLast ? (
          <p>最後のマップのため、削除すると空の「{DEFAULT_MAP_NAME}」を作成します。</p>
        ) : (
          isCurrent &&
          nextMapName !== null && (
            <p>開いているマップです。削除すると「{nextMapName}」を開きます。</p>
          )
        )}
      </div>
      {/* フォーカスの戻り先が先頭の要素になるため、安全側の「キャンセル」を先に置く */}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          ref={cancelButtonRef}
          type="button"
          className={buttonClassName}
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button
          type="button"
          className={dangerButtonClassName}
          onClick={guardSingleClick(onConfirm)}
          onKeyDown={suppressBackupRestoreActionKey}
        >
          このマップを削除
        </button>
        {allowPermanentDelete && (
          <button
            type="button"
            className={dangerButtonClassName}
            onClick={guardSingleClick(onConfirmPermanentDelete)}
            onKeyDown={suppressBackupRestoreActionKey}
          >
            ゴミ箱に入れずに完全に削除
          </button>
        )}
      </div>
    </div>
  );
}
