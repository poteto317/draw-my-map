"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

function isGroupedRadio(element: HTMLElement): element is HTMLInputElement {
  return (
    element instanceof HTMLInputElement &&
    element.type === "radio" &&
    element.name !== ""
  );
}

// 同じ name（同じフォーム）のラジオのまとまりは、ブラウザ標準の Tab と同じく止まる先を1つにする。
// 止まる先は選ばれているラジオ、無ければ Tab・Shift+Tab のどちらでもまとまりの先頭。
// （ブラウザは未選択のまとまりに Shift+Tab で入ると末尾に止まるが、一覧は向きに関係なく作るため合わせていない）
function keepOneRadioPerGroup(elements: HTMLElement[]): HTMLElement[] {
  const groups = new Map<HTMLFormElement | null, Map<string, HTMLInputElement[]>>();
  for (const element of elements) {
    if (!isGroupedRadio(element)) continue;
    const byName = groups.get(element.form) ?? new Map<string, HTMLInputElement[]>();
    groups.set(element.form, byName);
    byName.set(element.name, [...(byName.get(element.name) ?? []), element]);
  }
  return elements.filter((element) => {
    if (!isGroupedRadio(element)) return true;
    // 上のループで全ラジオを登録済みのため、まとまりは必ず見つかる（見つからなければ自分だけのまとまりとして扱う）
    const group = groups.get(element.form)?.get(element.name) ?? [element];
    const stop = group.find((radio) => radio.checked) ?? group[0];
    return element === stop;
  });
}

// 押すたびに数え直すため、呼び出しのたびに DOM から集める
export function listFocusableElements(container: HTMLElement): HTMLElement[] {
  return keepOneRadioPerGroup(
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) =>
        !element.hasAttribute("disabled") &&
        element.getAttribute("tabindex") !== "-1",
    ),
  );
}

function isComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

export function useDialogFocusTrap(options: {
  dialogRef: RefObject<HTMLElement | null>;
  overlayRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
}): void {
  const { dialogRef, overlayRef, onEscape } = options;
  const onEscapeRef = useRef(onEscape);

  useLayoutEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const overlay = overlayRef.current;
    if (dialog === null || overlay === null) return;

    let lastFocused: HTMLElement | null =
      document.activeElement instanceof HTMLElement &&
      dialog.contains(document.activeElement)
        ? document.activeElement
        : null;

    // 中で最後にフォーカスがあった要素へ戻す。使えなければ最初のフォーカス可能な要素
    const restoreFocus = () => {
      const focusable = listFocusableElements(dialog);
      const target =
        lastFocused !== null && focusable.includes(lastFocused)
          ? lastFocused
          : focusable[0];
      target?.focus();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && dialog.contains(target)) {
        lastFocused = target;
        return;
      }
      restoreFocus();
    };

    // 背景を押してもフォーカスを動かさず、閉じもしない。
    // pointerdown だけを止めても後に続く mousedown でフォーカスが body へ移るため、両方で止める
    const handleOverlayPress = (event: MouseEvent) => {
      if (event.target !== overlay) return;
      event.preventDefault();
      restoreFocus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isComposingKey(event)) return;

      if (event.key === "Escape") {
        // 押し続けると、戻った先の画面でも続けて Escape が届いてしまう
        if (event.repeat) return;
        onEscapeRef.current();
        return;
      }

      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const focusable = listFocusableElements(dialog);
      event.preventDefault();
      if (focusable.length === 0) return;

      const active = document.activeElement;
      const index =
        active instanceof HTMLElement ? focusable.indexOf(active) : -1;
      const step = event.shiftKey ? -1 : 1;
      const nextIndex =
        index === -1
          ? event.shiftKey
            ? focusable.length - 1
            : 0
          : (index + step + focusable.length) % focusable.length;
      focusable[nextIndex].focus();
    };

    document.addEventListener("focusin", handleFocusIn);
    overlay.addEventListener("pointerdown", handleOverlayPress);
    overlay.addEventListener("mousedown", handleOverlayPress);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      overlay.removeEventListener("pointerdown", handleOverlayPress);
      overlay.removeEventListener("mousedown", handleOverlayPress);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [dialogRef, overlayRef]);
}
