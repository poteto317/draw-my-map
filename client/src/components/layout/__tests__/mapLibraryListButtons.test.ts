import {
  mapLibraryFolderTargetAttributes,
  mapLibraryFolderTargetSelector,
  mapLibraryListButtonAttributes,
  mapLibraryListButtonSelector,
  type MapLibraryFolderTarget,
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
    { kind: "folderButton" },
  ])("付けた属性の要素だけをセレクタで見つけられる（%o）", (button) => {
    const selector = mapLibraryListButtonSelector(button);

    expect(elementWith(mapLibraryListButtonAttributes(button)).matches(selector)).toBe(true);
  });

  it.each<MapLibraryFolderTarget>([
    { kind: "folderCreateInput" },
    { kind: "folderRow", folderId: "f1", action: "rename" },
    { kind: "folderRow", folderId: "f1", action: "delete" },
  ])("フォルダーターゲットの属性とセレクタが一致する（%o）", (target) => {
    const selector = mapLibraryFolderTargetSelector(target);

    expect(elementWith(mapLibraryFolderTargetAttributes(target)).matches(selector)).toBe(true);
  });

  it("フォルダー行のセレクタは別の id・別の操作の行に一致しない", () => {
    const selector = mapLibraryFolderTargetSelector({
      kind: "folderRow",
      folderId: "f1",
      action: "rename",
    });

    expect(
      elementWith(
        mapLibraryFolderTargetAttributes({ kind: "folderRow", folderId: "f2", action: "rename" }),
      ).matches(selector),
    ).toBe(false);
    expect(
      elementWith(
        mapLibraryFolderTargetAttributes({ kind: "folderRow", folderId: "f1", action: "delete" }),
      ).matches(selector),
    ).toBe(false);
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

  it("特殊文字（\", \\, ], 改行）を含む ID でも querySelector が例外を投げず対象要素に一致する", () => {
    const trickyId = 'a"b\\c]d\ne';
    const container = document.createElement("div");

    const mapBtn = elementWith(
      mapLibraryListButtonAttributes({ kind: "row", mapId: trickyId, action: "open" }),
    );
    const folderBtn = elementWith(
      mapLibraryFolderTargetAttributes({ kind: "folderRow", folderId: trickyId, action: "rename" }),
    );
    container.append(mapBtn, folderBtn);

    const mapSelector = mapLibraryListButtonSelector({
      kind: "row",
      mapId: trickyId,
      action: "open",
    });
    const folderSelector = mapLibraryFolderTargetSelector({
      kind: "folderRow",
      folderId: trickyId,
      action: "rename",
    });

    expect(container.querySelector(mapSelector)).toBe(mapBtn);
    expect(container.querySelector(folderSelector)).toBe(folderBtn);
  });
});
