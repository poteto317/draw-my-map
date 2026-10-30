import {
  applyTreeChangeWithOutcome,
  settleTreeChangeOutcome,
  type TreeChangeComputation,
} from "@/hooks/treeChangeOutcome";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type Result =
  | { ok: true; insertedId: number }
  | { ok: false; reason: "node-missing" | "placement-failed" };

type TreeUpdate = (currentNodes: readonly Node[], mode: NodeLayoutMode) => Node[] | null;

const CURRENT_NODES: readonly Node[] = [];
const NEXT_NODES: Node[] = [];

// 実際の applyTreeChange と同じく、コールバックの結果が null なら確定しない
function createApplyTreeChange(applyResult?: boolean) {
  const updateResults: (Node[] | null)[] = [];
  const applyTreeChange = (update: TreeUpdate): boolean => {
    const nextNodes = update(CURRENT_NODES, "auto");
    updateResults.push(nextNodes);
    return applyResult ?? nextNodes !== null;
  };
  return { applyTreeChange, updateResults };
}

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

describe("applyTreeChangeWithOutcome", () => {
  it("確定できたら、候補の nodes をコールバックから返し、outcome を返す", () => {
    const { applyTreeChange, updateResults } = createApplyTreeChange();
    const outcome: Result = { ok: true, insertedId: 7 };

    const result = applyTreeChangeWithOutcome<Result>(applyTreeChange, () => ({
      nodes: NEXT_NODES,
      outcome,
    }));

    expect(result).toBe(outcome);
    expect(updateResults).toHaveLength(1);
    expect(updateResults[0]).toBe(NEXT_NODES);
  });

  it("nodes が null の失敗は、コールバックから null を返し、outcome の理由を返す", () => {
    const { applyTreeChange, updateResults } = createApplyTreeChange();
    const outcome: Result = { ok: false, reason: "node-missing" };

    const result = applyTreeChangeWithOutcome<Result>(applyTreeChange, () => ({
      nodes: null,
      outcome,
    }));

    expect(result).toBe(outcome);
    expect(updateResults).toEqual([null]);
  });

  it("候補が成功でも applyTreeChange が false なら、placement-failed を返す", () => {
    const { applyTreeChange, updateResults } = createApplyTreeChange(false);

    const result = applyTreeChangeWithOutcome<Result>(applyTreeChange, () => ({
      nodes: NEXT_NODES,
      outcome: { ok: true, insertedId: 7 },
    }));

    expect(result).toEqual({ ok: false, reason: "placement-failed" });
    expect(updateResults[0]).toBe(NEXT_NODES);
  });

  it("applyTreeChange がコールバックを呼ばなければ、placement-failed を返し compute も呼ばない", () => {
    const compute = jest.fn<TreeChangeComputation<Result>, [readonly Node[], NodeLayoutMode]>();

    const result = applyTreeChangeWithOutcome<Result>(() => true, compute);

    expect(result).toEqual({ ok: false, reason: "placement-failed" });
    expect(compute).not.toHaveBeenCalled();
  });

  it("compute に currentNodes と mode をそのまま渡す", () => {
    const { applyTreeChange } = createApplyTreeChange();
    const compute = jest.fn<TreeChangeComputation<Result>, [readonly Node[], NodeLayoutMode]>(() => ({
      nodes: NEXT_NODES,
      outcome: { ok: true, insertedId: 7 },
    }));

    applyTreeChangeWithOutcome<Result>(applyTreeChange, compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute.mock.calls[0][0]).toBe(CURRENT_NODES);
    expect(compute.mock.calls[0][1]).toBe("auto");
  });
});
