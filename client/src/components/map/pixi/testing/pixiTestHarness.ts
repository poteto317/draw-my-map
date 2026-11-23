type PointerHandler = (event: unknown) => void;

type MockContainer = {
  addChild: jest.Mock;
  position: { set: jest.Mock };
  scale: { set: jest.Mock };
  on: jest.Mock;
  eventMode: string;
  cursor: string;
  destroy: jest.Mock;
};

export function createPixiTestHarness() {
  const children: unknown[] = [];
  const containerHandlers: Array<Record<string, PointerHandler>> = [];
  const containers: MockContainer[] = [];
  const stage = {
    removeChildren: jest.fn(() => children.splice(0)),
    addChild: jest.fn((child: unknown) => children.push(child)),
  };
  const Graphics = jest.fn().mockImplementation(() => ({
    rect: jest.fn().mockReturnThis(),
    circle: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    bezierCurveTo: jest.fn().mockReturnThis(),
    destroy: jest.fn(),
  }));
  const Text = jest.fn().mockImplementation((
    options: { style?: { fontSize?: number; wordWrapWidth?: number } } | unknown,
  ) => {
    const style = options !== null && typeof options === "object" && "style" in options
      ? (options as { style?: { fontSize?: number; wordWrapWidth?: number } }).style
      : undefined;
    return {
      options,
      anchor: { set: jest.fn() },
      x: 0,
      y: 0,
      width: style?.wordWrapWidth ?? 50,
      height: style?.fontSize ?? 14,
      destroy: jest.fn(),
    };
  });
  const Sprite = jest.fn().mockImplementation((texture: unknown) => ({
    texture,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    destroy: jest.fn(),
  }));
  const Texture = { from: jest.fn() };
  const Container = jest.fn().mockImplementation(() => {
    const handlers: Record<string, PointerHandler> = {};
    const container: MockContainer = {
      addChild: jest.fn(),
      position: { set: jest.fn() },
      scale: { set: jest.fn() },
      on: jest.fn((event: string, handler: PointerHandler) => {
        handlers[event] = handler;
      }),
      eventMode: "none",
      cursor: "default",
      destroy: jest.fn(),
    };
    containers.push(container);
    containerHandlers.push(handlers);
    return container;
  });

  return {
    children,
    stage,
    Graphics,
    Text,
    Container,
    Sprite,
    Texture,
    constructors: { Graphics, Text, Container, Sprite, Texture },
    app: { stage },
    containerHandlers,
    containers,
  };
}
