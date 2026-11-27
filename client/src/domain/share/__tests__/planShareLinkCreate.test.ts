import { tokenHash } from "@/domain/share/tokenHash";
import { planShareLinkCreate } from "@/domain/share/planShareLinkCreate";

describe("planShareLinkCreate", () => {
  it("expires_at は常に null（無期限）", () => {
    const planned = planShareLinkCreate({
      id: "link-1",
      sharedMapId: "map-1",
      token: "plain-token",
      secret: "hmac-secret",
      permission: "view",
    });
    expect(planned.expiresAt).toBeNull();
  });

  it.each(["view", "comment", "edit"] as const)(
    "permission %j をそのまま保存し、token_hash は平文を保存しない",
    (permission) => {
      const token = "plain-token";
      const secret = "hmac-secret";
      const planned = planShareLinkCreate({
        id: "link-1",
        sharedMapId: "map-1",
        token,
        secret,
        permission,
      });
      expect(planned).toEqual({
        id: "link-1",
        sharedMapId: "map-1",
        tokenHash: tokenHash(token, secret),
        permission,
        expiresAt: null,
      });
      expect(planned.tokenHash).not.toBe(token);
    },
  );
});
