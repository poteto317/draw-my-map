/** @jest-environment node */

import { createShareRateLimiter } from "@/server/share/shareRateLimit";

describe("createShareRateLimiter", () => {
  it("窓内の limit 回まで許可し、超過で拒否する", () => {
    let now = 1_000;
    const limiter = createShareRateLimiter({
      limit: 2,
      windowMs: 1_000,
      now: () => now,
    });
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    now = 2_001;
    expect(limiter.take("a")).toBe(true);
  });
});
