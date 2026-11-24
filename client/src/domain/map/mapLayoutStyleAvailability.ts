import {
  isDocumentBlocked,
  isNonNodeSelection,
} from "@/domain/map/mapDocumentEditGuards";
import type { LayoutStyle } from "@/types/layoutStyle";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { EditorViewMode } from "@/domain/view/editorViewMode";

export type LayoutStyleGuardInput = {
  viewMode: EditorViewMode;
  isProtectedMode: boolean;
  hasConflict: boolean;
  isExternallyDeleted: boolean;
  canvasSelection?: MapCanvasSelection;
  layoutMode: NodeLayoutMode;
};

/** ヘッダーコントロールの disabled 理由（ツールチップ用） */
export type HeaderControlDisabledReason = "manual" | "radial" | "blocked" | null;

export type HeaderControlState = {
  visible: boolean;
  disabled: boolean;
};

export type TreeDirectionHeaderControlState = HeaderControlState & {
  disabledReason: HeaderControlDisabledReason;
};

function baseHeaderState(input: LayoutStyleGuardInput): HeaderControlState {
  if (input.viewMode !== "map") {
    return { visible: false, disabled: false };
  }
  return {
    visible: true,
    disabled: isDocumentBlocked(input) || isNonNodeSelection(input.canvasSelection),
  };
}

/** N1: ヘッダー「レイアウト様式」直交／放射 */
export function resolveLayoutStyleHeaderControl(
  input: LayoutStyleGuardInput,
): HeaderControlState {
  const base = baseHeaderState(input);
  if (!base.visible) return base;
  return {
    visible: true,
    disabled: base.disabled || input.layoutMode === "manual",
  };
}

export type TreeDirectionHeaderInput = LayoutStyleGuardInput & {
  layoutStyle: LayoutStyle | undefined;
};

function resolveTreeDirectionDisabledReason(
  input: TreeDirectionHeaderInput,
  documentOrSelectionBlocked: boolean,
): HeaderControlDisabledReason {
  if (documentOrSelectionBlocked) return "blocked";
  if (input.layoutMode === "manual") return "manual";
  if (input.layoutStyle === "radial") return "radial";
  return null;
}

/** N2: ヘッダー「ツリー方向」— radial 中も表示したまま disabled */
export function resolveTreeDirectionHeaderControl(
  input: TreeDirectionHeaderInput,
): TreeDirectionHeaderControlState {
  const base = baseHeaderState(input);
  if (!base.visible) {
    return { ...base, disabledReason: null };
  }
  const documentOrSelectionBlocked = isDocumentBlocked(input)
    || isNonNodeSelection(input.canvasSelection);
  const disabled = documentOrSelectionBlocked
    || input.layoutMode === "manual"
    || input.layoutStyle === "radial";
  return {
    visible: true,
    disabled,
    disabledReason: disabled
      ? resolveTreeDirectionDisabledReason(input, documentOrSelectionBlocked)
      : null,
  };
}

/** N3: ヘッダー「配置間隔」— radial 中も有効（manual は disabled） */
export function resolveLayoutSpacingHeaderControl(
  input: LayoutStyleGuardInput,
): HeaderControlState {
  const base = baseHeaderState(input);
  if (!base.visible) return base;
  return {
    visible: true,
    disabled: base.disabled || input.layoutMode === "manual",
  };
}
