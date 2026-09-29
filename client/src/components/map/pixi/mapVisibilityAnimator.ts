import {
  sampleVisibilityTween,
  type VisibilityTween,
} from "@/components/map/pixi/mapVisibilityTween";

export type MapVisibilityTarget = {
  key: string;
  setOpacity: (value: number) => void;
  setInteractive: (enabled: boolean) => void;
  setRendered: (rendered: boolean) => void;
};

type FrameCallback = (time: number) => void;

type AnimatorDependencies = {
  now: () => number;
  requestFrame: (callback: FrameCallback) => number;
  cancelFrame: (id: number) => void;
  reducedMotion: () => boolean;
  durationMs?: number;
};

type VisibilityState = {
  opacity: number;
  visible: boolean;
  tween: VisibilityTween | null;
};

const DEFAULT_DURATION_MS = 160;

export function createMapVisibilityAnimator({
  now,
  requestFrame,
  cancelFrame,
  reducedMotion,
  durationMs = DEFAULT_DURATION_MS,
}: AnimatorDependencies) {
  const states = new Map<string, VisibilityState>();
  let targets = new Map<string, MapVisibilityTarget>();
  let frameId: number | null = null;
  let disposed = false;

  const sampleState = (state: VisibilityState, currentTime: number) => {
    if (state.tween === null) return { opacity: state.opacity, done: true };
    const sample = sampleVisibilityTween(state.tween, currentTime);
    state.opacity = sample.opacity;
    if (sample.done) state.tween = null;
    return sample;
  };

  const applyState = (target: MapVisibilityTarget, state: VisibilityState) => {
    target.setOpacity(state.opacity);
    target.setRendered(state.visible || state.opacity > 0);
    target.setInteractive(state.visible);
  };

  const applyFrame = () => {
    if (disposed) return;
    frameId = null;
    const currentTime = now();
    let hasActiveTween = false;
    for (const [key, target] of targets) {
      const state = states.get(key)!;
      sampleState(state, currentTime);
      target.setOpacity(state.opacity);
      target.setInteractive(state.visible);
      if (state.tween === null && !state.visible) target.setRendered(false);
      if (state.tween !== null) hasActiveTween = true;
    }
    if (hasActiveTween) scheduleFrame();
  };

  const scheduleFrame = () => {
    if (disposed || frameId !== null) return;
    frameId = requestFrame(() => applyFrame());
  };

  const cancelFrameWhenIdle = () => {
    const hasActiveTween = [...targets.keys()].some((key) => states.get(key)?.tween !== null);
    if (!hasActiveTween && frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }
  };

  const setVisibleKeys = (visibleKeys: ReadonlySet<string>) => {
    if (disposed) return;
    const currentTime = now();
    for (const [key, target] of targets) {
      const state = states.get(key)!;
      const visible = visibleKeys.has(key);
      const wasTweening = state.tween !== null;
      sampleState(state, currentTime);
      if (state.visible === visible) {
        if (reducedMotion() && wasTweening) {
          state.opacity = visible ? 1 : 0;
          state.tween = null;
          target.setOpacity(state.opacity);
          target.setRendered(visible);
          target.setInteractive(visible);
        } else if (wasTweening && state.tween === null) {
          target.setOpacity(state.opacity);
          target.setRendered(visible || state.opacity > 0);
          target.setInteractive(visible);
        }
        continue;
      }

      state.visible = visible;
      if (!visible) target.setInteractive(false);
      if (visible) {
        target.setRendered(true);
        target.setInteractive(true);
      }

      if (reducedMotion()) {
        state.opacity = visible ? 1 : 0;
        state.tween = null;
        target.setOpacity(state.opacity);
        target.setRendered(visible);
        target.setInteractive(visible);
        continue;
      }

      const targetOpacity = visible ? 1 : 0;
      if (state.opacity === targetOpacity) {
        state.tween = null;
        target.setOpacity(targetOpacity);
        target.setRendered(visible);
        target.setInteractive(visible);
        continue;
      }

      state.tween = {
        from: state.opacity,
        to: targetOpacity,
        startedAt: currentTime,
        durationMs,
      };
      target.setOpacity(state.opacity);
      scheduleFrame();
    }
    cancelFrameWhenIdle();
  };

  const replaceTargets = (nextTargets: readonly MapVisibilityTarget[]) => {
    if (disposed) return;
    targets = new Map(nextTargets.map((target) => [target.key, target]));
    const currentTime = now();
    for (const key of states.keys()) {
      if (!targets.has(key)) states.delete(key);
    }
    for (const [key, target] of targets) {
      const state = states.get(key) ?? { opacity: 0, visible: false, tween: null };
      states.set(key, state);
      sampleState(state, currentTime);
      applyState(target, state);
    }
    cancelFrameWhenIdle();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    targets.clear();
  };

  return { replaceTargets, setVisibleKeys, dispose };
}
