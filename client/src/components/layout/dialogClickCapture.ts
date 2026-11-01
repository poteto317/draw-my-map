// ダイアログの根に置く onClickCapture の処理。
// キーボード・支援技術のクリックは detail が 0 で、ダブルクリックの続きが無いので数えない。
// ダブルクリックの続き（detail > 1）も、閉じた後のキャンバスの押下と dblclick を無視するために数える。
// 続きの click は、1回目で画面が変わった後の同じ位置の要素（「キャンセル」や追加先のラベルなど）に届くので、
// ダイアログの中ではどの要素にも届けない。preventDefault でラベルによるラジオの選択も止める（L-408）。
// キーボードのクリック（detail 0）とマウスの1回目（detail 1）は通す
export function handleDialogClickCapture(
  event: Pick<MouseEvent, "detail" | "preventDefault" | "stopPropagation">,
  onMouseClick: () => void,
): void {
  if (event.detail > 0) onMouseClick();
  if (event.detail > 1) {
    event.preventDefault();
    event.stopPropagation();
  }
}
