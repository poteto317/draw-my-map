import { isEditableTarget } from "@/components/map/editableTarget";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): Element {
  document.body.innerHTML = html;
  return document.querySelector("#t")!;
}

describe("isEditableTarget", () => {
  it.each([
    { name: "input", html: '<input id="t" />' },
    { name: "textarea", html: '<textarea id="t"></textarea>' },
    { name: "select", html: '<select id="t"><option>a</option></select>' },
    { name: "labelで包まれたinput", html: '<label><input id="t" /></label>' },
    { name: "contenteditable（値なし）", html: '<div id="t" contenteditable></div>' },
    { name: "contenteditable=true", html: '<div id="t" contenteditable="true"></div>' },
    { name: "contenteditable=TRUE（大文字・空白）", html: '<div id="t" contenteditable=" TRUE "></div>' },
    { name: "contenteditable=plaintext-only", html: '<div id="t" contenteditable="plaintext-only"></div>' },
    { name: "contenteditableの子孫", html: '<div contenteditable="true"><p><span id="t">x</span></p></div>' },
    { name: "不正値は祖先の設定を継承する", html: '<div contenteditable="true"><span id="t" contenteditable="abc">x</span></div>' },
    { name: "編集領域内のSVG要素", html: '<div contenteditable="true"><svg><g id="t"></g></svg></div>' },
  ])("$nameは編集先として扱う", ({ html }) => {
    expect(isEditableTarget(mount(html))).toBe(true);
  });

  it.each([
    { name: "ボタン", html: '<button id="t" type="button">x</button>' },
    { name: "通常のdiv", html: '<div id="t"></div>' },
    { name: "contenteditable=false", html: '<div id="t" contenteditable="false"></div>' },
    { name: "編集領域内のcontenteditable=false", html: '<div contenteditable="true"><span id="t" contenteditable="false">x</span></div>' },
    { name: "false領域の子孫", html: '<div contenteditable="true"><div contenteditable="false"><span id="t">x</span></div></div>' },
    { name: "祖先がない不正値", html: '<div id="t" contenteditable="abc"></div>' },
  ])("$nameは編集先として扱わない", ({ html }) => {
    expect(isEditableTarget(mount(html))).toBe(false);
  });

  it("Element以外（window・null）は編集先として扱わない", () => {
    expect(isEditableTarget(window)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
