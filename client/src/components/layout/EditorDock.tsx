"use client";

import {
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { guardSingleClick } from "@/components/layout/mapFolderScreenControls";
import { useEditorDockOverflowMeasurement } from "@/components/layout/useEditorDockOverflowMeasurement";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";

export type EditorDockSlot = {
  readonly id: DockSlotId;
  readonly node: ReactNode;
};

export type EditorDockProps = {
  slots: readonly EditorDockSlot[];
  onCustomize: () => void;
  customizeButtonRef: RefObject<HTMLButtonElement | null>;
  isNarrowViewport: boolean;
  /**
   * 計測を飛ばして primary 件数を固定する（テスト用）。
   * 未指定時はコンテナ幅から算出する。
   */
  primarySlotCount?: number;
};

export function EditorDock({
  slots,
  onCustomize,
  customizeButtonRef,
  isNarrowViewport,
  primarySlotCount: primarySlotCountProp,
}: EditorDockProps) {
  const slotsRef = useRef<HTMLDivElement>(null);
  const overflowTriggerMeasureRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const measuredPrimaryCount = useEditorDockOverflowMeasurement({
    slots,
    slotsRef,
    overflowTriggerMeasureRef,
    // 狭幅でも横スクロール＋はみ出し分は「その他」へ送る。
    // slot gap は CSS `--editor-dock-slot-gap` を getComputedStyle で読む。
    enabled: primarySlotCountProp === undefined,
  });

  const primaryCount =
    primarySlotCountProp !== undefined
      ? Math.max(0, Math.min(primarySlotCountProp, slots.length))
      : (measuredPrimaryCount ?? slots.length);
  const primarySlots = slots.slice(0, primaryCount);
  const overflowSlots = slots.slice(primaryCount);

  // overflow が消えたら開閉状態も捨てる（再出現時にメニューが開いたままにしない）
  if (overflowSlots.length === 0 && overflowOpen) {
    setOverflowOpen(false);
  }

  return (
    <div
      className="editor-dock"
      data-testid="editor-dock"
      role="toolbar"
      aria-label="編集ドック"
    >
      <div
        ref={slotsRef}
        className={
          isNarrowViewport
            ? "editor-dock__slots editor-dock__slots--scroll"
            : "editor-dock__slots"
        }
        data-testid="editor-dock-slots"
      >
        {primarySlots.map((entry) => (
          <div key={entry.id} className="editor-dock__slot" data-slot-id={entry.id}>
            {entry.node}
          </div>
        ))}
        {overflowSlots.length > 0 && (
          <div className="editor-dock__overflow">
            <button
              type="button"
              className="editor-dock__overflow-trigger"
              aria-haspopup="true"
              aria-expanded={overflowOpen}
              onKeyDown={preventRepeatedActivationClick}
              onClick={guardSingleClick(() => setOverflowOpen((open) => !open))}
            >
              その他
            </button>
            {overflowOpen && (
              <div
                className="editor-dock__overflow-menu"
                role="group"
                aria-label="その他の操作"
              >
                {overflowSlots.map((entry) => (
                  <div
                    key={entry.id}
                    className="editor-dock__overflow-item"
                    data-slot-id={entry.id}
                  >
                    {entry.node}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* trigger 幅だけ測る（slot node は二重マウントしない） */}
      <button
        ref={overflowTriggerMeasureRef}
        type="button"
        className="editor-dock__overflow-trigger editor-dock__overflow-trigger--measure"
        tabIndex={-1}
        aria-hidden="true"
      >
        その他
      </button>

      <button
        ref={customizeButtonRef}
        type="button"
        className="editor-dock__customize"
        onKeyDown={preventRepeatedActivationClick}
        onClick={guardSingleClick(onCustomize)}
      >
        カスタマイズ
      </button>
    </div>
  );
}
