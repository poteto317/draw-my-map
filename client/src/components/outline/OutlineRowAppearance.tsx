import type { Node } from "@/types/node";
import {
  NODE_KIND_BAR_CSS_VARS,
  NODE_KIND_BAR_WIDTH_PX,
} from "@/types/nodeKind";
import { NODE_ICON_DISPLAY_SIZE_PX } from "@/domain/nodes/nodeIcon";

type OutlineRowAppearanceProps = {
  node: Pick<Node, "icon" | "kind">;
};

/** アウトライン行の見た目（kind 色バー・icon）。行の選択・編集操作とは別責務 */
export function OutlineRowAppearance({ node }: OutlineRowAppearanceProps) {
  return (
    <>
      {node.kind !== undefined && (
        <span
          data-testid="node-kind-bar"
          aria-hidden
          className="shrink-0 self-stretch rounded-sm"
          style={{
            width: NODE_KIND_BAR_WIDTH_PX,
            backgroundColor: `var(${NODE_KIND_BAR_CSS_VARS[node.kind]})`,
          }}
        />
      )}
      {node.icon !== undefined && (
        <span
          aria-hidden
          className="shrink-0 self-center leading-none"
          style={{ fontSize: NODE_ICON_DISPLAY_SIZE_PX }}
        >
          {node.icon}
        </span>
      )}
    </>
  );
}
