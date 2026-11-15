import type { Point } from "@/components/map/mapGeometry";

export type LatestValue<T> = {
  readonly current: T;
};

export type PointerSample = {
  pointerId: number;
  pointerType: string;
  screen: Point;
  world: Point;
};

export type PointerGesture = {
  move: (sample: PointerSample) => void;
  end: (sample: PointerSample) => void;
  cancel: () => void;
  activeNodeIds?: () => readonly number[];
  /** dragActivation を一度でも超えたら true。背景解除などの判定に使う */
  isActivated?: () => boolean;
};
