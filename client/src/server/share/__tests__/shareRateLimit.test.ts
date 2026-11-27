/** @jest-environment node */

import { tokenHash } from "@/domain/share/tokenHash";
import {
  createShareRateLimiter,
  shareOwnerRateKey,
  shareViewRateKeys,
} from "@/server/share/shareRateLimit";

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

describe("shareViewRateKeys", () => {
  it("IP キーを先に、トークンは keyed hash のキーで返す（平文を載せない）", () => {
    const keys = shareViewRateKeys("203.0.113.1", "plain-token", "secret");
    expect(keys).toEqual([
      "view:ip:203.0.113.1",
      `view:${tokenHash("plain-token", "secret")}`,
    ]);
    expect(keys[1]).not.toContain("plain-token");
  });

  it("空トークンは view:empty の共有キーにする", () => {
    expect(shareViewRateKeys("unknown", "", "secret")).toEqual([
      "view:ip:unknown",
      "view:empty",
    ]);
  });
});

describe("shareOwnerRateKey", () => {
  it("ログイン中はユーザー ID のキーにする", () => {
    expect(shareOwnerRateKey({ userId: "user-1", email: "user-1@example.com" })).toBe("owner:user-1");
  });

  it("未ログインは owner:anonymous の共有キーにする", () => {
    expect(shareOwnerRateKey(null)).toBe("owner:anonymous");
  });
});
