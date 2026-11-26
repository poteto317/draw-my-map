import { tokenHash } from "@/domain/share/tokenHash";
import { planShareLinkCreate } from "@/domain/share/planShareLinkCreate";

describe("planShareLinkCreate", () => {
  it("expires_at は常に null（Phase 37 は無期限）", () => {
    const planned = planShareLinkCreate({
      id: "link-1",
      sharedMapId: "map-1",
      token: "plain-token",
      secret: "hmac-secret",
    });
    expect(planned.expiresAt).toBeNull();
  });

  it("permission は view 固定で、token_hash は平文を保存しない", () => {
    const token = "plain-token";
    const secret = "hmac-secret";
    const planned = planShareLinkCreate({
      id: "link-1",
      sharedMapId: "map-1",
      token,
      secret,
    });
    expect(planned).toEqual({
      id: "link-1",
      sharedMapId: "map-1",
      tokenHash: tokenHash(token, secret),
      permission: "view",
      expiresAt: null,
    });
    expect(planned.tokenHash).not.toBe(token);
  });
});
