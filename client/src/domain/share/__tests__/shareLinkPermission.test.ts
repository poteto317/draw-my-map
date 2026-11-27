import {
  assertIssuableLinkPermission,
  linkPermissionAllowsComments,
  parseShareLinkPermission,
} from "@/domain/share/shareLinkPermission";

describe("parseShareLinkPermission", () => {
  it.each(["view", "comment"] as const)("%j はそのまま返す", (value) => {
    expect(parseShareLinkPermission(value)).toBe(value);
  });

  it.each(["edit", "", "View", "VIEW", "comment ", " view"])(
    "%j は null（完全一致のみ）",
    (value) => {
      expect(parseShareLinkPermission(value)).toBeNull();
    },
  );
});

describe("assertIssuableLinkPermission", () => {
  it.each(["view", "comment"] as const)("%j は成功する", (value) => {
    expect(assertIssuableLinkPermission(value)).toEqual({ ok: true, value });
  });

  it.each(["edit", "", "View", "comment "])(
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
  });
});
