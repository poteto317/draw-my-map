import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";

/** Shared Pixi runtime contract for MapStage integration tests. */
export type MockPointerEvent = {
  globalX: number;
  globalY: number;
  pointerId: number;
  pointerType: string;
  composedPath: () => unknown[];
  target?: unknown;
  shiftKey?: boolean;
  button: number;
};

export type MockPointerHandler = (event: MockPointerEvent) => void;
export type StageEvent =
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointerupoutside"
  | "pointercancel";

export type MockContainer = {
  addChild: jest.Mock;
  position: { set: jest.Mock };
  scale: { set: jest.Mock };
  alpha?: number;
  visible?: boolean;
  eventMode?: string;
  cursor?: string;
};

export const mockStageHandlers: Partial<Record<StageEvent, MockPointerHandler>> = {};
export const mockNodePointerHandlers: Array<
  Partial<Record<"pointerdown", MockPointerHandler>>
> = [];
export const mockContainers: MockContainer[] = [];

export const mockStage = {
  removeChildren: jest.fn(() => []),
  addChild: jest.fn(),
  on: jest.fn((event: StageEvent, handler: MockPointerHandler) => {
    mockStageHandlers[event] = handler;
  }),
  off: jest.fn((event: StageEvent, handler: MockPointerHandler) => {
    if (mockStageHandlers[event] === handler) delete mockStageHandlers[event];
  }),
  eventMode: "none",
  hitArea: null as unknown,
};

export function createMockPixiModule() {
  return {
    Application: jest.fn().mockImplementation(() => ({
      init: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(),
      canvas: document.createElement("canvas"),
      stage: mockStage,
      screen: { x: 0, y: 0, width: 800, height: 600 },
    })),
    Graphics: jest.fn().mockImplementation(() => ({
      rect: jest.fn().mockReturnThis(),
      fill: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      moveTo: jest.fn().mockReturnThis(),
      bezierCurveTo: jest.fn().mockReturnThis(),
    })),
    Text: jest.fn().mockImplementation(() => ({
      anchor: { set: jest.fn() },
      x: 0,
      y: 0,
    })),
    Container: jest.fn().mockImplementation(() => {
      const handlers: Partial<Record<"pointerdown", MockPointerHandler>> = {};
      const container: MockContainer & {
        on: (event: "pointerdown", handler: MockPointerHandler) => void;
        cursor: string;
      } = {
        addChild: jest.fn(),
        position: { set: jest.fn() },
        scale: { set: jest.fn() },
        on: jest.fn((event: "pointerdown", handler: MockPointerHandler) => {
          handlers[event] = handler;
          mockNodePointerHandlers.push(handlers);
        }),
        eventMode: "none",
        cursor: "default",
      };
      mockContainers.push(container);
      return container;
    }),
  };
}

export function pointer(
  globalX: number,
  globalY: number,
  options: Pick<MockPointerEvent, "shiftKey" | "target"> & { path?: unknown[] } = {},
): MockPointerEvent {
  const { path = [mockStage], ...eventOptions } = options;
  return {
    globalX,
    globalY,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    composedPath: () => path,
    ...eventOptions,
  };
}

export async function renderReady(ui: ReactElement) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

export function mockStageBounds(container: HTMLElement, left = 0, top = 0) {
  jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + 800,
    bottom: top + 600,
    width: 800,
    height: 600,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
}

export function lastWorldContainer(): MockContainer | undefined {
  return mockContainers.findLast((container) => container.scale.set.mock.calls.length > 0);
}

export function resetMapStageTestRuntime() {
  jest.clearAllMocks();
  for (const event of Object.keys(mockStageHandlers) as StageEvent[]) {
    delete mockStageHandlers[event];
  }
  mockNodePointerHandlers.length = 0;
  mockContainers.length = 0;
}
