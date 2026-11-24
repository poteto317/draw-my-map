import {
  applyStateChangeWithOutcome,
  type StateChangeComputation,
} from "@/hooks/stateChangeOutcome";
import type { NodeMapLayoutContext } from "@/domain/nodes/nodeMapLayoutContext";
import type { NodeMapState } from "@/types/nodeMapState";

type Result =
  | { ok: true; survivorId: number }
  | { ok: false; reason: "node-missing" | "placement-failed" };

type StateUpdate = (
  current: NodeMapState,
  layout: NodeMapLayoutContext,
) => NodeMapState | null;

const CURRENT: NodeMapState = { layoutMode: "manual", nodes: [] };
const NEXT: NodeMapState = { layoutMode: "manual", nodes: [], relations: [] };

function createApplyStateChange(applyResult?: boolean) {
  const updateResults: (NodeMapState | null)[] = [];
  const applyStateChange = (update: StateUpdate): boolean => {
    const next = update(CURRENT, {});
    updateResults.push(next);
    return applyResult ?? next !== null;
  };
  return { applyStateChange, updateResults };
}

describe("applyStateChangeWithOutcome", () => {
  it("確定できたら、候補の state をコールバックから返し、outcome を返す", () => {
    const { applyStateChange, updateResults } = createApplyStateChange();
    const outcome: Result = { ok: true, survivorId: 7 };

    const result = applyStateChangeWithOutcome<Result>(applyStateChange, () => ({
      state: NEXT,
      outcome,
    }));

    expect(result).toBe(outcome);
    expect(updateResults).toEqual([NEXT]);
  });

  it("state が null の失敗は、コールバックから null を返し、outcome の理由を返す", () => {
    const { applyStateChange, updateResults } = createApplyStateChange();
    const outcome: Result = { ok: false, reason: "node-missing" };

    const result = applyStateChangeWithOutcome<Result>(applyStateChange, () => ({
      state: null,
      outcome,
    }));

    expect(result).toBe(outcome);
    expect(updateResults).toEqual([null]);
  });

  it("候補が成功でも applyStateChange が false なら、placement-failed を返す", () => {
    const { applyStateChange, updateResults } = createApplyStateChange(false);

    const result = applyStateChangeWithOutcome<Result>(applyStateChange, () => ({
      state: NEXT,
      outcome: { ok: true, survivorId: 7 },
    }));

    expect(result).toEqual({ ok: false, reason: "placement-failed" });
    expect(updateResults[0]).toBe(NEXT);
  });

  it("applyStateChange がコールバックを呼ばなければ、placement-failed を返し compute も呼ばない", () => {
    const compute = jest.fn<
      StateChangeComputation<Result>,
      [NodeMapState, NodeMapLayoutContext]
    >();

    const result = applyStateChangeWithOutcome<Result>(() => true, compute);

    expect(result).toEqual({ ok: false, reason: "placement-failed" });
    expect(compute).not.toHaveBeenCalled();
  });

  it("compute に current と layout をそのまま渡す", () => {
    const layout: NodeMapLayoutContext = {
      treeDirection: "tb",
      layoutSpacing: { childGap: 100, siblingGap: 32 },
    };
    const compute = jest.fn<
      StateChangeComputation<Result>,
      [NodeMapState, NodeMapLayoutContext]
    >(() => ({
      state: NEXT,
      outcome: { ok: true, survivorId: 7 },
    }));
    const applyStateChangeWithLayout = (update: StateUpdate): boolean => {
      const next = update(CURRENT, layout);
      return next !== null;
    };

    applyStateChangeWithOutcome<Result>(applyStateChangeWithLayout, compute);

    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute.mock.calls[0][0]).toBe(CURRENT);
    expect(compute.mock.calls[0][1]).toBe(layout);
  });
});
