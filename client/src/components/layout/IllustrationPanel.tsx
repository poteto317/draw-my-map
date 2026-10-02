import type { Node } from "@/types/node";

type IllustrationPanelProps = {
  selectedNode: Pick<Node, "id" | "label"> | null;
  onGenerate: (nodeId: number) => void;
};

export function IllustrationPanel({ selectedNode, onGenerate }: IllustrationPanelProps) {
  const label = selectedNode === null
    ? null
    : selectedNode.label === "" ? "（ラベルなし）" : selectedNode.label;

  return (
    <aside
      aria-label="イラスト"
      className="flex w-60 shrink-0 flex-col gap-3 border-l border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
    >
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">イラスト</h2>
      {selectedNode === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
          <p
            className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
            title={selectedNode.label}
          >
            {label}
          </p>
        </div>
      )}
      <button
        type="button"
        disabled={selectedNode === null}
        onClick={() => {
          if (selectedNode !== null) onGenerate(selectedNode.id);
        }}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
      >
        イラストを生成
      </button>
    </aside>
  );
}
