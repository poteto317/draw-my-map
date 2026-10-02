import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { IllustrationGenerationState } from "@/hooks/useIllustrationGeneration";
import type { Node } from "@/types/node";

type IllustrationPanelProps = {
  selectedNode: Pick<Node, "id" | "label"> | null;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
};

export function IllustrationPanel({ selectedNode, generation, onGenerate }: IllustrationPanelProps) {
  // 生成は同時に1件までなので、どのノードの生成中でもボタンを無効にする
  const isGenerating = generation.status === "generating";
  const forSelectedNode =
    selectedNode !== null && generation.status !== "idle" && generation.nodeId === selectedNode.id;
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
            title={selectedNode.label || undefined}
          >
            {getNodeDisplayLabel(selectedNode.label)}
          </p>
        </div>
      )}
      {selectedNode !== null && forSelectedNode && generation.status === "generating" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">生成中です</p>
      )}
      {selectedNode !== null && forSelectedNode && generation.status === "succeeded" && (
        // eslint-disable-next-line @next/next/no-img-element -- data URLのため、next/imageは使わない
        <img
          src={generation.dataUrl}
          alt={`${getNodeDisplayLabel(selectedNode.label)}のイラスト`}
          className="w-full rounded-md border border-zinc-200 dark:border-zinc-700"
        />
      )}
      {forSelectedNode && generation.status === "failed" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {generation.message}
        </p>
      )}
      <button
        type="button"
        disabled={selectedNode === null || isGenerating}
        onClick={() => {
          if (selectedNode !== null) onGenerate(selectedNode.id);
        }}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
      >
        {isGenerating ? "生成中…" : "イラストを生成"}
      </button>
    </aside>
  );
}
