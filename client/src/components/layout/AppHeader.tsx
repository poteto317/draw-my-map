export function AppHeader() {
  return (
    <header className="flex items-center px-6 py-3 bg-white dark:bg-zinc-800 shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
        Draw My Map
      </h1>
      <span className="ml-4 text-sm text-zinc-600 dark:text-zinc-400">
        空白ダブルクリックで追加・ノードダブルクリックで編集・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続
      </span>
    </header>
  );
}
