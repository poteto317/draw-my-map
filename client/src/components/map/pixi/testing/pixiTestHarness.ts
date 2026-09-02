type PointerHandler = (event: unknown) => void;

export function createPixiTestHarness() {
  const children: unknown[] = [];
  const containerHandlers: Array<Record<string, PointerHandler>> = [];
  const stage = {
    removeChildren: jest.fn(() => children.splice(0)),
    addChild: jest.fn((child: unknown) => children.push(child)),
  };
  const Graphics = jest.fn().mockImplementation(() => ({
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    bezierCurveTo: jest.fn().mockReturnThis(),
    destroy: jest.fn(),
  }));
  const Text = jest.fn().mockImplementation((options: unknown) => ({
    options,
    anchor: { set: jest.fn() },
    x: 0,
    y: 0,
    destroy: jest.fn(),
  }));
  const Container = jest.fn().mockImplementation(() => {
    const handlers: Record<string, PointerHandler> = {};
    containerHandlers.push(handlers);
    return {
      addChild: jest.fn(),
      on: jest.fn((event: string, handler: PointerHandler) => {
        handlers[event] = handler;
      }),
      eventMode: "none",
      cursor: "default",
      destroy: jest.fn(),
    };
  });

  return {
    children,
    stage,
    Graphics,
    Text,
    Container,
    constructors: { Graphics, Text, Container },
    app: { stage },
    containerHandlers,
  };
}
