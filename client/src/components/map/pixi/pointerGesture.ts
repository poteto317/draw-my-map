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
};
