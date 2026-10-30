import type { Viewport } from "@/components/map/mapViewport";
import type { Point } from "@/components/map/mapGeometry";
import {
  calculatePinchViewport,
  hasFinitePositiveDistance,
} from "@/components/map/pixi/pinchViewport";
import type {
  LatestValue,
  PointerSample,
} from "@/components/map/pixi/pointerGesture";

export type PinchZoomGesture = {
  move: (sample: PointerSample) => void;
  owns: (pointerId: number) => boolean;
  end: (pointerId: number) => boolean;
  cancel: () => void;
};

type Options = {
  first: PointerSample;
  second: PointerSample;
  startViewport: Viewport;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
};

const isSameViewport = (first: Viewport, second: Viewport): boolean => (
  first.offsetX === second.offsetX
  && first.offsetY === second.offsetY
  && first.scale === second.scale
);

export function createPinchZoomGesture(options: Options): PinchZoomGesture {
  // 2本の指の pointerId は異なる（touchGestureCoordinator が2つの別の指を揃えてから作る）
  const ids = [options.first.pointerId, options.second.pointerId] as const;
  let currentFirst: Point = { ...options.first.screen };
  let currentSecond: Point = { ...options.second.screen };
  let startFirst = { ...options.first.screen };
  let startSecond = { ...options.second.screen };
  let waitingForBaseline = !hasFinitePositiveDistance(startFirst, startSecond);
  let lastViewport = options.startViewport;
  let active = true;

  const owns = (pointerId: number) => pointerId === ids[0] || pointerId === ids[1];
  return {
    owns,
    move(sample) {
      if (!active || !owns(sample.pointerId)) return;
      if (sample.pointerId === ids[0]) currentFirst = { ...sample.screen };
      if (sample.pointerId === ids[1]) currentSecond = { ...sample.screen };
      const first = currentFirst;
      const second = currentSecond;
      if (waitingForBaseline) {
        if (!hasFinitePositiveDistance(first, second)) return;
        startFirst = { ...first };
        startSecond = { ...second };
        waitingForBaseline = false;
        return;
      }
      const viewport = calculatePinchViewport(
        options.startViewport,
        startFirst,
        startSecond,
        first,
        second,
      );
      if (!viewport || isSameViewport(viewport, lastViewport)) return;
      lastViewport = viewport;
      options.onViewportChangeRef.current(viewport);
    },
    end(pointerId) {
      if (!active || !owns(pointerId)) return false;
      active = false;
      return true;
    },
    cancel() { active = false; },
  };
}
