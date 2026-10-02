import {
  NODE_CONTEXT_MENU_ATTRIBUTE,
  isInsideNodeContextMenu,
} from "@/components/map/nodeContextMenuDom";

describe("isInsideNodeContextMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("メニュー専用属性を持つ要素とその子孫はtrueを返す", () => {
    document.body.innerHTML = `<div ${NODE_CONTEXT_MENU_ATTRIBUTE}=""><button id="item"></button></div>`;

    expect(isInsideNodeContextMenu(document.querySelector("div"))).toBe(true);
    expect(isInsideNodeContextMenu(document.getElementById("item"))).toBe(true);
  });

  it("role=menuだけを持つ別要素はfalseを返す", () => {
    document.body.innerHTML = `<div role="menu"><button id="item"></button></div>`;

    expect(isInsideNodeContextMenu(document.getElementById("item"))).toBe(false);
  });

  it("メニュー外の要素、非Element、nullはfalseを返す", () => {
    document.body.innerHTML = `<div id="outside"></div>`;

    expect(isInsideNodeContextMenu(document.getElementById("outside"))).toBe(false);
    expect(isInsideNodeContextMenu(window)).toBe(false);
    expect(isInsideNodeContextMenu(null)).toBe(false);
  });
});
