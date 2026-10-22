import {
  mapLibraryListButtonAttributes,
  mapLibraryListButtonSelector,
  type MapLibraryListButton,
} from "@/components/layout/mapLibraryListButtons";

function elementWith(attributes: Record<string, string>): HTMLElement {
  const element = document.createElement("button");
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

describe("mapLibraryListButtons", () => {
  it("行のボタンには data-map-id と data-map-action を付ける", () => {
    expect(mapLibraryListButtonAttributes({ kind: "row", mapId: "a", action: "rename" })).toEqual({
      "data-map-id": "a",
      "data-map-action": "rename",
    });
  });

  it("一覧の「新しいマップ」には data-map-action だけを付ける", () => {
    expect(mapLibraryListButtonAttributes({ kind: "listCreateButton" })).toEqual({
      "data-map-action": "create",
    });
  });

  it.each<MapLibraryListButton>([
    { kind: "row", mapId: "a", action: "open" },
    { kind: "row", mapId: "a", action: "rename" },
    { kind: "row", mapId: "a", action: "delete" },
    { kind: "listCreateButton" },
  ])("付けた属性の要素だけをセレクタで見つけられる（%o）", (button) => {
    const selector = mapLibraryListButtonSelector(button);

    expect(elementWith(mapLibraryListButtonAttributes(button)).matches(selector)).toBe(true);
  });

  it("行のセレクタは別の id・別の操作の行に一致しない", () => {
    const selector = mapLibraryListButtonSelector({ kind: "row", mapId: "a", action: "open" });

    expect(
      elementWith(mapLibraryListButtonAttributes({ kind: "row", mapId: "b", action: "open" }))
        .matches(selector),
    ).toBe(false);
    expect(
      elementWith(mapLibraryListButtonAttributes({ kind: "row", mapId: "a", action: "rename" }))
        .matches(selector),
    ).toBe(false);
  });
});
