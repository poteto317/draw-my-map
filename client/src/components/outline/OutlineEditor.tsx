import type { TaskProgress } from "@/domain/nodes/nodeTaskProgress";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Node } from "@/types/node";
import type { OutlineRows } from "@/domain/outline/outlineRows";
import { resolveLabelTextPresentation } from "@/domain/nodes/labelTextStyle";
import {
  resolveLearnLabelDisplay,
  type LearnLabelDisplayContext,
} from "@/domain/map/mapLearnMode";
import type { OutlineEditorUiActions } from "@/hooks/useOutlineEditorActions";
import { OutlineRowAppearance } from "./OutlineRowAppearance";
import { OutlineToolbar } from "./OutlineToolbar";

function getOutlineLabelTextStyle(node: Node): {
  fontSize: string;
  fontWeight: "bold" | "normal";
  textDecoration: "underline" | "none";
} {
  const presentation = resolveLabelTextPresentation(node);
  return {
    fontSize: `${presentation.fontSize}px`,
    fontWeight: presentation.fontWeight,
    textDecoration: presentation.textDecoration,
  };
}

export type OutlineEditorProps = {
  learnDisplay: LearnLabelDisplayContext;
  taskProgress: ReadonlyMap<number, TaskProgress>;
  nodes: readonly Node[];
  model: OutlineRows;
  selectedNodeId: number | null;
  documentRevision: number;
  enabled: boolean;
  actions: OutlineEditorUiActions;
  onLearnRevealNode?: (nodeId: number) => void;
};

function isComposing(event: KeyboardEvent) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

function formatSelectionStatus(
  model: OutlineRows,
  nodeId: number,
  learnDisplay: LearnLabelDisplayContext,
): string | null {
  const index = model.rows.findIndex(row => row.nodeId === nodeId);
  if (index < 0) return null;
  const row = model.rows[index];
  const node = model.nodesById.get(nodeId);
  if (!node) return null;
  const { text } = resolveLearnLabelDisplay(node, learnDisplay);
  return `全${model.rows.length}件中${index + 1}件目、階層${row.depth}、${text}`;
}

export function OutlineEditor({
  model,
  learnDisplay,
  taskProgress,
  selectedNodeId,
  documentRevision,
  enabled,
  actions,
  onLearnRevealNode,
}: OutlineEditorProps) {
  const rowButtons = useRef(new Map<number, HTMLButtonElement>());
  const rootAddButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastScrolledSelection = useRef<number | null | undefined>(undefined);
  // 再表示時に残っている要求では表示切替ボタンからfocusを奪わない。
  const consumedSequence = useRef(actions.focusRequest?.sequence ?? 0);
  const [selectionStatus, setSelectionStatus] = useState<{ id: number | null; text: string }>({
    id: null,
    text: "",
  });
  const interactive = enabled && !model.duplicateIds;
  const draft = interactive && actions.draft?.documentRevision === documentRevision ? actions.draft : null;
  const draftNodeId = draft?.nodeId;
  const entryId = selectedNodeId !== null && model.allNodeIds.has(selectedNodeId) ? selectedNodeId : model.rows[0]?.nodeId;

  // 選択 ID 変化のみ live 文言を更新（同一 ID 再選択・空マップは据え置き）
  if (selectedNodeId !== null && selectedNodeId !== selectionStatus.id) {
    const next = formatSelectionStatus(model, selectedNodeId, learnDisplay);
    if (next !== null) {
      setSelectionStatus({ id: selectedNodeId, text: next });
    }
  }

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
    const nodeId = model.rows[index].nodeId;
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      if (
        learnDisplay.learningActive
        && selectedNodeId === nodeId
        && onLearnRevealNode
      ) {
        onLearnRevealNode(nodeId);
        return;
      }
      if (!learnDisplay.learningActive) actions.beginEdit(nodeId);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      if (!event.repeat && !learnDisplay.learningActive) actions.beginEdit(nodeId);
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

  return <section aria-label="アウトライン" data-outline-root className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
    <OutlineToolbar actions={actions} enabled={interactive} selectedNodeId={selectedNodeId} rootAddButtonRef={rootAddButtonRef} />
    <p role="status" aria-live="polite" className="sr-only">{selectionStatus.text}</p>
    <p className="text-sm text-slate-600">折りたたみや表示の細かさに関係なく、すべてのノードを表示します。兄弟追加は末尾に追加します。</p>
    <p id="outline-delete-description" className="text-sm text-slate-600">「ノードだけ削除」は子孫を残します。</p>
    {model.invalidStructure && <p role="alert" className="text-sm text-red-700">{model.duplicateIds ? "IDが重複しているため、選択と編集はできません。" : "親子関係に不正があるため、構造の変更はできません。ラベルは編集できます。"}</p>}
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      {model.rows.length === 0 ? <p>ノードがありません</p> : <ol className="min-w-0 space-y-1">
        {model.rows.map((row, index) => {
          const node = model.nodesById.get(row.nodeId)!;
          const { text: displayLabel, realLabelForWidth } = resolveLearnLabelDisplay(node, learnDisplay);
          const progress = taskProgress.get(row.nodeId);
          const progressLabel = progress ? `・完了率${progress.percent}%、残り${progress.remaining}件` : "";
          return <li key={row.nodeId} className="min-w-0" style={{ paddingInlineStart: `${(Math.min(row.depth, 12) - 1) * 1.25}rem` }}>
            <button type="button" aria-label={`階層${row.depth}・${displayLabel}${progressLabel}`} aria-pressed={selectedNodeId === row.nodeId}
              tabIndex={interactive && entryId === row.nodeId ? 0 : -1} disabled={!interactive}
              ref={element => { if (element) rowButtons.current.set(row.nodeId, element); else rowButtons.current.delete(row.nodeId); }}
              className="flex w-full min-w-0 items-stretch gap-2 whitespace-pre-wrap break-words rounded border border-slate-200 px-3 py-2 text-left aria-pressed:bg-blue-50"
              onClick={() => { if (interactive) actions.select(row.nodeId); }}
              onDoubleClick={() => { if (interactive && !learnDisplay.learningActive) actions.beginEdit(row.nodeId); }}
              onKeyDown={event => handleRowKey(event, index)}>
              <OutlineRowAppearance node={node} />
              <span className="mr-2 shrink-0 self-center text-xs text-slate-500">階層{row.depth}</span>
              <span
                className="min-w-0 self-center"
                style={{
                  ...getOutlineLabelTextStyle(node),
                  ...(displayLabel !== realLabelForWidth
                    ? { display: "inline-block", minWidth: `${Array.from(realLabelForWidth).length}ch` }
                    : {}),
                }}
              >
                {displayLabel}
                {progress && <span className="block text-xs text-slate-600">{progress.percent}%・残り{progress.remaining}件</span>}
              </span>
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
