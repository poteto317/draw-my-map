/** @jest-environment node */
import { planAiAssistSend, requestAiAssistReview } from "@/hooks/aiAssistSendPlan";
import { classifyReorderSimLayoutFromState, type AiAssistApi } from "@/services/aiAssist/aiAssistClient";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, label: "根" }),
  createTestNode({ id: 2, parentId: 1, label: "子" }),
];

describe("requestAiAssistReview", () => {
  it("child-candidates は API とレビュー組み立てを委譲する", async () => {
    const plan = planAiAssistSend("child-candidates", nodes, 1, {
      isProtectedMode: false,
      hasConflict: false,
      isExternallyDeleted: false,
      playingPresentation: false,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok || plan.kind !== "child-candidates") throw new Error("plan");

    const requestChildCandidates = jest.fn().mockResolvedValue([{ label: "新子" }]);
    const api: AiAssistApi = {
      fetchStatus: jest.fn(),
      requestBranchSummary: jest.fn(),
      requestImportanceSuggestions: jest.fn(),
      requestChildCandidates,
      requestMissingPerspectives: jest.fn(),
      requestClassifyReorder: jest.fn(),
      requestDuplicatePairs: jest.fn(),
    };

    const signal = new AbortController().signal;
    const review = await requestAiAssistReview(
      plan,
      {
        api,
        nodes,
        visibleNodeIds: new Set([1, 2]),
        mapId: "map-a",
        classifyReorderLayout: classifyReorderSimLayoutFromState({ layoutMode: "manual" }),
      },
      { signal },
    );

    expect(requestChildCandidates).toHaveBeenCalledWith(plan.input, { signal });
    expect(review.proposals).toHaveLength(1);
    expect(review.proposals[0]?.kind).toBe("add-child");
  });
});