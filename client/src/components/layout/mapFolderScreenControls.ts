import type { KeyboardEvent, MouseEvent } from "react";

// フォルダー管理の画面（一覧・名前変更・削除確認）で共有するボタンと入力欄の見た目と操作の抑止

export const folderScreenButtonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

export const folderScreenDangerButtonClassName =
  "shrink-0 rounded-md border border-red-600 px-3 py-1 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-red-400 dark:text-red-400 dark:hover:bg-zinc-700";

export const folderScreenInputClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";

export function suppressFormInputEnterKey(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Enter") return;
  // IME 変換中や押し続け（repeat）の Enter で意図せず送信しない（L-408, L-474）
  if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) {
    event.preventDefault();
  }
}

// ダブルクリックの 2 回目（detail > 1）では実行しない
export function guardSingleClick(handler: () => void) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return;
    handler();
  };
}
