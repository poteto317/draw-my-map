"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  createBrowserFrameScheduler,
  subscribeReducedMotion,
} from "@/components/map/browserMapVisibilityEnvironment";
import { createMapVisibilityAnimator } from "@/components/map/pixi/mapVisibilityAnimator";
import { collectVisibleMapKeys } from "@/components/map/pixi/mapVisibilityKeys";
import type { RenderedMapScene } from "@/components/map/pixi/renderMapScene";
import type { Node } from "@/types/node";

type UseMapVisibilityTransitionOptions = {
  scene: RenderedMapScene | null;
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  reducedMotionQuery?: string;
  animatorFactory?: typeof createMapVisibilityAnimator;
};

const DEFAULT_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useMapVisibilityTransition({
  scene,
  nodes,
  visibleNodeIds,
  reducedMotionQuery = DEFAULT_REDUCED_MOTION_QUERY,
  animatorFactory = createMapVisibilityAnimator,
}: UseMapVisibilityTransitionOptions) {
  const reducedMotionRef = useRef(false);
  const animatorRef = useRef<ReturnType<typeof createMapVisibilityAnimator> | null>(null);
  const animatorFactoryRef = useRef(animatorFactory);
  const visibleKeys = useMemo(
    () => collectVisibleMapKeys(nodes, visibleNodeIds),
    [nodes, visibleNodeIds],
  );
  const visibleKeysRef = useRef(visibleKeys);

  useLayoutEffect(() => {
    visibleKeysRef.current = visibleKeys;
  }, [visibleKeys]);

  useEffect(() => {
    const scheduler = createBrowserFrameScheduler(window, performance);
    animatorRef.current = animatorFactoryRef.current({
      ...scheduler,
      reducedMotion: () => reducedMotionRef.current,
    });

    return () => {
      animatorRef.current?.dispose();
      animatorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const subscription = subscribeReducedMotion(window, reducedMotionQuery, (matches) => {
      reducedMotionRef.current = matches;
      animatorRef.current?.setVisibleKeys(visibleKeysRef.current);
    });
    reducedMotionRef.current = subscription.matches;
    animatorRef.current?.setVisibleKeys(visibleKeysRef.current);

    return subscription.unsubscribe;
  }, [reducedMotionQuery]);

  useEffect(() => {
    const animator = animatorRef.current;
    animator?.replaceTargets(scene ? [...scene.visibilityTargets.values()] : []);
    animator?.setVisibleKeys(visibleKeysRef.current);
  }, [scene]);

  useEffect(() => {
    animatorRef.current?.setVisibleKeys(visibleKeys);
  }, [visibleKeys]);
}
