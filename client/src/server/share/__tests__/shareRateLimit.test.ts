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

  it("take 時に期限切れバケットを GC し、size が減る", () => {
    let now = 1_000;
    const limiter = createShareRateLimiter({
      limit: 2,
      windowMs: 1_000,
      now: () => now,
    });
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("b")).toBe(true);
    expect(limiter.take("c")).toBe(true);
    expect(limiter.size()).toBe(3);

    now = 2_001;
    // 新しいキーの allow で期限切れ a/b/c を掃除し、d だけ残る
    expect(limiter.take("d")).toBe(true);
    expect(limiter.size()).toBe(1);
  });
});
