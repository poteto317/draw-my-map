import { render, screen } from "@testing-library/react";
import { useNodeKeyboardShortcuts } from "@/components/map/useNodeKeyboardShortcuts";

type ShortcutOptions = {
  selectedNodeId: number | null;
  selectedRelationId?: number | null;
  selectedGroupId?: number | null;
  isEditing: boolean;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onDeleteNode: (nodeId: number) => void;
  onDeleteRelation?: (relationId: number) => void;
  onDeleteGroup?: (groupId: number) => void;
  onStartEditing: (nodeId: number, initialText: string) => void;
  enabled: boolean;
  onClearSelection: () => void;
  isSiblingReorderActive: () => boolean;
  isContextMenuOpen: () => boolean;
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
    enabled: true,
    onClearSelection: jest.fn(),
    isSiblingReorderActive: () => false,
    isContextMenuOpen: () => false,
    ...overrides,
  };
}

function dispatchKey(key: string) {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

function dispatchKeyWith(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe("useNodeKeyboardShortcuts", () => {
  afterEach(() => jest.restoreAllMocks());

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

  it.each(["Delete", "Backspace"])("deletes the selected relation on %s", (key) => {
    const onDeleteRelation = jest.fn();
    const options = createOptions({
      selectedNodeId: null,
      selectedRelationId: 10,
      onDeleteRelation,
    });
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey(key);

    expect(event.defaultPrevented).toBe(true);
    expect(onDeleteRelation).toHaveBeenCalledWith(10);
    expect(options.onDeleteNode).not.toHaveBeenCalled();
  });

  it.each(["Delete", "Backspace"])("deletes the selected group on %s (members remain)", (key) => {
    const onDeleteGroup = jest.fn();
    const options = createOptions({
      selectedNodeId: null,
      selectedGroupId: 20,
      onDeleteGroup,
    });
    render(<ShortcutHarness {...options} />);

    const event = dispatchKey(key);

    expect(event.defaultPrevented).toBe(true);
    expect(onDeleteGroup).toHaveBeenCalledWith(20);
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

  it.each(["Tab", "Enter", "Delete", "Backspace"])(
    "enabledがfalseの間は%sに反応せず、既定動作も止めない",
    (key) => {
      const options = createOptions({ enabled: false });
      render(<ShortcutHarness {...options} />);
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });

      document.body.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(options.onAddChildNode).not.toHaveBeenCalled();
      expect(options.onAddSiblingNode).not.toHaveBeenCalled();
      expect(options.onDeleteNode).not.toHaveBeenCalled();
      expect(options.onStartEditing).not.toHaveBeenCalled();
    },
  );

  it("enabledをfalseからtrueへ切り替えると、再登録なしで同じキーが動く", () => {
    const addListener = jest.spyOn(window, "addEventListener");
    const options = createOptions({ enabled: false });
    const { rerender } = render(<ShortcutHarness {...options} />);

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(options.onAddChildNode).not.toHaveBeenCalled();
    rerender(<ShortcutHarness {...options} enabled />);
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(options.onAddChildNode).toHaveBeenCalledWith(1);
    expect(addListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    addListener.mockRestore();
  });

  it.each([
    { key: "Enter", altKey: true },
    { key: "Enter", altKey: true, ctrlKey: true },
    { key: "Enter", altKey: true, shiftKey: true },
  ])("Alt を含む Enter %j は兄弟を足さず既定動作も止めない", (init) => {
    const options = createOptions();
    render(<ShortcutHarness {...options} />);

    const event = dispatchKeyWith(init);

    expect(options.onAddSiblingNode).not.toHaveBeenCalled();
    expect(options.onStartEditing).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([{ key: "Enter", shiftKey: true }, { key: "Enter", ctrlKey: true }, { key: "Enter", metaKey: true }])(
    "Alt なしの修飾キー付き Enter %j は従来どおり兄弟を足す",
    (init) => {
      const options = createOptions();
      render(<ShortcutHarness {...options} />);

      const event = dispatchKeyWith(init);

      expect(options.onAddSiblingNode).toHaveBeenCalledWith(1);
      expect(options.onStartEditing).toHaveBeenCalledWith(3, "");
      expect(event.defaultPrevented).toBe(true);
    },
  );


  it("非編集・有効・ガード false の Escape で全解除する", () => {
    const onClearSelection = jest.fn();
    const options = createOptions({ onClearSelection });
    render(<ShortcutHarness {...options} />);

    dispatchKey("Escape");

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("編集中の Escape では全解除しない", () => {
    const onClearSelection = jest.fn();
    const options = createOptions({ isEditing: true, onClearSelection });
    render(<ShortcutHarness {...options} />);

    dispatchKey("Escape");

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("enabled が false の Escape では全解除しない", () => {
    const onClearSelection = jest.fn();
    const options = createOptions({ enabled: false, onClearSelection });
    render(<ShortcutHarness {...options} />);

    dispatchKey("Escape");

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("interactive 対象からの Escape では全解除しない", () => {
    const onClearSelection = jest.fn();
    const options = createOptions({ onClearSelection });
    render(<ShortcutHarness {...options} />);
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });

    screen.getByRole("button", { name: "レイアウトモード" })
      .dispatchEvent(event);

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("コンテキストメニューが開いている Escape では全解除しない", () => {
    const onClearSelection = jest.fn();
    const options = createOptions({
      onClearSelection,
      isContextMenuOpen: () => true,
    });
    render(<ShortcutHarness {...options} />);

    dispatchKey("Escape");

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("並べ替え Escape を模擬し preventDefault 済みの同一 keydown では全解除しない", () => {
    const onClearSelection = jest.fn();
    const options = createOptions({
      onClearSelection,
      // 並べ替え Escape 処理後は isSiblingReorderActive が既に false になり得る
      isSiblingReorderActive: () => false,
    });
    render(<ShortcutHarness {...options} />);
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    event.preventDefault();

    window.dispatchEvent(event);

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("isSiblingReorderActive が true の Escape では全解除しない", () => {
    const onClearSelection = jest.fn();
    const options = createOptions({
      onClearSelection,
      isSiblingReorderActive: () => true,
    });
    render(<ShortcutHarness {...options} />);

    dispatchKey("Escape");

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("Alt+Tab は従来どおり子を足す", () => {
    const options = createOptions();
    render(<ShortcutHarness {...options} />);

    dispatchKeyWith({ key: "Tab", altKey: true });

    expect(options.onAddChildNode).toHaveBeenCalledWith(1);
  });
});
