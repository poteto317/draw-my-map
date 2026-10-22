import type { OutlineParentCandidate } from "@/components/layout/OutlineImportPreviewScreen";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { Node } from "@/types/node";

const OUTLINE_PARENT_LABEL_MAX_CODE_POINTS = 40;

// 開いた時点で控えた親の候補を、今のマップから表示用に引く
export function resolveOutlineParentCandidate(
  nodes: readonly Node[],
  parentCandidateId: number | null,
  parentCandidateStale: boolean,
): OutlineParentCandidate {
  if (parentCandidateId === null) return { kind: "none" };
  // マップが置き換わった後は、同じ ID のノードがあっても別のノードとして扱う（L-037）
  if (parentCandidateStale) return { kind: "missing" };
  const node = nodes.find((candidate) => candidate.id === parentCandidateId);
  if (node === undefined) return { kind: "missing" };
  const label = Array.from(getNodeDisplayLabel(node.label))
    .slice(0, OUTLINE_PARENT_LABEL_MAX_CODE_POINTS)
    .join("");
  return { kind: "found", label };
}
