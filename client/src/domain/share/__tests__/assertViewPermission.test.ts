import { assertViewPermission } from "@/domain/share/assertViewPermission";

describe("assertViewPermission", () => {
  it("permission が view なら成功する", () => {
    expect(assertViewPermission("view")).toEqual({ ok: true, value: undefined });
  });

  it.each(["edit", "comment", "", "VIEW", "view "])(
    "permission が %j なら拒否する",
    (permission) => {
      expect(assertViewPermission(permission)).toEqual({
        ok: false,
        reason: "invalid-permission",
      });
    },
  );
});
