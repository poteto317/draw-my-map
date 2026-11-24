/** ヘッダー配置コントロール共有型（様式・ツリー方向・間隔が参照） */

/** ヘッダーコントロールの disabled 理由（ツールチップ用） */
export type HeaderControlDisabledReason = "manual" | "radial" | "blocked" | null;

export type HeaderControlState = {
  visible: boolean;
  disabled: boolean;
};

export type TreeDirectionHeaderControlState = HeaderControlState & {
  disabledReason: HeaderControlDisabledReason;
};
