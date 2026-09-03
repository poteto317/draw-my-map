import type { FederatedPointerEvent } from "pixi.js";

export type LatestValue<T> = {
  readonly current: T;
};

export type PointerGesture = {
  move: (event: FederatedPointerEvent) => void;
  end: (event: FederatedPointerEvent) => void;
  cancel: () => void;
};
