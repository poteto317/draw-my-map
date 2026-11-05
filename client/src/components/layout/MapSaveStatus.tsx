import type { MapSaveStatus as SaveStatus } from "@/domain/persistence/mapSaveStatus";

const LABELS: Record<SaveStatus, string> = {
  checking: "保存状態を確認中",
  saved: "保存済み",
  beforeSave: "保存前",
  restoreFailed: "復元できませんでした",
  pending: "保存待ち",
  failed: "保存失敗",
  protected: "ブラウザへ保存できません",
};

export function MapSaveStatus({ status }: { status: SaveStatus }) {
  const label = LABELS[status];
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`保存状態: ${label}`}
      className="shrink-0 text-sm text-zinc-600 dark:text-zinc-300"
    >
      {label}
    </span>
  );
}
