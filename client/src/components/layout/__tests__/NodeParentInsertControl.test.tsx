import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeParentInsertControl } from "@/components/layout/NodeParentInsertControl";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

type Props = Parameters<typeof NodeParentInsertControl>[0];

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    canInsert: true,
    onInsert: jest.fn(),
    ...overrides,
  };
}

function getButton() {
  return screen.getByRole("button", { name: "選択中のノードに親を挿入" });
}

describe("NodeParentInsertControl", () => {
  it("名前・表示・ショートカット・titleを持ち、groupで囲まない", () => {
    render(<NodeParentInsertControl {...createProps()} />);
    const button = getButton();

    expect(button.textContent).toBe("親を挿入");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Alt+Enter");
    expect(button).toHaveAttribute("title", "選択中のノードに親を挿入（Alt/Option+Enter）");
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("focus-visible:");
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("クリックで1回呼び、detailが0でも2でも呼び、ダブルクリックでは2回呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<NodeParentInsertControl {...props} />);

    await user.click(getButton());
    expect(props.onInsert).toHaveBeenCalledTimes(1);
    fireEvent.click(getButton(), { detail: 0 });
    expect(props.onInsert).toHaveBeenCalledTimes(2);
    fireEvent.click(getButton(), { detail: 2 });
    expect(props.onInsert).toHaveBeenCalledTimes(3);
    await user.dblClick(getButton());
    expect(props.onInsert).toHaveBeenCalledTimes(5);
  });

  it("canInsertがfalseならdisabled属性で無効になり、クリックしても呼ばれない", async () => {
    const user = userEvent.setup();
    const props = createProps({ canInsert: false });
    render(<NodeParentInsertControl {...props} />);

    expect(getButton().hasAttribute("disabled")).toBe(true);
    await user.click(getButton());
    expect(props.onInsert).not.toHaveBeenCalled();
  });

  it("Enterの押し続けだけ既定動作を止め、通常のEnterとSpaceのリピートは止めない", () => {
    render(<NodeParentInsertControl {...createProps()} />);
    const button = getButton();

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(true);
  });

  it("ショートカットの目印が付き、Alt+Enterのkeydownは処理せず止めない", () => {
    const props = createProps();
    render(<NodeParentInsertControl {...props} />);
    const button = getButton();

    expect(button).toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
    expect(fireEvent.keyDown(button, { key: "Enter", altKey: true })).toBe(true);
    expect(props.onInsert).not.toHaveBeenCalled();
  });

  it("pointerdownの既定動作を止めない", () => {
    render(<NodeParentInsertControl {...createProps()} />);
    expect(fireEvent.pointerDown(getButton())).toBe(true);
  });
});
