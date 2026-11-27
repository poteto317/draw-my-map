import {
  assertIssuableLinkPermission,
  linkPermissionAllowsComments,
  linkPermissionAllowsShareView,
  parseShareLinkPermission,
} from "@/domain/share/shareLinkPermission";

describe("parseShareLinkPermission", () => {
  it.each(["view", "comment", "edit"] as const)("%j はそのまま返す", (value) => {
    expect(parseShareLinkPermission(value)).toBe(value);
  });

  it.each(["", "View", "VIEW", "comment ", " view", "Edit"])(
    "%j は null（完全一致のみ）",
    (value) => {
      expect(parseShareLinkPermission(value)).toBeNull();
    },
  );
});

describe("assertIssuableLinkPermission", () => {
  it.each(["view", "comment", "edit"] as const)("%j は成功する", (value) => {
    expect(assertIssuableLinkPermission(value)).toEqual({ ok: true, value });
  });

  it.each(["", "View", "comment ", "Edit"])(
    "%j は invalid-permission で失敗する",
    (value) => {
      expect(assertIssuableLinkPermission(value)).toEqual({
        ok: false,
        reason: "invalid-permission",
      });
    },
  );
});

describe("linkPermissionAllowsComments", () => {
  it("comment のみ true", () => {
    expect(linkPermissionAllowsComments("comment")).toBe(true);
    expect(linkPermissionAllowsComments("view")).toBe(false);
    expect(linkPermissionAllowsComments("edit")).toBe(false);
  });
});

describe("linkPermissionAllowsShareView", () => {
  it("view / comment のみ true（edit は /collab）", () => {
    expect(linkPermissionAllowsShareView("view")).toBe(true);
    expect(linkPermissionAllowsShareView("comment")).toBe(true);
    expect(linkPermissionAllowsShareView("edit")).toBe(false);
  });
});
