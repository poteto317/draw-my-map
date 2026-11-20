import { resolveOutlineInitialFocusTarget } from "@/components/map/resolveOutlineInitialFocusTarget";

describe("resolveOutlineInitialFocusTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("選択行を最優先する", () => {
    document.body.innerHTML = `
      <div data-outline-root>
        <ol>
          <li><button type="button">a</button></li>
          <li><button type="button" aria-pressed="true">b</button></li>
        </ol>
      </div>
      <div data-outline-toolbar><button type="button">ルート追加</button></div>
    `;
    expect(resolveOutlineInitialFocusTarget()?.textContent).toBe("b");
  });

  it("選択が無ければ先頭行、それも無ければルート追加", () => {
    document.body.innerHTML = `
      <div data-outline-root><ol><li><button type="button">a</button></li></ol></div>
      <div data-outline-toolbar><button type="button">ルート追加</button></div>
    `;
    expect(resolveOutlineInitialFocusTarget()?.textContent).toBe("a");

    document.body.innerHTML = `
      <div data-outline-root><ol></ol></div>
      <div data-outline-toolbar><button type="button">ルート追加</button></div>
    `;
    expect(resolveOutlineInitialFocusTarget()?.textContent).toBe("ルート追加");
  });

  it("aria-label 文言が変わっても data-* で解決する", () => {
    document.body.innerHTML = `
      <div data-outline-root aria-label="outline-renamed">
        <ol><li><button type="button" aria-pressed="true">selected</button></li></ol>
      </div>
      <div data-outline-toolbar aria-label="toolbar-renamed"><button type="button">add</button></div>
    `;
    expect(resolveOutlineInitialFocusTarget()?.textContent).toBe("selected");
  });
});
