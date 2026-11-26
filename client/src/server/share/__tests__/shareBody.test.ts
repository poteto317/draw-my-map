/** @jest-environment node */

import { readShareBodyWithinLimit, SHARE_MAX_BODY_BYTES } from "@/server/share/shareBody";

describe("readShareBodyWithinLimit", () => {
  it("Content-Length が上限超なら本文を読まず too-large", async () => {
    const request = new Request("http://localhost/api/share/maps", {
      method: "POST",
      headers: { "content-length": String(SHARE_MAX_BODY_BYTES + 1) },
      body: "tiny",
    });
    expect(await readShareBodyWithinLimit(request)).toEqual({ kind: "too-large" });
  });

  it("実バイトが上限超なら途中で打ち切って too-large", async () => {
    const request = new Request("http://localhost/api/share/maps", {
      method: "POST",
      body: "x".repeat(32),
    });
    expect(await readShareBodyWithinLimit(request, 16)).toEqual({ kind: "too-large" });
  });
});
