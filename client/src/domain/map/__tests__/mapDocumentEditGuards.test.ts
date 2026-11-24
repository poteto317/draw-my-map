import {
  isDocumentBlocked,
  isNonNodeSelection,
} from "@/domain/map/mapDocumentEditGuards";

describe("isDocumentBlocked", () => {
  const clear = {
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
  };

  it("クリアなら false", () => {
    expect(isDocumentBlocked(clear)).toBe(false);
  });

  it("保護・競合・外部削除のいずれかで true", () => {
    expect(isDocumentBlocked({ ...clear, isProtectedMode: true })).toBe(true);
    expect(isDocumentBlocked({ ...clear, hasConflict: true })).toBe(true);
    expect(isDocumentBlocked({ ...clear, isExternallyDeleted: true })).toBe(true);
  });
});

describe("isNonNodeSelection", () => {
  it("関連線・グループ選択で true", () => {
    expect(isNonNodeSelection({ type: "relation", id: 1 })).toBe(true);
    expect(isNonNodeSelection({ type: "group", id: 2 })).toBe(true);
  });

  it("ノード選択・未選択は false", () => {
    expect(isNonNodeSelection({ type: "nodes", ids: [1] })).toBe(false);
    expect(isNonNodeSelection(null)).toBe(false);
    expect(isNonNodeSelection(undefined)).toBe(false);
  });
});
