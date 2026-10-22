import type { KeyboardEvent, MouseEvent, Ref } from "react";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";

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
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

const dangerButtonClassName = "shrink-0 rounded-md border border-red-600 px-3 py-1 text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-red-400 dark:text-red-400 dark:hover:bg-zinc-700";

// 一覧の「削除」の押し続け・ダブルクリックの続きの入力で、確認を飛ばさない（L-408）
function handleConfirmKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

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
}: MapLibraryDeleteConfirmProps) {
  const handleConfirmClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return;
    onConfirm();
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        マップを削除
      </h2>
      <div id={descriptionId} className="flex flex-col gap-1 text-sm break-words [overflow-wrap:anywhere]">
        <p>マップ「{target.name}」を削除します。削除したマップは元に戻せません。</p>
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
      <div className="flex justify-end gap-2">
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
          onClick={handleConfirmClick}
          onKeyDown={handleConfirmKeyDown}
        >
          このマップを削除
        </button>
      </div>
    </div>
  );
}
