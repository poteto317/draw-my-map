import { subtreeCollapseActionAvailability } from "@/domain/nodes/subtreeCollapseAvailability";

it("折りたたみ可能なIDの展開・折りたたみ可否を判定する", () => {
  expect(subtreeCollapseActionAvailability([2, 3], new Set([2]))).toEqual({
    canExpand: true,
    canCollapse: true,
  });
  expect(subtreeCollapseActionAvailability([2, 3], new Set([2, 3]))).toEqual({
    canExpand: true,
    canCollapse: false,
  });
  expect(subtreeCollapseActionAvailability([2, 3], new Set())).toEqual({
    canExpand: false,
    canCollapse: true,
  });
  expect(subtreeCollapseActionAvailability([], new Set([1]))).toEqual({
    canExpand: false,
    canCollapse: false,
  });
});
