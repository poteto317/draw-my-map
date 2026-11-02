import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

export type NodeOnlyDeleteControlProps = { canDelete: boolean; onDelete: () => void };

export function NodeOnlyDeleteControl({ canDelete, onDelete }: NodeOnlyDeleteControlProps) {
  return (
    <button
      type="button"
      className="shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200"
      aria-label="選択中のノードだけ削除"
      title="子孫を残して、選択中のノードだけ削除"
      disabled={!canDelete}
      onClick={(event) => { if (event.detail <= 1) onDelete(); }}
      onKeyDown={preventRepeatedActivationClick}
    >
      ノードだけ削除
    </button>
  );
}
