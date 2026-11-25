"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { MapTour, MapTourStep } from "@/types/mapTour";

export type PresentationScreen = "closed" | "playing";

export type ApplyMapView = (
  snapshot: MapViewSnapshot,
  beforeChange?: (before: MapViewSnapshot) => void,
) => boolean;

export type UsePresentationPlaybackOptions = {
  tour: MapTour | undefined;
  startBlocked: boolean;
  captureView: () => MapViewSnapshot;
  applyView: ApplyMapView;
};

export type UsePresentationPlaybackReturn = {
  screen: PresentationScreen;
  stepIndex: number;
  stepCount: number;
  currentStep: MapTourStep | undefined;
  canStart: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  start: () => boolean;
  end: () => boolean;
  goBack: () => boolean;
  goForward: () => boolean;
};

export function usePresentationPlayback({
  tour,
  startBlocked,
  captureView,
  applyView,
}: UsePresentationPlaybackOptions): UsePresentationPlaybackReturn {
  const [screen, setScreen] = useState<PresentationScreen>("closed");
  const [stepIndex, setStepIndex] = useState(0);
  const baselineRef = useRef<MapViewSnapshot | null>(null);
  const playingRef = useRef(false);

  const steps = useMemo(() => tour?.steps ?? [], [tour]);
  const stepCount = steps.length;
  const canStart = !startBlocked && stepCount > 0 && screen === "closed";
  const currentStep = screen === "playing" ? steps[stepIndex] : undefined;
  const canGoBack = screen === "playing" && stepIndex > 0;
  const canGoForward = screen === "playing" && stepIndex < stepCount - 1;

  const applyStep = useCallback((index: number) => {
    const step = steps[index];
    if (step === undefined) return false;
    return applyView(step.snapshot);
  }, [applyView, steps]);

  const start = useCallback(() => {
    if (!canStart || playingRef.current) return false;
    playingRef.current = true;
    baselineRef.current = captureView();
    if (!applyStep(0)) {
      playingRef.current = false;
      baselineRef.current = null;
      return false;
    }
    setScreen("playing");
    setStepIndex(0);
    return true;
  }, [applyStep, canStart, captureView]);

  const end = useCallback(() => {
    if (screen !== "playing") return false;
    playingRef.current = false;
    const baseline = baselineRef.current;
    baselineRef.current = null;
    setScreen("closed");
    setStepIndex(0);
    if (baseline !== null) applyView(baseline);
    return true;
  }, [applyView, screen]);

  const goBack = useCallback(() => {
    if (!canGoBack) return false;
    const nextIndex = stepIndex - 1;
    if (!applyStep(nextIndex)) return false;
    setStepIndex(nextIndex);
    return true;
  }, [applyStep, canGoBack, stepIndex]);

  const goForward = useCallback(() => {
    if (!canGoForward) return false;
    const nextIndex = stepIndex + 1;
    if (!applyStep(nextIndex)) return false;
    setStepIndex(nextIndex);
    return true;
  }, [applyStep, canGoForward, stepIndex]);

  /* eslint-disable react-hooks/set-state-in-effect -- tour.steps の外部更新に追従して index をクランプまたは終了 */
  useEffect(() => {
    if (screen !== "playing") return;
    if (stepCount === 0) {
      playingRef.current = false;
      const baseline = baselineRef.current;
      baselineRef.current = null;
      setScreen("closed");
      setStepIndex(0);
      if (baseline !== null) applyView(baseline);
      return;
    }
    if (stepIndex >= stepCount) {
      const clamped = stepCount - 1;
      if (applyStep(clamped)) setStepIndex(clamped);
    }
  }, [screen, stepCount, stepIndex, applyStep, applyView]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    screen,
    stepIndex,
    stepCount,
    currentStep,
    canStart,
    canGoBack,
    canGoForward,
    start,
    end,
    goBack,
    goForward,
  };
}