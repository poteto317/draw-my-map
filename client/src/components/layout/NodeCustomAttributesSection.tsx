"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import {
  buildCustomAttributeFromDraft,
  parseChoiceOptions,
  type CustomAttributeFormDraft,
} from "@/domain/nodes/nodeCustomAttributeUpdate";
import { NODE_TAG_INPUT_MAX_LENGTH, nodeTagKey } from "@/domain/nodes/nodeTag";
import type { AttributeEditTarget, CommitCustomAttribute } from "@/hooks/useNodeTaskAttributeEditing";
import type { NodeCustomAttribute } from "@/types/node";

type AttributeType = NodeCustomAttribute["type"];

type DraftState = {
  mode: "add" | "edit";
  editKey: string | null;
  original: NodeCustomAttribute | null;
  type: AttributeType;
  name: string;
  numberValue: string;
  dateValue: string;
  choiceOptions: string;
  choiceValue: string;
};

const EMPTY_DRAFT: DraftState = {
  mode: "add",
  editKey: null,
  original: null,
  type: "number",
  name: "",
  numberValue: "",
  dateValue: "",
  choiceOptions: "",
  choiceValue: "",
};

function draftFromAttribute(attribute: NodeCustomAttribute): DraftState {
  return {
    mode: "edit",
    editKey: nodeTagKey(attribute.name),
    original: attribute,
    type: attribute.type,
    name: attribute.name,
    numberValue: attribute.type === "number" ? String(attribute.value) : "",
    dateValue: attribute.type === "date" ? attribute.value : "",
    choiceOptions: attribute.type === "choice" ? `${attribute.options.join("\n")}\n` : "",
    choiceValue: attribute.type === "choice" ? attribute.value : "",
  };
}

function formDraftFromState(draft: DraftState): CustomAttributeFormDraft {
  return {
    type: draft.type,
    name: draft.name,
    numberValue: draft.numberValue,
    dateValue: draft.dateValue,
    choiceOptions: draft.choiceOptions,
    choiceValue: draft.choiceValue,
  };
}

export function NodeCustomAttributesSection({
  target,
  customAttributes,
  disabled,
  commitCustomAttribute,
  getAttributeGeneration,
}: {
  target: AttributeEditTarget;
  customAttributes: readonly NodeCustomAttribute[] | undefined;
  disabled: boolean;
  commitCustomAttribute: CommitCustomAttribute;
  getAttributeGeneration: (key: string) => number;
}) {
  const attributes = customAttributes ?? [];
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sequence, setSequence] = useState(0);
  const notice = useReannouncedNotice(sequence, error);
  const composing = useRef(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const checkpoint = useRef({ revision: target.documentRevision, disabled });

  useLayoutEffect(() => {
    const previous = checkpoint.current;
    checkpoint.current = { revision: target.documentRevision, disabled };
    if (previous.revision !== target.documentRevision || previous.disabled !== disabled) {
      setDraft(null);
      setError(null);
      setSequence((value) => value + 1);
    }
  }, [target.documentRevision, disabled]);

  const parsedChoiceOptions = useMemo(() => {
    if (draft?.type !== "choice") return [];
    const result = parseChoiceOptions(draft.choiceOptions);
    return result.ok ? [...result.value] : [];
  }, [draft]);

  function beginAdd() {
    setDraft({ ...EMPTY_DRAFT });
    setError(null);
  }

  function beginEdit(attribute: NodeCustomAttribute) {
    setDraft(draftFromAttribute(attribute));
    setError(null);
  }

  function resetForm() {
    setDraft(null);
    setError(null);
  }

  function saveDraft() {
    if (disabled || composing.current || draft === null) return;
    const built = buildCustomAttributeFromDraft(formDraftFromState(draft));
    if (!built.ok) {
      setError(built.reason);
      setSequence((value) => value + 1);
      return;
    }
    const result = commitCustomAttribute(
      target,
      draft.editKey,
      draft.original,
      built.value,
      undefined,
    );
    if (result.ok) {
      setDraft(null);
      setError(null);
    } else {
      setError(result.reason);
      setSequence((value) => value + 1);
    }
  }

  function removeAttribute(attribute: NodeCustomAttribute, generation: number) {
    if (disabled) return;
    const result = commitCustomAttribute(
      target,
      nodeTagKey(attribute.name),
      attribute,
      null,
      generation,
    );
    if (result.ok) {
      setError(null);
      if (draft?.editKey === nodeTagKey(attribute.name)) setDraft(null);
      addButtonRef.current?.focus();
    } else {
      setError(result.reason);
      setSequence((value) => value + 1);
    }
  }

  return (
    <section aria-label="カスタム属性" className="space-y-2 border-t border-slate-200 pt-3">
      <h3 className="text-sm font-semibold">カスタム属性</h3>
      {attributes.length === 0 ? (
        <p className="text-sm text-zinc-500">カスタム属性はありません</p>
      ) : (
        <ul className="space-y-1">
          {attributes.map((attribute) => {
            const summary = attribute.type === "choice"
              ? `${attribute.name}（選択: ${attribute.value}）`
              : attribute.type === "date"
                ? `${attribute.name}（${attribute.value}）`
                : `${attribute.name}（${attribute.value}）`;
            const generation = getAttributeGeneration(nodeTagKey(attribute.name));
            return (
              <li key={nodeTagKey(attribute.name)} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm" title={summary}>{summary}</span>
                <button type="button" aria-label={`編集: ${attribute.name}`} disabled={disabled}
                  className="rounded px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-60"
                  onClick={() => beginEdit(attribute)}>編集</button>
                <button type="button" aria-label={`カスタム属性を削除: ${attribute.name}`} disabled={disabled}
                  className="rounded px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-60"
                  onClick={() => removeAttribute(attribute, generation)}>削除</button>
              </li>
            );
          })}
        </ul>
      )}

      {draft === null ? (
        <button type="button" ref={addButtonRef} disabled={disabled} onClick={beginAdd}>属性を追加</button>
      ) : (
        <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); saveDraft(); }}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) {
              event.preventDefault();
            }
          }}>
          <fieldset disabled={disabled} className="grid gap-2 text-sm">
            {draft.mode === "add" && (
              <label>種類
                <select aria-label="種類" value={draft.type}
                  onChange={(event) => setDraft({ ...draft, type: event.target.value as AttributeType })}>
                  <option value="number">数値</option>
                  <option value="date">日付</option>
                  <option value="choice">選択肢</option>
                </select>
              </label>
            )}
            <label>名前
              <input aria-label="名前" type="text" value={draft.name} maxLength={NODE_TAG_INPUT_MAX_LENGTH}
                aria-invalid={error !== null}
                onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(null); }} />
            </label>
            {draft.type === "number" && (
              <label>数値
                <input aria-label="数値" type="text" value={draft.numberValue}
                  aria-invalid={error !== null}
                  onChange={(event) => { setDraft({ ...draft, numberValue: event.target.value }); setError(null); }} />
              </label>
            )}
            {draft.type === "date" && (
              <label>日付
                <input aria-label="日付" type="date" value={draft.dateValue}
                  aria-invalid={error !== null}
                  onChange={(event) => { setDraft({ ...draft, dateValue: event.target.value }); setError(null); }} />
              </label>
            )}
            {draft.type === "choice" && (
              <>
                <label>候補
                  <textarea aria-label="候補" value={draft.choiceOptions}
                    aria-invalid={error !== null}
                    onChange={(event) => {
                      const choiceOptions = event.target.value;
                      const nextOptions = parseChoiceOptions(choiceOptions);
                      const nextValue = nextOptions.ok && nextOptions.value.includes(draft.choiceValue)
                        ? draft.choiceValue
                        : "";
                      setDraft({ ...draft, choiceOptions, choiceValue: nextValue });
                      setError(null);
                    }} />
                </label>
                <label>値
                  <select aria-label="値" value={draft.choiceValue}
                    aria-invalid={error !== null}
                    onChange={(event) => { setDraft({ ...draft, choiceValue: event.target.value }); setError(null); }}>
                    <option value="">選択してください</option>
                    {parsedChoiceOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit">保存</button>
              <button type="button" onClick={resetForm}>キャンセル</button>
            </div>
          </fieldset>
        </form>
      )}
      {notice && <p role="alert" className="text-sm text-red-700">{notice}</p>}
    </section>
  );
}