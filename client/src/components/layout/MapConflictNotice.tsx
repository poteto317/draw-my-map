import type { ConflictState } from "@/domain/mapLibrary/mapConflict";
import {
  CONFLICT_NOTICE_MESSAGE,
  EXTERNALLY_DELETED_NOTICE_MESSAGE,
  EXTERNAL_UPDATE_NOTICE_MESSAGE,
  EXPORT_JSON_BUTTON_LABEL,
  RELOAD_EXTERNAL_BUTTON_LABEL,
  RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL,
  SAVE_AS_COPY_BUTTON_LABEL,
} from "@/domain/mapLibrary/mapConflictMessages";

export interface MapConflictNoticeProps {
  conflictState: ConflictState;
  onSaveAsCopy?: () => void;
  onReloadExternal?: () => void;
  onExportJson?: () => void;
}

const buttonBaseClass =
  "shrink-0 rounded border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const secondaryButtonClass =
  `${buttonBaseClass} border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700`;
const primaryButtonClass =
  `${buttonBaseClass} border-transparent bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600`;
const warningButtonClass =
  `${buttonBaseClass} border-transparent bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600`;

export function MapConflictNotice({
  conflictState,
  onSaveAsCopy,
  onReloadExternal,
  onExportJson,
}: MapConflictNoticeProps) {
  const isConflict = conflictState === "conflict";
  const isDeleted = conflictState === "externallyDeleted";
  const isUpdate = conflictState === "externalUpdate";

  const message = isConflict
    ? CONFLICT_NOTICE_MESSAGE
    : isDeleted
      ? EXTERNALLY_DELETED_NOTICE_MESSAGE
      : isUpdate
        ? EXTERNAL_UPDATE_NOTICE_MESSAGE
        : "";

  const bannerColorClass = isDeleted
    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
    : isConflict
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
      : "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200";

  return (
    <div className="w-full">
      {/* L-153: 常設ライブリージョン。同一 DOM ノードを常設しテキストのみ動的更新 */}
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {message}
      </div>
      {conflictState !== "none" && (
        <div
          data-testid="map-conflict-notice"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2 text-sm ${bannerColorClass}`}
        >
          <p aria-hidden="true" className="font-medium">
            {message}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(isConflict || isDeleted) && onSaveAsCopy && (
              <button
                type="button"
                onClick={onSaveAsCopy}
                className={primaryButtonClass}
              >
                {SAVE_AS_COPY_BUTTON_LABEL}
              </button>
            )}
            {isConflict && onReloadExternal && (
              <button
                type="button"
                onClick={onReloadExternal}
                className={warningButtonClass}
              >
                {RELOAD_EXTERNAL_BUTTON_LABEL}
              </button>
            )}
            {isUpdate && onReloadExternal && (
              <button
                type="button"
                onClick={onReloadExternal}
                className={primaryButtonClass}
              >
                {RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL}
              </button>
            )}
            {(isConflict || isDeleted) && onExportJson && (
              <button
                type="button"
                onClick={onExportJson}
                className={secondaryButtonClass}
              >
                {EXPORT_JSON_BUTTON_LABEL}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
