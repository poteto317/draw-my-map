import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from "react";

// 2つのボタンの片方が無効になったとき、フォーカスがそのボタンかbodyにあれば、もう一方が有効ならそちらへ移す
export function usePairedButtonFocusHandover(
  firstEnabled: boolean,
  secondEnabled: boolean,
): {
  firstRef: RefObject<HTMLButtonElement | null>;
  secondRef: RefObject<HTMLButtonElement | null>;
  handleFocus: (event: FocusEvent<HTMLButtonElement>) => void;
  handleBlur: (event: FocusEvent<HTMLButtonElement>) => void;
} {
  const firstRef = useRef<HTMLButtonElement>(null);
  const secondRef = useRef<HTMLButtonElement>(null);
  // 直前にフォーカスしていたボタン。無効化でbodyへフォーカスが戻るブラウザでも、どちらを押していたか分かるよう残す
  const focusedButtonRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    const focusedButton = focusedButtonRef.current;
    if (!focusedButton?.disabled) return;
    const activeElement = document.activeElement;
    if (activeElement !== focusedButton && activeElement !== document.body && activeElement !== null) return;
    const otherButton = focusedButton === firstRef.current ? secondRef.current : firstRef.current;
    if (!otherButton || otherButton.disabled) {
      // 移せる先が無いなら記録を捨てる。残すと、後で別の理由でボタンが有効になったときに誤ってフォーカスを奪う
      focusedButtonRef.current = null;
      return;
    }
    // 端に着いて押したボタンが無効になってもキーボードのフォーカスを失わないよう、もう一方の有効なボタンへ移す
    otherButton.focus();
  }, [firstEnabled, secondEnabled]);

  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    focusedButtonRef.current = event.currentTarget;
  }

  function handleBlur(event: FocusEvent<HTMLButtonElement>) {
    // 無効化によるblurでは記録を残し、ほかの要素へ移ったときだけ消す
    if (!event.currentTarget.disabled) focusedButtonRef.current = null;
  }

  return { firstRef, secondRef, handleFocus, handleBlur };
}
