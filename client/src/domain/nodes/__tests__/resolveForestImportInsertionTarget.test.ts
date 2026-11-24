import { resolveForestImportInsertionTarget } from "@/domain/nodes/resolveForestImportInsertionTarget";

describe("resolveForestImportInsertionTarget", () => {
  it("ルート追加は revision に依存しない", () => {
    expect(
      resolveForestImportInsertionTarget({
        placement: "root",
        parentCandidateId: null,
        parentCandidateStale: true,
      }),
    ).toEqual({ ok: true, target: { kind: "root" } });
  });

  it("子追加は候補 ID が必要", () => {
    expect(
      resolveForestImportInsertionTarget({
        placement: "child",
        parentCandidateId: 5,
        parentCandidateStale: false,
      }),
    ).toEqual({ ok: true, target: { kind: "child", parentId: 5 } });
  });

  it("候補が無いか stale なら parent-missing", () => {
    expect(
      resolveForestImportInsertionTarget({
        placement: "child",
        parentCandidateId: null,
        parentCandidateStale: false,
      }),
    ).toEqual({ ok: false, reason: "parent-missing" });

    expect(
      resolveForestImportInsertionTarget({
        placement: "child",
        parentCandidateId: 3,
        parentCandidateStale: true,
      }),
    ).toEqual({ ok: false, reason: "parent-missing" });
  });
});