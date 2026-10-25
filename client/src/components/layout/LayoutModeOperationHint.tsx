import type { NodeLayoutMode } from "@/types/nodeLayout";

type LayoutModeOperationHintProps = {
  layoutMode: NodeLayoutMode;
};

const operationHints: Record<NodeLayoutMode, string> = {
  manual:
    "空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更",
  auto:
    "空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・ノードドラッグで兄弟の順序を変更・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更",
};

export function LayoutModeOperationHint({
  layoutMode,
}: LayoutModeOperationHintProps) {
  return (
    <span className="text-sm text-zinc-600 dark:text-zinc-400">
      {operationHints[layoutMode]}
    </span>
  );
}
