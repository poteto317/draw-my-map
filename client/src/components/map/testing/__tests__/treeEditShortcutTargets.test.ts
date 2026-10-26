import {
  buttonInsideMarkedElement,
  insideOf,
} from "@/components/map/testing/treeEditShortcutTargets";
import { TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE } from "@/components/map/treeEditShortcutGuard";

describe("insideOf", () => {
  it("指定した要素の内側の span を返し、外側の要素に属性を付ける", () => {
    const inner = insideOf("a", { href: "/x", title: "t" });

    expect(inner.tagName).toBe("SPAN");
    const outer = inner.parentElement!;
    expect(outer.tagName).toBe("A");
    expect(outer).toHaveAttribute("href", "/x");
    expect(outer).toHaveAttribute("title", "t");
    expect(inner.attributes).toHaveLength(0);
  });

  it("属性を省くと外側の要素に属性を付けない", () => {
    const outer = insideOf("button").parentElement!;

    expect(outer.tagName).toBe("BUTTON");
    expect(outer.attributes).toHaveLength(0);
  });
});

describe("buttonInsideMarkedElement", () => {
  it("目印を付けた div の中にある、目印の無い button を返す", () => {
    const button = buttonInsideMarkedElement();

    expect(button.tagName).toBe("BUTTON");
    expect(button).not.toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE);
    const outer = button.parentElement!;
    expect(outer.tagName).toBe("DIV");
    expect(outer).toHaveAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "");
  });
});
