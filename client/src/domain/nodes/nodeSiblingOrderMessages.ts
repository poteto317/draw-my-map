import type {
  ReorderSiblingResult,
  SiblingReorderDirection,
} from "@/domain/nodes/nodeSiblingOrder";
import type { OperationNotice } from "@/types/operationNotice";

const REORDER_FAILED_MESSAGE = "枝の順序を変更できませんでした。";
const showAllHint = (siblings: string) =>
  `隠れている${siblings}と入れ替えるには、表示を『すべて』に切り替えてください。`;

function describeDirection(direction: SiblingReorderDirection): string {
  switch (direction) {
    case "up":
      return "上";
    case "down":
      return "下";
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}

function describeEdge(direction: SiblingReorderDirection): string {
  switch (direction) {
    case "up":
      return "先頭";
    case "down":
      return "末尾";
    default: {
      const unreachable: never = direction;
      return unreachable;
    }
  }
}

function describeSiblings(isRoot: boolean): string {
  return isRoot ? "ルート" : "兄弟";
}

function formatAtEdge(
  direction: SiblingReorderDirection,
  hiddenBeyond: boolean,
  isRoot: boolean,
): string {
  const siblings = describeSiblings(isRoot);
  const base =
    `これ以上${describeDirection(direction)}へ移動できません（見えている${siblings}の${describeEdge(direction)}です）。`;
  return hiddenBeyond ? base + showAllHint(siblings) : base;
}

export function formatSiblingReorderNotice(result: ReorderSiblingResult): OperationNotice {
  switch (result.ok) {
    case true:
      return {
        kind: "status",
        message:
          `枝を${describeDirection(result.direction)}へ移動しました`
          + `（見えている${describeSiblings(result.isRoot)}の${result.visibleCount}件中${result.visibleIndex + 1}番目）。`,
      };
    case false:
      switch (result.reason) {
        case "at-edge":
          return {
            kind: "status",
            message: formatAtEdge(result.direction, result.hiddenBeyond, result.isRoot),
          };
        case "node-missing":
        case "node-hidden":
        case "invalid-target":
        case "placement-failed":
          return { kind: "error", message: REORDER_FAILED_MESSAGE };
        default: {
          const unreachable: never = result;
          return unreachable;
        }
      }
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}
