import type { KeyboardEvent, RefObject } from "react";
import type { OutlineEditorActions } from "@/hooks/useOutlineEditorActions";

type OutlineToolbarProps = {
  actions: OutlineEditorActions;
  enabled: boolean;
  selectedNodeId: number | null;
  rootAddButtonRef: RefObject<HTMLButtonElement | null>;
};

// 長押しのネイティブclickだけを抑え、通常のEnter/Spaceはbuttonに任せる。
function preventRepeatedActivation(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
}

export function OutlineToolbar({ actions, enabled, selectedNodeId, rootAddButtonRef }: OutlineToolbarProps) {
  const buttons = [
    { name: "ルート追加", available: actions.canAddRoot, run: actions.addRoot, ref: rootAddButtonRef },
    { name: "子を追加", available: actions.canAddRelated, run: actions.addChild },
    { name: "兄弟を末尾に追加", available: actions.canAddRelated, run: actions.addSibling },
    { name: "ラベル編集", available: actions.canEdit && selectedNodeId !== null, run: () => { if (selectedNodeId !== null) actions.beginEdit(selectedNodeId); } },
    { name: "1つ上", available: actions.canMoveUp, run: () => actions.move("up") },
    { name: "1つ下", available: actions.canMoveDown, run: () => actions.move("down") },
    { name: "階層を下げる", available: actions.canIndent, run: () => actions.changeIndent("indent") },
    { name: "階層を上げる", available: actions.canOutdent, run: () => actions.changeIndent("outdent") },
    { name: "ノードだけ削除", available: actions.canDelete, run: actions.deleteSelected },
  ];
  return <div className="flex flex-wrap gap-2" role="group" aria-label="アウトライン操作">
    {buttons.map(button => <button key={button.name} type="button" ref={button.ref}
      className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
      disabled={!enabled || !button.available} onKeyDown={preventRepeatedActivation}
      onClick={() => { if (enabled && button.available) button.run(); }}
      aria-describedby={button.name === "ノードだけ削除" ? "outline-delete-description" : undefined}>{button.name}</button>)}
  </div>;
}
