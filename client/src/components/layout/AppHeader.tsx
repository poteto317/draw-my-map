export function AppHeader() {
  return (
    <header className="flex items-center px-6 py-3 bg-white dark:bg-zinc-800 shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
        Draw My Map
      </h1>
      <span className="ml-4 text-sm text-zinc-400">
        ダブルクリックでノードを追加・Shift+ドラッグでノードを接続
      </span>
    </header>
  );
}
