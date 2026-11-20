"use client";

import { suppressBackupRestoreActionKey } from "@/components/layout/suppressBackupRestoreActionKey";
import type { MapLibraryMetaStatus } from "@/domain/mapLibrary/mapLibraryMeta";

type MapLibraryMetaStatusNoticeProps = {
  status: MapLibraryMetaStatus;
  buttonClassName: string;
  onReset: () => void;
};

// お気に入り・フォルダー情報（ライブラリーメタデータ）を使えないときの案内。ready では何も出さない
export function MapLibraryMetaStatusNotice({
  status,
  buttonClassName,
  onReset,
}: MapLibraryMetaStatusNoticeProps) {
  if (status === "corrupt") {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200"
      >
        <p>
          お気に入り・フォルダー情報が破損しているため読み込めませんでした。初期化すると回復できます（マップ本体は影響を受けません）。
        </p>
        <div>
          <button
            type="button"
            className={buttonClassName}
            onKeyDown={suppressBackupRestoreActionKey}
            onClick={(event) => {
              if (event.detail > 1) return;
              onReset();
            }}
          >
            メタデータを初期化
          </button>
        </div>
      </div>
    );
  }
  if (status === "unavailable") {
    return (
      <p
        role="alert"
        className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      >
        お気に入り・フォルダー情報を読み込めませんでした。再読み込みして再試行してください。
      </p>
    );
  }
  return null;
}
