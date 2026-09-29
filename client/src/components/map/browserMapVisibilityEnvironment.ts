type FrameCallback = (time: number) => void;

type FrameSchedulerBrowser = {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (id: number) => void;
};

type FrameClock = {
  now: () => number;
};

type ReducedMotionBrowser = {
  matchMedia?: (query: string) => MediaQueryList;
};

export function createBrowserFrameScheduler(
  browser: FrameSchedulerBrowser,
  clock: FrameClock,
) {
  const usesAnimationFrame = typeof browser.requestAnimationFrame === "function"
    && typeof browser.cancelAnimationFrame === "function";

  if (usesAnimationFrame) {
    return {
      now: () => clock.now(),
      requestFrame: (callback: FrameCallback) => browser.requestAnimationFrame!(callback),
      cancelFrame: (id: number) => browser.cancelAnimationFrame!(id),
    };
  }

  return {
    now: () => clock.now(),
    requestFrame: (callback: FrameCallback) => browser.setTimeout(() => callback(clock.now()), 16),
    cancelFrame: (id: number) => browser.clearTimeout(id),
  };
}

export function subscribeReducedMotion(
  browser: ReducedMotionBrowser,
  query: string,
  onChange: (matches: boolean) => void,
) {
  if (typeof browser.matchMedia !== "function") {
    return {
      matches: false,
      unsubscribe: () => undefined,
    };
  }

  const media = browser.matchMedia(query);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  media.addEventListener("change", listener);

  return {
    matches: media.matches,
    unsubscribe: () => media.removeEventListener("change", listener),
  };
}
