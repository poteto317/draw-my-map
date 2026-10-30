import { getNodeDisplayLabel, truncateLabelByCodePoints } from "@/domain/nodes/nodeDisplayLabel";
import type { ChangeNodeIndentResult } from "@/domain/nodes/nodeIndent";
import type { OperationNotice } from "@/types/operationNotice";

export const NODE_INDENT_NOTICE_LABEL_MAX_CODE_POINTS = 20;

const INDENT_FAILED_MESSAGE = "枝の階層を変更できませんでした。";
const showAllHint = (siblings: string) =>
  `隠れている${siblings}の子にするには、表示を『すべて』に切り替えてください。`;

// 21コードポイント以上なら先頭20コードポイント + 「…」、20コードポイント以下はそのまま
function describeParent(label: string | null): string {
  const displayLabel = getNodeDisplayLabel(label ?? "");
  return `「${truncateLabelByCodePoints(displayLabel, NODE_INDENT_NOTICE_LABEL_MAX_CODE_POINTS)}」`;
}

function formatIndentAtEdge(hiddenBeyond: boolean, isRoot: boolean): string {
  const siblings = isRoot ? "ルート" : "兄弟";
  const base = `これ以上階層を下げられません（見えている直前の${siblings}がありません）。`;
  return hiddenBeyond ? base + showAllHint(siblings) : base;
}

export function formatNodeIndentNotice(result: ChangeNodeIndentResult): OperationNotice {
  switch (result.ok) {
    case true:
      switch (result.direction) {
        case "indent":
          return {
            kind: "status",
            message: `枝の階層を下げました（${describeParent(result.newParentLabel)}の子、第${result.depth}階層）。`,
          };
        case "outdent":
          return {
            kind: "status",
            message:
              result.newParentLabel === null
                ? "枝の階層を上げました（ルート、第1階層）。"
                : `枝の階層を上げました（${describeParent(result.newParentLabel)}の子、第${result.depth}階層）。`,
          };
        default: {
          const unreachable: never = result;
          return unreachable;
        }
      }
    case false:
      switch (result.reason) {
        case "at-edge":
          switch (result.direction) {
            case "indent":
              return {
                kind: "status",
                message: formatIndentAtEdge(result.hiddenBeyond, result.isRoot),
              };
            case "outdent":
              return { kind: "status", message: "これ以上階層を上げられません（ルートです）。" };
            default: {
              const unreachable: never = result;
              return unreachable;
            }
          }
        case "node-missing":
        case "node-hidden":
        case "invalid-structure":
        case "placement-failed":
          return { kind: "error", message: INDENT_FAILED_MESSAGE };
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
