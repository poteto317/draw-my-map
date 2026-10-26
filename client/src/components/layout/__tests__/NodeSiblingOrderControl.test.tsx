import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSiblingOrderControl } from "@/components/layout/NodeSiblingOrderControl";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

type Props = Parameters<typeof NodeSiblingOrderControl>[0];

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    canMoveUp: true,
    canMoveDown: true,
    onMoveUp: jest.fn(),
    onMoveDown: jest.fn(),
    ...overrides,
  };
}

function getUpButton() {
  return screen.getByRole("button", { name: "枝を上へ移動" });
}

function getDownButton() {
  return screen.getByRole("button", { name: "枝を下へ移動" });
}

describe("NodeSiblingOrderControl", () => {
  it("グループ名・表示・ショートカット・titleを持つ", () => {
    render(<NodeSiblingOrderControl {...createProps()} />);
    const group = screen.getByRole("group", { name: "兄弟の順序" });

    const up = getUpButton();
    const down = getDownButton();
    expect(group).toContainElement(up);
    expect(group).toContainElement(down);
    expect(up.textContent).toBe("上へ");
    expect(up).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowUp");
    expect(up).toHaveAttribute("title", "枝を上へ移動（Alt/Option+↑）");
    expect(up).toHaveAttribute("type", "button");
    expect(up.className).toContain("focus-visible:");
    expect(down.textContent).toBe("下へ");
    expect(down).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowDown");
    expect(down).toHaveAttribute("title", "枝を下へ移動（Alt/Option+↓）");
    expect(down).toHaveAttribute("type", "button");
    expect(down.className).toContain("focus-visible:");
  });

  it("クリックで対応する移動を1回呼び、ダブルクリックでは2回呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<NodeSiblingOrderControl {...props} />);

    await user.click(getUpButton());
    expect(props.onMoveUp).toHaveBeenCalledTimes(1);
    expect(props.onMoveDown).not.toHaveBeenCalled();
    await user.click(getDownButton());
    expect(props.onMoveDown).toHaveBeenCalledTimes(1);
    expect(props.onMoveUp).toHaveBeenCalledTimes(1);

    await user.dblClick(getUpButton());
    expect(props.onMoveUp).toHaveBeenCalledTimes(3);
    await user.dblClick(getDownButton());
    expect(props.onMoveDown).toHaveBeenCalledTimes(3);
  });

  it("移動できない側はdisabled属性で無効になり、クリックしても呼ばれない", async () => {
    const user = userEvent.setup();
    const props = createProps({ canMoveUp: false, canMoveDown: false });
    render(<NodeSiblingOrderControl {...props} />);

    expect(getUpButton().hasAttribute("disabled")).toBe(true);
    expect(getDownButton().hasAttribute("disabled")).toBe(true);
    await user.click(getUpButton());
    await user.click(getDownButton());
    expect(props.onMoveUp).not.toHaveBeenCalled();
    expect(props.onMoveDown).not.toHaveBeenCalled();
  });

  it("片方だけ無効にできる", () => {
    render(<NodeSiblingOrderControl {...createProps({ canMoveUp: false })} />);
    expect(getUpButton().hasAttribute("disabled")).toBe(true);
    expect(getDownButton().hasAttribute("disabled")).toBe(false);
  });

  it.each([
    ["上へ", getUpButton],
    ["下へ", getDownButton],
  ])("%sのEnterの押し続けだけ既定動作を止める", (_label, getButton) => {
    render(<NodeSiblingOrderControl {...createProps()} />);
    const button = getButton();

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(true);
  });

  it("両方のボタンにショートカットを通す目印（data-tree-edit-shortcut-button）を付ける", () => {
    render(<NodeSiblingOrderControl {...createProps()} />);
    expect(getUpButton()).toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
    expect(getDownButton()).toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
    expect(screen.getByRole("group", { name: "兄弟の順序" })).not.toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
  });

  it.each([
    ["上へ", getUpButton],
    ["下へ", getDownButton],
  ])("%sへのAlt+↑/↓は自分では処理せず、windowのショートカットだけに任せる", (_label, getButton) => {
    const props = createProps();
    render(<NodeSiblingOrderControl {...props} />);
    const button = getButton();

    expect(fireEvent.keyDown(button, { key: "ArrowUp", altKey: true })).toBe(true);
    expect(fireEvent.keyDown(button, { key: "ArrowDown", altKey: true, repeat: true })).toBe(true);
    expect(props.onMoveUp).not.toHaveBeenCalled();
    expect(props.onMoveDown).not.toHaveBeenCalled();
  });

  it("pointerdownの既定動作を止めない", () => {
    render(<NodeSiblingOrderControl {...createProps()} />);
    expect(fireEvent.pointerDown(getUpButton())).toBe(true);
    expect(fireEvent.mouseDown(getDownButton())).toBe(true);
  });

  describe("フォーカスの引き継ぎ", () => {
    it("上へが無効になったら下へへフォーカスを移す", () => {
      const { rerender } = render(<NodeSiblingOrderControl {...createProps()} />);
      getUpButton().focus();
      rerender(<NodeSiblingOrderControl {...createProps({ canMoveUp: false })} />);
      expect(getDownButton()).toHaveFocus();
    });

    it("下へが無効になったら上へへフォーカスを移す", () => {
      const { rerender } = render(<NodeSiblingOrderControl {...createProps()} />);
      getDownButton().focus();
      rerender(<NodeSiblingOrderControl {...createProps({ canMoveDown: false })} />);
      expect(getUpButton()).toHaveFocus();
    });

    it("もう一方も無効なら移さない", () => {
      const { rerender } = render(<NodeSiblingOrderControl {...createProps()} />);
      getUpButton().focus();
      // 無効のボタンにはfocus()しても移らないので、移そうとしたこと自体をspyで確かめる
      const focusSpy = jest.spyOn(HTMLElement.prototype, "focus");
      try {
        rerender(<NodeSiblingOrderControl {...createProps({ canMoveUp: false, canMoveDown: false })} />);
        expect(focusSpy).not.toHaveBeenCalled();
      } finally {
        focusSpy.mockRestore();
      }
    });

    it("両方が無効になった後は記録を捨て、bodyのままボタンが有効になってもフォーカスを移さない", () => {
      const { rerender } = render(<NodeSiblingOrderControl {...createProps()} />);
      getUpButton().focus();
      rerender(<NodeSiblingOrderControl {...createProps({ canMoveUp: false, canMoveDown: false })} />);
      // jsdomは無効化したボタンにフォーカスを残すため、別の要素を経由してbodyへ戻す
      const outside = document.createElement("input");
      document.body.appendChild(outside);
      outside.focus();
      outside.blur();
      outside.remove();
      expect(document.body).toHaveFocus();
      rerender(<NodeSiblingOrderControl {...createProps({ canMoveUp: false, canMoveDown: true })} />);
      expect(document.body).toHaveFocus();
      expect(getDownButton()).not.toHaveFocus();
    });

    it("フォーカスがほかの要素にあるときは移さない", () => {
      const { rerender } = render(
        <>
          <NodeSiblingOrderControl {...createProps()} />
          <input aria-label="テスト入力" />
        </>,
      );
      getUpButton().focus();
      const input = screen.getByLabelText("テスト入力");
      input.focus();
      rerender(
        <>
          <NodeSiblingOrderControl {...createProps({ canMoveUp: false })} />
          <input aria-label="テスト入力" />
        </>,
      );
      expect(input).toHaveFocus();
      expect(getDownButton()).not.toHaveFocus();
    });
  });
});
