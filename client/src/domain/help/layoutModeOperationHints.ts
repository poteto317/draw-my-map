import type { NodeLayoutMode } from "@/types/nodeLayout";

/**
 * レイアウトモード別の操作ヒント文言（/help の正本）。
 * 編集画面には常時表示しない。
 */
export const LAYOUT_MODE_OPERATION_HINTS: Readonly<
  Record<NodeLayoutMode, string>
> = Object.freeze({
  manual:
    "空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイールで移動・Ctrl/Cmd+ホイールまたはピンチまたは右下の＋−で拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入",
  auto:
    "空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・ノードドラッグで兄弟の順序を変更・空白ドラッグで移動・ホイールで移動・Ctrl/Cmd+ホイールまたはピンチまたは右下の＋−で拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入",
});
