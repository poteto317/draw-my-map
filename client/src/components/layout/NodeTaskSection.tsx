"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { NODE_TAG_INPUT_MAX_LENGTH } from "@/domain/nodes/nodeTag";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { AttributeEditTarget, CommitTask } from "@/hooks/useNodeTaskAttributeEditing";
import type { NodeTask } from "@/types/node";

export function NodeTaskSection({ target, task, disabled, commitTask }: {
  target: AttributeEditTarget;
  task: NodeTask | undefined;
  disabled: boolean;
  commitTask: CommitTask;
}) {
  const [draft, setDraft] = useState(task);
  const [expected, setExpected] = useState(task);
  const [error, setError] = useState<string | null>(null);
  const [sequence, setSequence] = useState(0);
  const notice = useReannouncedNotice(sequence, error);
  const composing = useRef(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const checkpoint = useRef({ revision: target.documentRevision, disabled });

  useLayoutEffect(() => {
    const previous = checkpoint.current;
    checkpoint.current = { revision: target.documentRevision, disabled };
    if (previous.revision !== target.documentRevision || previous.disabled !== disabled) {
      // 同じノードの文書世代が変わっても、入力欄をマウントし直さない。
      setDraft(task);
      setExpected(task);
      setError(null);
    }
    if (task === undefined && restoreFocus.current) {
      restoreFocus.current = false;
      createButton.current?.focus();
    }
  }, [target.documentRevision, disabled, task]);

  function reset() {
    setDraft(task);
    setExpected(task);
    setError(null);
  }

  function change(next: NodeTask) {
    setDraft(next);
    setError(null);
  }

  function save(next: NodeTask | undefined) {
    if (disabled || composing.current) return;
    const result = commitTask(target, expected, next);
    if (result.ok) {
      setDraft(next);
      setExpected(next);
      setError(null);
      restoreFocus.current = next === undefined;
    } else {
      setError(result.reason);
      setSequence(previous => previous + 1);
    }
  }

  const value = draft ?? task;
  return <section aria-label="タスク" className="space-y-2 border-t border-slate-200 pt-3">
    <h3 className="text-sm font-semibold">タスク</h3>
    {task === undefined || value === undefined ? (
      <button type="button" ref={createButton} disabled={disabled} onClick={() => save({ completed: false })}>
        タスクにする
      </button>
    ) : (
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); save(value); }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) {
            event.preventDefault();
          }
        }}>
        <fieldset disabled={disabled} className="grid gap-2 text-sm">
          <label><input type="checkbox" checked={value.completed}
            onChange={event => change({ ...value, completed: event.target.checked })} /> 完了</label>
          <label>期限<input type="date" value={value.dueDate ?? ""}
            aria-invalid={error !== null} aria-describedby={notice ? `task-error-${target.nodeId}` : undefined}
            onChange={event => change({ ...value, dueDate: event.target.value || undefined })} /></label>
          <label>担当者<input type="text" value={value.assignee ?? ""} maxLength={NODE_TAG_INPUT_MAX_LENGTH}
            aria-invalid={error !== null} aria-describedby={notice ? `task-error-${target.nodeId}` : undefined}
            onChange={event => change({ ...value, assignee: event.target.value || undefined })} /></label>
          <div className="flex flex-wrap gap-2">
            <button type="submit">タスクを保存</button>
            <button type="button" onClick={reset}>キャンセル</button>
            <button type="button" onClick={() => save(undefined)}>タスクを解除</button>
          </div>
        </fieldset>
      </form>
    )}
    {notice && <p id={`task-error-${target.nodeId}`} role="alert" className="text-sm text-red-700">{notice}</p>}
  </section>;
}
