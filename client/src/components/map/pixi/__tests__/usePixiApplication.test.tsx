import { act, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { usePixiApplication } from "@/components/map/pixi/usePixiApplication";

type MockApplication = {
  init: jest.Mock;
  destroy: jest.Mock;
  canvas: HTMLCanvasElement;
};

const mockInit = jest.fn<Promise<void>, [unknown]>();
const mockDestroy = jest.fn();
const mockApplications: MockApplication[] = [];
const mockGraphics = jest.fn();
const mockText = jest.fn();
const mockContainer = jest.fn();
const mockSprite = jest.fn();
const mockTexture = { from: jest.fn() };

jest.mock("pixi.js", () => ({
  Application: jest.fn().mockImplementation(() => {
    const app = {
      init: mockInit,
      destroy: mockDestroy,
      canvas: document.createElement("canvas"),
    };
    mockApplications.push(app);
    return app;
  }),
  Graphics: mockGraphics,
  Text: mockText,
  Container: mockContainer,
  Sprite: mockSprite,
  Texture: mockTexture,
}));

function PixiApplicationHarness({
  onRuntime,
}: {
  onRuntime: (runtime: ReturnType<typeof usePixiApplication>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtime = usePixiApplication(containerRef);

  useEffect(() => {
    onRuntime(runtime);
  }, [onRuntime, runtime]);

  return <div ref={containerRef} data-testid="pixi-container" />;
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApplications.length = 0;
  mockInit.mockResolvedValue(undefined);
});

describe("usePixiApplication", () => {
  it("initializes Pixi with the map options, inserts a touch-owned absolute canvas, and publishes its runtime", async () => {
    const runtimes: Array<ReturnType<typeof usePixiApplication>> = [];
    const { getByTestId } = render(<PixiApplicationHarness onRuntime={(runtime) => runtimes.push(runtime)} />);
    const container = getByTestId("pixi-container");

    await flushAsyncWork();

    const app = mockApplications[0];
    expect(mockInit).toHaveBeenCalledWith({
      backgroundAlpha: 0,
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    expect(container).toContainElement(app.canvas);
    expect(app.canvas.style.position).toBe("absolute");
    expect(app.canvas.style.inset).toBe("0px");
    expect(app.canvas.style.touchAction).toBe("none");
    expect(runtimes.at(-1)).toEqual({
      app,
      constructors: {
        Graphics: mockGraphics,
        Text: mockText,
        Container: mockContainer,
        Sprite: mockSprite,
        Texture: mockTexture,
      },
    });
  });

  it("uses a resolution of one when the device pixel ratio is zero", async () => {
    const originalDevicePixelRatio = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 0 });

    try {
      render(<PixiApplicationHarness onRuntime={jest.fn()} />);
      await flushAsyncWork();

      expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ resolution: 1 }));
    } finally {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: originalDevicePixelRatio,
      });
    }
  });

  it("destroys the initialized application once when unmounted after readiness", async () => {
    const { unmount } = render(<PixiApplicationHarness onRuntime={jest.fn()} />);
    await flushAsyncWork();

    unmount();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledWith(true, { children: true, context: true });
  });

  it("lets the pending initialization continuation destroy the application once after unmount", async () => {
    const deferred = createDeferred();
    mockInit.mockReturnValue(deferred.promise);
    const { unmount } = render(<PixiApplicationHarness onRuntime={jest.fn()} />);
    await flushAsyncWork();

    unmount();
    expect(mockDestroy).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve();
      await Promise.resolve();
    });

    expect(mockDestroy).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledWith(true, { children: true, context: true });
  });

  it("does not construct an application when unmounted before the import continues", async () => {
    const { unmount } = render(<PixiApplicationHarness onRuntime={jest.fn()} />);

    unmount();
    await flushAsyncWork();

    expect(mockApplications).toHaveLength(0);
    expect(mockDestroy).not.toHaveBeenCalled();
  });
});
