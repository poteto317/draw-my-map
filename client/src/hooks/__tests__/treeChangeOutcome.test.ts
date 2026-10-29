import { settleTreeChangeOutcome } from "@/hooks/treeChangeOutcome";

type Result =
  | { ok: true; insertedId: number }
  | { ok: false; reason: "node-missing" | "placement-failed" };

describe("settleTreeChangeOutcome", () => {
  it("確定でき、候補が成功なら、その結果を返す", () => {
    const outcome: Result = { ok: true, insertedId: 7 };

    expect(settleTreeChangeOutcome(true, outcome)).toBe(outcome);
  });

  it("候補が失敗なら、確定の有無によらずその理由を返す", () => {
    const outcome: Result = { ok: false, reason: "node-missing" };

    expect(settleTreeChangeOutcome(false, outcome)).toBe(outcome);
    expect(settleTreeChangeOutcome(true, outcome)).toBe(outcome);
  });

  it("候補が成功でも確定できなければ、placement-failed を返す", () => {
    expect(settleTreeChangeOutcome<Result>(false, { ok: true, insertedId: 7 })).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("候補の結果が無ければ、placement-failed を返す", () => {
    expect(settleTreeChangeOutcome<Result>(false, null)).toEqual({
      ok: false,
      reason: "placement-failed",
    });
    expect(settleTreeChangeOutcome<Result>(true, null)).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });

  it("placement-failed の結果は呼び出しごとに別のオブジェクトにする", () => {
    const first = settleTreeChangeOutcome<Result>(false, null);
    const second = settleTreeChangeOutcome<Result>(false, null);

    expect(first).not.toBe(second);
  });
});
