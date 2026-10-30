// ボタンの上で Enter を押し続けると、ブラウザはリピートのたびに click を合成する。
// 操作が連続して起きないよう、リピートの Enter だけ既定動作を止める（単発の Enter と Space は止めない）
export function preventRepeatedEnterClick(
  event: Pick<KeyboardEvent, "key" | "repeat" | "preventDefault">,
): void {
  if (event.key === "Enter" && event.repeat) event.preventDefault();
}
