import { isTextEntryTarget } from "@/components/map/textEntryTarget";

describe("isTextEntryTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("inputとtextareaはtrueを返す", () => {
    document.body.innerHTML = `<input id="a" /><textarea id="b"></textarea>`;

    expect(isTextEntryTarget(document.getElementById("a"))).toBe(true);
    expect(isTextEntryTarget(document.getElementById("b"))).toBe(true);
  });

  it("closestでtextareaに解決できる要素はtrueを返す", () => {
    const textarea = document.createElement("textarea");
    textarea.id = "t";
    const span = document.createElement("span");
    span.id = "c";
    textarea.appendChild(span);
    document.body.appendChild(textarea);

    expect(isTextEntryTarget(document.getElementById("c"))).toBe(true);
  });

  it("その他の要素、非Element、nullはfalseを返す", () => {
    document.body.innerHTML = `<button id="d"></button>`;

    expect(isTextEntryTarget(document.getElementById("d"))).toBe(false);
    expect(isTextEntryTarget(window)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
