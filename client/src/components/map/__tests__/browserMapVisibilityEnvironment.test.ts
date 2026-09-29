import {
  createBrowserFrameScheduler,
  subscribeReducedMotion,
} from "@/components/map/browserMapVisibilityEnvironment";

type FrameBrowser = Parameters<typeof createBrowserFrameScheduler>[0];
type MediaBrowser = Parameters<typeof subscribeReducedMotion>[0];

function createFrameBrowser(overrides: Partial<FrameBrowser> = {}): FrameBrowser {
  return {
    requestAnimationFrame: jest.fn(() => 41),
    cancelAnimationFrame: jest.fn(),
    setTimeout: jest.fn(() => 42),
    clearTimeout: jest.fn(),
    ...overrides,
  };
}

describe("browserMapVisibilityEnvironment", () => {
  it("requestとcancelの両方がある場合だけRAF pairを使う", () => {
    const browser = createFrameBrowser();
    const clock = { now: jest.fn(() => 10) };
    const scheduler = createBrowserFrameScheduler(browser, clock);
    const callback = jest.fn();

    expect(scheduler.now()).toBe(10);
    expect(scheduler.requestFrame(callback)).toBe(41);
    scheduler.cancelFrame(41);

    expect(browser.requestAnimationFrame).toHaveBeenCalledWith(callback);
    expect(browser.cancelAnimationFrame).toHaveBeenCalledWith(41);
    expect(browser.setTimeout).not.toHaveBeenCalled();
  });

  it.each(["requestAnimationFrame", "cancelAnimationFrame"] as const)(
    "%sだけが欠けた場合はtimeout pairへfallbackする",
    (missingApi) => {
      const browser = createFrameBrowser({ [missingApi]: undefined });
      const clock = { now: jest.fn(() => 25) };
      const scheduler = createBrowserFrameScheduler(browser, clock);
      const callback = jest.fn();

      expect(scheduler.requestFrame(callback)).toBe(42);
      const timeoutCallback = (browser.setTimeout as jest.Mock).mock.calls[0][0];
      timeoutCallback();
      scheduler.cancelFrame(42);

      expect(callback).toHaveBeenCalledWith(25);
      if (missingApi === "requestAnimationFrame") {
        expect(browser.cancelAnimationFrame).not.toHaveBeenCalled();
      } else {
        expect(browser.requestAnimationFrame).not.toHaveBeenCalled();
      }
      expect(browser.clearTimeout).toHaveBeenCalledWith(42);
    },
  );

  it("timeout fallbackは予約時刻ではなくcallback実行時のclock値を渡す", () => {
    const browser = createFrameBrowser({ requestAnimationFrame: undefined });
    let currentTime = 10;
    const scheduler = createBrowserFrameScheduler(browser, {
      now: jest.fn(() => currentTime),
    });
    const callback = jest.fn();

    scheduler.requestFrame(callback);
    currentTime = 35;
    const timeoutCallback = (browser.setTimeout as jest.Mock).mock.calls[0][0];
    timeoutCallback();

    expect(callback).toHaveBeenCalledWith(35);
  });

  it("media queryの初期値とchangeを通知し、同じlistenerを解除する", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      matches: true,
      addEventListener: jest.fn((_type: string, value: (event: MediaQueryListEvent) => void) => {
        listener = value;
      }),
      removeEventListener: jest.fn(),
    };
    const browser = {
      matchMedia: jest.fn(() => media),
    } as unknown as MediaBrowser;
    const onChange = jest.fn();

    const subscription = subscribeReducedMotion(browser, "(reduce)", onChange);
    listener?.({ matches: false } as MediaQueryListEvent);
    subscription.unsubscribe();

    expect(subscription.matches).toBe(true);
    expect(browser.matchMedia).toHaveBeenCalledWith("(reduce)");
    expect(onChange).toHaveBeenCalledWith(false);
    expect(media.removeEventListener).toHaveBeenCalledWith(
      "change",
      media.addEventListener.mock.calls[0][1],
    );
  });

  it("matchMediaがなければ未購読のfalse subscriptionを返す", () => {
    const onChange = jest.fn();

    const subscription = subscribeReducedMotion({}, "(reduce)", onChange);
    subscription.unsubscribe();

    expect(subscription.matches).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
