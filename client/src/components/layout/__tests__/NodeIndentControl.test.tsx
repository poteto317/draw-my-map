import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeIndentControl } from "@/components/layout/NodeIndentControl";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

type Props = Parameters<typeof NodeIndentControl>[0];

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    canOutdent: true,
    canIndent: true,
    onOutdent: jest.fn(),
    onIndent: jest.fn(),
    ...overrides,
  };
}

function getOutdentButton() {
  return screen.getByRole("button", { name: "枝の階層を上げる" });
}

function getIndentButton() {
  return screen.getByRole("button", { name: "枝の階層を下げる" });
}

describe("NodeIndentControl", () => {
  it("グループ名・表示・ショートカット・titleを持つ", () => {
    render(<NodeIndentControl {...createProps()} />);
    const group = screen.getByRole("group", { name: "階層" });

    const outdent = getOutdentButton();
    const indent = getIndentButton();
    expect(group).toContainElement(outdent);
    expect(group).toContainElement(indent);
    expect(outdent.textContent).toBe("階層を上げる");
    expect(outdent).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowLeft");
    expect(outdent).toHaveAttribute("title", "枝の階層を上げる（Alt/Option+←）");
    expect(outdent).toHaveAttribute("type", "button");
    expect(outdent.className).toContain("focus-visible:");
    expect(indent.textContent).toBe("階層を下げる");
    expect(indent).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowRight");
    expect(indent).toHaveAttribute("title", "枝の階層を下げる（Alt/Option+→）");
    expect(indent).toHaveAttribute("type", "button");
    expect(indent.className).toContain("focus-visible:");
  });

  it("グループの中で「上げる」「下げる」の順に並ぶ", () => {
    render(<NodeIndentControl {...createProps()} />);
    const group = screen.getByRole("group", { name: "階層" });
    const names = Array.from(group.querySelectorAll("button")).map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["枝の階層を上げる", "枝の階層を下げる"]);
  });

  it("クリックで対応する操作を1回呼び、ダブルクリックでは2回呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<NodeIndentControl {...props} />);

    await user.click(getOutdentButton());
    expect(props.onOutdent).toHaveBeenCalledTimes(1);
    expect(props.onIndent).not.toHaveBeenCalled();
    await user.click(getIndentButton());
    expect(props.onIndent).toHaveBeenCalledTimes(1);
    expect(props.onOutdent).toHaveBeenCalledTimes(1);

    await user.dblClick(getOutdentButton());
    expect(props.onOutdent).toHaveBeenCalledTimes(3);
    await user.dblClick(getIndentButton());
    expect(props.onIndent).toHaveBeenCalledTimes(3);
  });

  it("操作できない側はdisabled属性で無効になり、クリックしても呼ばれない", async () => {
    const user = userEvent.setup();
    const props = createProps({ canOutdent: false, canIndent: false });
    render(<NodeIndentControl {...props} />);

    expect(getOutdentButton().hasAttribute("disabled")).toBe(true);
    expect(getIndentButton().hasAttribute("disabled")).toBe(true);
    await user.click(getOutdentButton());
    await user.click(getIndentButton());
    expect(props.onOutdent).not.toHaveBeenCalled();
    expect(props.onIndent).not.toHaveBeenCalled();
  });

  it("片方だけ無効にできる", () => {
    const { rerender } = render(<NodeIndentControl {...createProps({ canOutdent: false })} />);
    expect(getOutdentButton().hasAttribute("disabled")).toBe(true);
    expect(getIndentButton().hasAttribute("disabled")).toBe(false);
    rerender(<NodeIndentControl {...createProps({ canIndent: false })} />);
    expect(getOutdentButton().hasAttribute("disabled")).toBe(false);
    expect(getIndentButton().hasAttribute("disabled")).toBe(true);
  });

  it.each([
    ["階層を上げる", getOutdentButton],
    ["階層を下げる", getIndentButton],
  ])("%sのEnterの押し続けだけ既定動作を止める", (_label, getButton) => {
    render(<NodeIndentControl {...createProps()} />);
    const button = getButton();

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(true);
  });

  it("両方のボタンにAlt+←/→のショートカットを通す目印を付け、グループには付けない", () => {
    render(<NodeIndentControl {...createProps()} />);
    expect(getOutdentButton()).toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
    expect(getIndentButton()).toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
    expect(screen.getByRole("group", { name: "階層" })).not.toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
  });

  it.each([
    ["階層を上げる", getOutdentButton],
    ["階層を下げる", getIndentButton],
  ])("%sへのAlt+←/→は自分では処理せず、windowのショートカットだけに任せる", (_label, getButton) => {
    const props = createProps();
    render(<NodeIndentControl {...props} />);
    const button = getButton();

    expect(fireEvent.keyDown(button, { key: "ArrowLeft", altKey: true })).toBe(true);
    expect(fireEvent.keyDown(button, { key: "ArrowRight", altKey: true, repeat: true })).toBe(true);
    expect(props.onOutdent).not.toHaveBeenCalled();
    expect(props.onIndent).not.toHaveBeenCalled();
  });

  it("pointerdownの既定動作を止めない", () => {
    render(<NodeIndentControl {...createProps()} />);
    expect(fireEvent.pointerDown(getOutdentButton())).toBe(true);
    expect(fireEvent.pointerDown(getIndentButton())).toBe(true);
    expect(fireEvent.mouseDown(getIndentButton())).toBe(true);
  });

  describe("フォーカスの引き継ぎ", () => {
    it("階層を上げるが無効になったら階層を下げるへフォーカスを移す", () => {
      const { rerender } = render(<NodeIndentControl {...createProps()} />);
      getOutdentButton().focus();
      rerender(<NodeIndentControl {...createProps({ canOutdent: false })} />);
      expect(getIndentButton()).toHaveFocus();
    });

    it("階層を下げるが無効になったら階層を上げるへフォーカスを移す", () => {
      const { rerender } = render(<NodeIndentControl {...createProps()} />);
      getIndentButton().focus();
      rerender(<NodeIndentControl {...createProps({ canIndent: false })} />);
      expect(getOutdentButton()).toHaveFocus();
    });

    it("もう一方も無効なら移さない", () => {
      const { rerender } = render(<NodeIndentControl {...createProps()} />);
      getOutdentButton().focus();
      const focusSpy = jest.spyOn(HTMLElement.prototype, "focus");
      try {
        rerender(<NodeIndentControl {...createProps({ canOutdent: false, canIndent: false })} />);
        expect(focusSpy).not.toHaveBeenCalled();
      } finally {
        focusSpy.mockRestore();
      }
    });

    it("両方が無効になった後は記録を捨て、bodyのままボタンが有効になってもフォーカスを移さない", () => {
      const { rerender } = render(<NodeIndentControl {...createProps()} />);
      getOutdentButton().focus();
      rerender(<NodeIndentControl {...createProps({ canOutdent: false, canIndent: false })} />);
      // jsdomは無効化したボタンにフォーカスを残すため、別の要素を経由してbodyへ戻す
      const outside = document.createElement("input");
      document.body.appendChild(outside);
      outside.focus();
      outside.blur();
      outside.remove();
      expect(document.body).toHaveFocus();
      rerender(<NodeIndentControl {...createProps({ canOutdent: false, canIndent: true })} />);
      expect(document.body).toHaveFocus();
      expect(getIndentButton()).not.toHaveFocus();
    });

    it("フォーカスがほかの要素にあるときは移さない", () => {
      const { rerender } = render(
        <>
          <NodeIndentControl {...createProps()} />
          <input aria-label="テスト入力" />
        </>,
      );
      getOutdentButton().focus();
      const input = screen.getByLabelText("テスト入力");
      input.focus();
      rerender(
        <>
          <NodeIndentControl {...createProps({ canOutdent: false })} />
          <input aria-label="テスト入力" />
        </>,
      );
      expect(input).toHaveFocus();
      expect(getIndentButton()).not.toHaveFocus();
    });
  });
});
