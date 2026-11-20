import { isRestorableFocusTarget } from "@/components/map/isRestorableFocusTarget";

describe("isRestorableFocusTarget", () => {
  it("接続済みの通常要素は true", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    expect(isRestorableFocusTarget(button)).toBe(true);
    button.remove();
  });

  it("null・非 HTMLElement・未接続は false", () => {
    expect(isRestorableFocusTarget(null)).toBe(false);
    expect(isRestorableFocusTarget(document.createTextNode("x") as unknown as Element)).toBe(false);
    const detached = document.createElement("button");
    expect(isRestorableFocusTarget(detached)).toBe(false);
  });

  it("disabled / aria-disabled / hidden は false", () => {
    const disabled = document.createElement("button");
    disabled.disabled = true;
    document.body.appendChild(disabled);
    expect(isRestorableFocusTarget(disabled)).toBe(false);
    disabled.remove();

    const ariaDisabled = document.createElement("div");
    ariaDisabled.setAttribute("aria-disabled", "true");
    ariaDisabled.tabIndex = 0;
    document.body.appendChild(ariaDisabled);
    expect(isRestorableFocusTarget(ariaDisabled)).toBe(false);
    ariaDisabled.remove();

    const hidden = document.createElement("button");
    hidden.hidden = true;
    document.body.appendChild(hidden);
    expect(isRestorableFocusTarget(hidden)).toBe(false);
    hidden.remove();
  });
});
