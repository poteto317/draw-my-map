import {
  COLLAB_WS_AUTH_TIMEOUT_MS,
  armWsAuthTimeout,
} from "../src/wsAuthTimeout";

describe("armWsAuthTimeout", () => {
  it("既定タイムアウトは 5 秒", () => {
    expect(COLLAB_WS_AUTH_TIMEOUT_MS).toBe(5_000);
  });

  it("未認証のまま期限超過なら close(4401)", () => {
    const closes: Array<{ code?: number; reason?: string }> = [];
    const socket = {
      close(code?: number, reason?: string) {
        closes.push({ code, reason });
      },
    };
    const scheduled: { fn: () => void; ms: number }[] = [];
    armWsAuthTimeout(
      socket,
      () => false,
      5_000,
      (fn, ms) => {
        scheduled.push({ fn, ms });
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      () => {},
    );
    expect(scheduled[0]?.ms).toBe(5_000);
    scheduled[0]?.fn();
    expect(closes).toEqual([{ code: 4401, reason: "unauthorized" }]);
  });

  it("期限内に認証済みなら close しない", () => {
    const closes: Array<{ code?: number; reason?: string }> = [];
    const socket = {
      close(code?: number, reason?: string) {
        closes.push({ code, reason });
      },
    };
    const scheduled: Array<() => void> = [];
    armWsAuthTimeout(
      socket,
      () => true,
      5_000,
      (fn) => {
        scheduled.push(fn);
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
      () => {},
    );
    scheduled[0]?.();
    expect(closes).toEqual([]);
  });

  it("clear でタイマーをキャンセルできる", () => {
    let cleared = false;
    const clear = armWsAuthTimeout(
      { close() {} },
      () => false,
      5_000,
      () => 42 as unknown as ReturnType<typeof setTimeout>,
      (id) => {
        expect(id).toBe(42);
        cleared = true;
      },
    );
    clear();
    expect(cleared).toBe(true);
  });
});
