import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { IllustrationImage } from "@/components/layout/IllustrationImage";
import { getIllustrationPanelView } from "@/components/layout/illustrationPanelView";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";

type IllustrationPanelProps = {
  selectedNode: Pick<Node, "id" | "label" | "illustration"> | null;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
  onAttach: (nodeId: number, dataUrl: string) => void;
  onRemove: (nodeId: number) => void;
};

export function IllustrationPanel({ selectedNode, generation, onGenerate, onAttach, onRemove }: IllustrationPanelProps) {
  const view = getIllustrationPanelView(selectedNode, generation);
  const preview = view.image?.kind === "preview" ? view.image : null;
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
      {view.status === "generating" && (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">生成中です</p>
      )}
      {selectedNode !== null && preview !== null && (
        <>
          <IllustrationImage
            src={preview.dataUrl}
            alt={`${getNodeDisplayLabel(selectedNode.label)}のイラスト`}
          />
          <button
            type="button"
            onClick={() => onAttach(selectedNode.id, preview.dataUrl)}
            className="rounded-md border border-blue-600 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-zinc-700"
          >
            ノードに設定
          </button>
        </>
      )}
      {selectedNode !== null && view.image?.kind === "attached" && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">設定済みのイラスト</span>
          <IllustrationImage
            src={view.image.dataUrl}
            alt={`${getNodeDisplayLabel(selectedNode.label)}の設定済みイラスト`}
          />
        </div>
      )}
      {selectedNode !== null && view.canRemove && (
        <button
          type="button"
          onClick={() => onRemove(selectedNode.id)}
          className="rounded-md border border-red-600 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-zinc-700"
        >
          イラストを削除
        </button>
      )}
      {view.errorMessage !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {view.errorMessage}
        </p>
      )}
      <button
        type="button"
        disabled={selectedNode === null || view.isGenerating}
        onClick={() => {
          if (selectedNode !== null) onGenerate(selectedNode.id);
        }}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
      >
        {view.isGenerating ? "生成中…" : view.generateLabel}
      </button>
    </aside>
  );
}
