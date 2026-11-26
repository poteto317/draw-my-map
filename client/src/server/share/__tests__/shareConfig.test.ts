/** @jest-environment node */

import { resolveSharePublicOrigin } from "@/server/share/shareConfig";

describe("resolveSharePublicOrigin", () => {
  it("CF_SHARE_PUBLIC_ORIGIN を最優先する", () => {
    expect(
      resolveSharePublicOrigin(
        {
          CF_SHARE_PUBLIC_ORIGIN: "https://share.example/",
          AUTH_URL: "https://auth.example",
          NEXT_PUBLIC_APP_URL: "https://app.example",
        },
        new Request("http://spoofed.example/api/share/maps", {
          headers: {
            "x-forwarded-host": "evil.example",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toBe("https://share.example");
  });

  it("env が無ければ request.url の origin を使い x-forwarded-* は見ない", () => {
    expect(
      resolveSharePublicOrigin(
        {},
        new Request("http://localhost:3000/api/share/maps", {
          headers: {
            "x-forwarded-host": "evil.example",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    ).toBe("http://localhost:3000");
  });

  it("AUTH_URL は CF_SHARE_PUBLIC_ORIGIN の次に使う", () => {
    expect(
      resolveSharePublicOrigin({
        AUTH_URL: "https://auth.example/api/auth",
        NEXT_PUBLIC_APP_URL: "https://app.example",
      }),
    ).toBe("https://auth.example");
  });
});
