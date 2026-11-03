import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Node } from "@/types/node";
import type { OutlineRows } from "@/domain/outline/outlineRows";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { OutlineEditorActions } from "@/hooks/useOutlineEditorActions";
import { OutlineToolbar } from "./OutlineToolbar";

export type OutlineEditorProps = {
  nodes: readonly Node[];
  model: OutlineRows;
  selectedNodeId: number | null;
  documentRevision: number;
  enabled: boolean;
  actions: OutlineEditorActions;
};

function isComposing(event: KeyboardEvent) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

export function OutlineEditor({ model, selectedNodeId, documentRevision, enabled, actions }: OutlineEditorProps) {
  const rowButtons = useRef(new Map<number, HTMLButtonElement>());
  const rootAddButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastScrolledSelection = useRef<number | null | undefined>(undefined);
  // 再表示時に残っている要求では表示切替ボタンからfocusを奪わない。
  const consumedSequence = useRef(actions.focusRequest?.sequence ?? 0);
  const interactive = enabled && !model.duplicateIds;
  const draft = interactive && actions.draft?.documentRevision === documentRevision ? actions.draft : null;
  const draftNodeId = draft?.nodeId;
  const entryId = selectedNodeId !== null && model.allNodeIds.has(selectedNodeId) ? selectedNodeId : model.rows[0]?.nodeId;

  useEffect(() => {
    if (!enabled || lastScrolledSelection.current === selectedNodeId) return;
    lastScrolledSelection.current = selectedNodeId;
    if (selectedNodeId !== null) rowButtons.current.get(selectedNodeId)?.scrollIntoView?.({ block: "nearest" });
  }, [selectedNodeId, enabled]);

  useEffect(() => {
    if (draftNodeId !== undefined) textareaRef.current?.focus();
  }, [draftNodeId, documentRevision]);

  useEffect(() => {
    const request = actions.focusRequest;
    if (!request || request.sequence <= consumedSequence.current) return;
    consumedSequence.current = request.sequence;
    if (!interactive || request.documentRevision !== documentRevision) return;
    const target = request.target.kind === "root-add" ? rootAddButtonRef.current : rowButtons.current.get(request.target.nodeId);
    target?.focus();
    target?.scrollIntoView?.({ block: "nearest" });
  }, [actions.focusRequest, documentRevision, interactive]);

  function handleRowKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!interactive || isComposing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      if (!event.repeat) actions.beginEdit(model.rows[index].nodeId);
      return;
    }
    if (event.repeat && event.key === " ") { event.preventDefault(); return; }
    let next: number;
    switch (event.key) {
      case "ArrowUp": next = Math.max(0, index - 1); break;
      case "ArrowDown": next = Math.min(model.rows.length - 1, index + 1); break;
      case "Home": next = 0; break;
      case "End": next = model.rows.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const id = model.rows[next].nodeId;
    actions.select(id);
    rowButtons.current.get(id)?.focus();
  }

  function handleDraftKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!interactive || isComposing(event) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); actions.finishEdit(true); }
    else if (event.key === "Escape") { event.preventDefault(); actions.cancelEdit(); }
  }

  return <section aria-label="アウトライン" className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
    <OutlineToolbar actions={actions} enabled={interactive} selectedNodeId={selectedNodeId} rootAddButtonRef={rootAddButtonRef} />
    <p className="text-sm text-slate-600">折りたたみや表示の細かさに関係なく、すべてのノードを表示します。兄弟追加は末尾に追加します。</p>
    <p id="outline-delete-description" className="text-sm text-slate-600">「ノードだけ削除」は子孫を残します。</p>
    {model.invalidStructure && <p role="alert" className="text-sm text-red-700">{model.duplicateIds ? "IDが重複しているため、選択と編集はできません。" : "親子関係に不正があるため、構造の変更はできません。ラベルは編集できます。"}</p>}
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      {model.rows.length === 0 ? <p>ノードがありません</p> : <ol className="min-w-0 space-y-1">
        {model.rows.map((row, index) => {
          const node = model.nodesById.get(row.nodeId)!;
          const label = getNodeDisplayLabel(node.label);
          return <li key={row.nodeId} className="min-w-0" style={{ paddingInlineStart: `${(Math.min(row.depth, 12) - 1) * 1.25}rem` }}>
            <button type="button" aria-label={`階層${row.depth}・${label}`} aria-pressed={selectedNodeId === row.nodeId}
              tabIndex={interactive && entryId === row.nodeId ? 0 : -1} disabled={!interactive}
              ref={element => { if (element) rowButtons.current.set(row.nodeId, element); else rowButtons.current.delete(row.nodeId); }}
              className="w-full min-w-0 whitespace-pre-wrap break-words rounded border border-slate-200 px-3 py-2 text-left aria-pressed:bg-blue-50"
              onClick={() => { if (interactive) actions.select(row.nodeId); }}
              onDoubleClick={() => { if (interactive) actions.beginEdit(row.nodeId); }}
              onKeyDown={event => handleRowKey(event, index)}>
              <span className="mr-2 text-xs text-slate-500">階層{row.depth}</span>{label}
            </button>
            {draft?.nodeId === row.nodeId && <textarea aria-label="ラベル編集" ref={textareaRef} value={draft.text}
              className="mt-1 block min-h-24 w-full min-w-0 rounded border border-blue-500 p-2"
              onChange={event => { if (interactive) actions.setDraftText(event.target.value); }}
              onKeyDown={handleDraftKey} onBlur={() => { if (interactive) actions.finishEdit(false); }} />}
          </li>;
        })}
      </ol>}
    </div>
  </section>;
}
