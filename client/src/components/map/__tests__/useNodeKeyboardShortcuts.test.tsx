import { render, screen } from "@testing-library/react";
import { useNodeKeyboardShortcuts } from "@/components/map/useNodeKeyboardShortcuts";

type ShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onDeleteNode: (nodeId: number) => void;
  onStartEditing: (nodeId: number, initialText: string) => void;
};

function ShortcutHarness(options: ShortcutOptions) {
  useNodeKeyboardShortcuts(options);
  return <button type="button">レイアウトモード</button>;
}

function createOptions(overrides: Partial<ShortcutOptions> = {}): ShortcutOptions {
  return {
    selectedNodeId: 1,
    isEditing: false,
    onAddChildNode: jest.fn(() => 2),
    onAddSiblingNode: jest.fn(() => 3),
    onDeleteNode: jest.fn(),
    onStartEditing: jest.fn(),
    ...overrides,
  };
}

function dispatchKey(key: string) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("useNodeKeyboardShortcuts", () => {
  it("creates a child and starts an empty edit on Tab", () => {
    const options = createOptions();
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey("Tab");

    expect(event.defaultPrevented).toBe(true);
    expect(options.onAddChildNode).toHaveBeenCalledWith(1);
    expect(options.onAddSiblingNode).not.toHaveBeenCalled();
    expect(options.onStartEditing).toHaveBeenCalledWith(2, "");
  });

  it("creates a sibling and starts an empty edit on Enter", () => {
    const options = createOptions();
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey("Enter");

    expect(event.defaultPrevented).toBe(true);
    expect(options.onAddSiblingNode).toHaveBeenCalledWith(1);
    expect(options.onAddChildNode).not.toHaveBeenCalled();
    expect(options.onStartEditing).toHaveBeenCalledWith(3, "");
  });

  it.each(["Delete", "Backspace"])("deletes the selected node on %s", (key) => {
    const options = createOptions();
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey(key);

    expect(event.defaultPrevented).toBe(true);
    expect(options.onDeleteNode).toHaveBeenCalledWith(1);
    expect(options.onStartEditing).not.toHaveBeenCalled();
  });

  it("ignores keys while editing", () => {
    const options = createOptions({ isEditing: true });
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey("Tab");

    expect(event.defaultPrevented).toBe(false);
    expect(options.onAddChildNode).not.toHaveBeenCalled();
    expect(options.onStartEditing).not.toHaveBeenCalled();
  });

  it("ignores keys when no node is selected", () => {
    const options = createOptions({ selectedNodeId: null });
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey("Delete");

    expect(event.defaultPrevented).toBe(false);
    expect(options.onDeleteNode).not.toHaveBeenCalled();
  });

  it("does not start editing when node creation returns null", () => {
    const options = createOptions({ onAddChildNode: jest.fn(() => null) });
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey("Tab");

    expect(event.defaultPrevented).toBe(true);
    expect(options.onStartEditing).not.toHaveBeenCalled();
  });

  it("leaves unhandled keys to the browser", () => {
    const options = createOptions();
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey("ArrowDown");

    expect(event.defaultPrevented).toBe(false);
    expect(options.onAddChildNode).not.toHaveBeenCalled();
    expect(options.onAddSiblingNode).not.toHaveBeenCalled();
    expect(options.onDeleteNode).not.toHaveBeenCalled();
  });

  it.each(["Tab", "Enter", "Delete", "Backspace"])(
    "ignores %s from an interactive control",
    (key) => {
      const options = createOptions();
      render(<ShortcutHarness {...options} />);
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });

      screen.getByRole("button", { name: "レイアウトモード" })
        .dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(options.onAddChildNode).not.toHaveBeenCalled();
      expect(options.onAddSiblingNode).not.toHaveBeenCalled();
      expect(options.onDeleteNode).not.toHaveBeenCalled();
      expect(options.onStartEditing).not.toHaveBeenCalled();
    },
  );

  it("removes its exact listener on unmount", () => {
    const options = createOptions();
    const addListener = jest.spyOn(window, "addEventListener");
    const removeListener = jest.spyOn(window, "removeEventListener");
    const { unmount } = render(<ShortcutHarness {...options} />);

    unmount();

    const addedHandler = addListener.mock.calls.find(([type]) => type === "keydown")?.[1];
    const removedHandler = removeListener.mock.calls.find(([type]) => type === "keydown")?.[1];
    expect(removedHandler).toBe(addedHandler);

    dispatchKey("Tab");
    expect(options.onAddChildNode).not.toHaveBeenCalled();
  });
});
