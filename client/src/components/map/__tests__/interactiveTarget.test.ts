import { isInteractiveTarget } from "@/components/map/interactiveTarget";

function createElement(tag: string, attributes: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

describe("isInteractiveTarget", () => {
  it.each([
    ["button", createElement("button")],
    ["input", createElement("input")],
    ["textarea", createElement("textarea")],
    ["select", createElement("select")],
    ["a[href]", createElement("a", { href: "#" })],
    ["[contenteditable]", createElement("div", { contenteditable: "" })],
    ["[contenteditable=\"false\"]（値によらず真）", createElement("div", { contenteditable: "false" })],
  ])("%s は true", (_name, element) => {
    expect(isInteractiveTarget(element)).toBe(true);
  });

  it("対話要素の内側の要素は true", () => {
    const button = createElement("button");
    const span = createElement("span");
    button.appendChild(span);

    expect(isInteractiveTarget(span)).toBe(true);
  });

  it("対話要素ではない要素・body・window・null は false", () => {
    expect(isInteractiveTarget(createElement("div"))).toBe(false);
    expect(isInteractiveTarget(createElement("a"))).toBe(false);
    expect(isInteractiveTarget(document.body)).toBe(false);
    expect(isInteractiveTarget(window)).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
  });
});
