import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import { getIllustrationActionLabel } from "@/domain/illustration/illustrationActionLabel";
import type { Node } from "@/types/node";

export type IllustrationPanelView = {
  // 生成ボタンの無効化。生成は同時に1件までなので、どのノードの生成中でも true
  isGenerating: boolean;
  // 選択ノードの生成中表示
  status: "generating" | null;
  // 生成結果のプレビューを優先し、無ければ設定済みのイラストを出す
  image: { kind: "preview"; dataUrl: string } | { kind: "attached"; dataUrl: string } | null;
  errorMessage: string | null;
  // 生成ボタンのラベル。すでにイラストがあるノードでは「再生成」
  generateLabel: string;
  // 「イラストを削除」を出すか（選択ノードにイラストがあるとき）
  canRemove: boolean;
};

export function getIllustrationPanelView(
  selectedNode: Pick<Node, "id" | "label" | "illustration"> | null,
  generation: IllustrationGenerationState,
): IllustrationPanelView {
  const forSelectedNode =
    selectedNode !== null && generation.status !== "idle" && generation.nodeId === selectedNode.id;

  let image: IllustrationPanelView["image"] = null;
  // 生成後にノードのテキストが変わったら、そのプレビューは今のテキストのものではないので出さない
  if (forSelectedNode && generation.status === "succeeded" && generation.label === selectedNode.label) {
    image = { kind: "preview", dataUrl: generation.dataUrl };
  } else if (selectedNode?.illustration !== undefined) {
    image = { kind: "attached", dataUrl: selectedNode.illustration };
  }

  const hasIllustration = selectedNode?.illustration !== undefined;

  return {
    isGenerating: generation.status === "generating",
    status: forSelectedNode && generation.status === "generating" ? "generating" : null,
    image,
    errorMessage: forSelectedNode && generation.status === "failed" ? generation.message : null,
    generateLabel: getIllustrationActionLabel(hasIllustration),
    canRemove: hasIllustration,
  };
}
