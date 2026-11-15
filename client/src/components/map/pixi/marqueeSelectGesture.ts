import type { Point } from "@/components/map/mapGeometry";
import { createDragActivation } from "@/components/map/pixi/dragActivation";
import type {
  LatestValue,
  PointerGesture,
  PointerSample,
} from "@/components/map/pixi/pointerGesture";
import { hasFinitePointerCoordinates } from "@/components/map/pixi/pointerSample";
import type { Node } from "@/types/node";

export type MarqueeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MarqueeSelectionMode = "replace" | "add";

type MarqueeSelectGestureOptions = {
  startSample: PointerSample;
  nodesRef: LatestValue<readonly Node[]>;
  visibleNodeIdsRef?: LatestValue<ReadonlySet<number>>;
  onMarqueeRectChangeRef: LatestValue<(rect: MarqueeRect | null) => void>;
  onSetSelectionFromMarqueeRef: LatestValue<(args: {
    mode: MarqueeSelectionMode;
    ids: readonly number[];
  }) => void>;
  mode: MarqueeSelectionMode;
  dragThreshold: number;
};

export function buildMarqueeRect(a: Point, b: Point): MarqueeRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function nodeIntersectsMarquee(node: Node, rect: MarqueeRect): boolean {
  return rect.x < node.x + node.width
    && rect.x + rect.width > node.x
    && rect.y < node.y + node.height
    && rect.y + rect.height > node.y;
}

/** 表示中ノードのうち外接矩形が交差するものを、ノード配列順の ID で返す */
export function collectMarqueeSelectionIds(
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number> | undefined,
  rect: MarqueeRect,
): number[] {
  return nodes
    .filter((node) => {
      if (visibleNodeIds !== undefined && !visibleNodeIds.has(node.id)) return false;
      return nodeIntersectsMarquee(node, rect);
    })
    .map((node) => node.id);
}

export function createMarqueeSelectGesture({
  startSample,
  nodesRef,
  visibleNodeIdsRef,
  onMarqueeRectChangeRef,
  onSetSelectionFromMarqueeRef,
  mode,
  dragThreshold,
}: MarqueeSelectGestureOptions): PointerGesture | null {
  if (!hasFinitePointerCoordinates(startSample)) return null;

  const dragActivation = createDragActivation(startSample.screen, dragThreshold);
  let activated = false;
  let finished = false;
  let currentRect: MarqueeRect | null = null;

  const clearRect = () => {
    if (currentRect === null && !activated) return;
    currentRect = null;
    onMarqueeRectChangeRef.current(null);
  };

  const publishRect = (sample: PointerSample) => {
    const next = buildMarqueeRect(startSample.world, sample.world);
    currentRect = next;
    onMarqueeRectChangeRef.current(next);
  };

  return {
    move(sample) {
      if (finished || !hasFinitePointerCoordinates(sample)) return;
      if (!activated) {
        if (!dragActivation.update(sample.screen)) return;
        activated = true;
      }
      publishRect(sample);
    },
    end(sample) {
      if (finished) return;
      finished = true;
      if (!activated) return;
      const rect = hasFinitePointerCoordinates(sample)
        ? buildMarqueeRect(startSample.world, sample.world)
        : currentRect;
      const ids = rect === null
        ? []
        : collectMarqueeSelectionIds(
          nodesRef.current,
          visibleNodeIdsRef?.current,
          rect,
        );
      clearRect();
      onSetSelectionFromMarqueeRef.current({ mode, ids });
    },
    cancel() {
      if (finished) return;
      finished = true;
      if (!activated) return;
      clearRect();
    },
    isActivated: () => activated,
  };
}
