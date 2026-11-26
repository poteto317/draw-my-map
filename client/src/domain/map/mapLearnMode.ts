import { MAP_LEARN_VERSION, projectLearn, type MapLearnState } from "@/types/mapLearn";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";

export const LEARN_LABEL_PLACEHOLDER = "？？？";

export type LearnLabelDisplayContext = {
  readonly learningActive: boolean;
  readonly revealedNodeIds: ReadonlySet<number>;
};

export function resolveLearnLabelDisplay(
  node: Node,
  context: LearnLabelDisplayContext,
): { text: string; realLabelForWidth: string } {
  const realLabelForWidth = getNodeDisplayLabel(node.label);
  if (!context.learningActive) {
    return { text: realLabelForWidth, realLabelForWidth };
  }
  if (context.revealedNodeIds.has(node.id)) {
    return { text: realLabelForWidth, realLabelForWidth };
  }
  return { text: LEARN_LABEL_PLACEHOLDER, realLabelForWidth };
}

export function revealNodeInLearn(state: NodeMapState, nodeId: number): MapLearnState | null {
  const revealed = state.learn?.revealedNodeIds ?? [];
  if (revealed.includes(nodeId)) return null;
  const nextRevealed = [...revealed, nodeId].sort((a, b) => a - b);
  const next: MapLearnState = {
    version: MAP_LEARN_VERSION,
    revealedNodeIds: nextRevealed,
    ...(state.learn?.cards === undefined ? {} : { cards: state.learn.cards }),
  };
  return next;
}

export function resetLearnProgressState(state: NodeMapState): MapLearnState {
  return {
    version: MAP_LEARN_VERSION,
    revealedNodeIds: [],
    ...(state.learn?.cards === undefined ? {} : { cards: state.learn.cards }),
  };
}

export function applyLearnToState(state: NodeMapState, learn: MapLearnState | undefined): NodeMapState {
  const projected = projectLearn(learn);
  if (projected.learn === undefined) {
    const next = { ...state };
    delete next.learn;
    return next;
  }
  return { ...state, learn: projected.learn };
}