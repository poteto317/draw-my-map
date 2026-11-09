import type { KeyboardEvent } from "react";

export function suppressBackupRestoreActionKey(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
    event.preventDefault();
  }
}
