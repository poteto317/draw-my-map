"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { DEFAULT_MAP_NAME, validateMapNameInput } from "@/domain/mapLibrary/mapName";

type MapLibraryNameFormProps = {
  mode: "create" | "rename";
  headingId: string;
  initialName: string; // 作成は ""、名前変更は今の名前
  inputRef: Ref<HTMLInputElement>;
  onSubmit: (nameInput: string) => void; // 検証を通った入力だけ
  onCancel: () => void;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

const labels = {
  create: { heading: "新しいマップ", submit: "作成" },
  rename: { heading: "マップ名を変更", submit: "変更" },
} as const;

export function MapLibraryNameForm({
  mode,
  headingId,
  initialName,
  inputRef,
  onSubmit,
  onCancel,
}: MapLibraryNameFormProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [nameInput, setNameInput] = useState(initialName);
  const formRef = useRef<HTMLFormElement>(null);

  // 開いたときだけ全選択する。フォーカスはダイアログが inputRef で当てる
  useLayoutEffect(() => {
    if (mode === "rename") formRef.current?.querySelector("input")?.select();
  }, [mode]);

  // 入力中にその場で検証し、理由を入力欄の下に出す（L-057）
  const validation = validateMapNameInput(nameInput);
  const errorMessage = validation.ok ? null : validation.message;
  const describedBy =
    [mode === "create" ? hintId : null, errorMessage === null ? null : errorId]
      .filter((id) => id !== null)
      .join(" ") || undefined;

  // 確定は送信の1か所だけで行い、blur では確定しない（L-473）
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validation.ok) return;
    onSubmit(nameInput);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // IME の変換中の Enter で送信しない（L-474）。
    // 押し続けの Enter（repeat）でも送信しない。ダイアログを開いたボタンで押し続けた Enter のリピートが、
    // 開いた直後のこの入力欄へ届いて意図せず作成・変更しないようにする（L-408）
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) {
      event.preventDefault();
    }
  };

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      noValidate
      onSubmit={handleSubmit}
    >
      <h2 id={headingId} className="text-base font-semibold">
        {labels[mode].heading}
      </h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          マップ名
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={nameInput}
          placeholder={mode === "create" ? DEFAULT_MAP_NAME : undefined}
          aria-invalid={errorMessage === null ? undefined : "true"}
          aria-describedby={describedBy}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          onChange={(event) => setNameInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {errorMessage !== null && (
          <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-300">
            {errorMessage}
          </p>
        )}
        {mode === "create" && (
          <p id={hintId} className="text-xs text-zinc-600 dark:text-zinc-400">
            空欄のときは「{DEFAULT_MAP_NAME}」になります。
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="submit" className={buttonClassName}>
          {labels[mode].submit}
        </button>
        <button type="button" className={buttonClassName} onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
