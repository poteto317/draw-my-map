import {
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";
import { resolveDockOverflowPrimaryCount } from "@/domain/dock/resolveDockOverflowPrimaryCount";
import {
  isDockOverflowAutoMeasureSupported,
  readEditorDockSlotGapPx,
} from "@/components/layout/readEditorDockSlotGapPx";

export type EditorDockMeasurableSlot = {
  readonly id: DockSlotId;
};

/**
 * EditorDock の primary／overflow 分割用の幅計測。
 * レンダリング本体から分離し、ResizeObserver と幅キャッシュだけを担う。
 */
export function useEditorDockOverflowMeasurement(input: {
  readonly slots: readonly EditorDockMeasurableSlot[];
  readonly slotsRef: RefObject<HTMLElement | null>;
  readonly overflowTriggerMeasureRef: RefObject<HTMLElement | null>;
  readonly enabled: boolean;
  /** CSS gap。未指定時はコンテナの computed style、それも無ければ 0 */
  readonly slotGapPx?: number;
  /**
   * jsdom でも計測を回す（フック単体テスト用）。
   * 未指定時は jsdom では自動計測しない（結合テストの誤 overflow フレーク防止）。
   */
  readonly forceMeasure?: boolean;
}): number | null {
  const {
    slots,
    slotsRef,
    overflowTriggerMeasureRef,
    enabled,
    slotGapPx,
    forceMeasure = false,
  } = input;
  const slotWidthByIdRef = useRef<Map<string, number>>(new Map());
  const measuredKeyRef = useRef<string>("");
  // 計測結果はスロット ID 集合と紐づける。outline→map で集合が増えたとき、
  // 短いときの count が残って後ろのスロットが overflow に隠れるのを防ぐ
  const [measurement, setMeasurement] = useState<{
    readonly key: string;
    readonly count: number;
  } | null>(null);

  const slotIdsKey = slots.map((entry) => entry.id).join("\0");
  const measuredPrimaryCount =
    measurement !== null && measurement.key === slotIdsKey
      ? measurement.count
      : null;

  const measureEnabled =
    enabled && (forceMeasure || isDockOverflowAutoMeasureSupported());

  useLayoutEffect(() => {
    if (!measureEnabled) return;

    const container = slotsRef.current;
    if (container === null) return;
    const keyForUpdate = slotIdsKey;

    // スロット集合が変わったら幅キャッシュを捨て、outline→map で古い狭い幅を使わない
    if (measuredKeyRef.current !== keyForUpdate) {
      measuredKeyRef.current = keyForUpdate;
      slotWidthByIdRef.current.clear();
    }

    const update = () => {
      try {
        const slotEls = Array.from(
          container.querySelectorAll<HTMLElement>(
            ":scope > .editor-dock__slot[data-slot-id]",
          ),
        );
        for (const el of slotEls) {
          const id = el.getAttribute("data-slot-id");
          if (id !== null) {
            slotWidthByIdRef.current.set(id, el.getBoundingClientRect().width);
          }
        }

        const missingWidth = slots.some(
          (entry) => !slotWidthByIdRef.current.has(entry.id),
        );
        if (missingWidth) {
          // 未計測 ID があるときはいったん全 primary にして幅を取る（node の二重マウントはしない）
          setMeasurement({ key: keyForUpdate, count: slots.length });
          return;
        }

        const containerWidth = Math.max(
          container.clientWidth,
          container.getBoundingClientRect().width,
        );
        // レイアウト未確定（jsdom 既定・初回）ではオーバーフローしない
        if (containerWidth <= 0) {
          setMeasurement({ key: keyForUpdate, count: slots.length });
          return;
        }

        const triggerWidth =
          overflowTriggerMeasureRef.current?.getBoundingClientRect().width ?? 0;
        const measuredGapPx = readEditorDockSlotGapPx(container, slotGapPx);
        const primaryCount = resolveDockOverflowPrimaryCount({
          containerWidth,
          slotWidths: slots.map(
            (entry) => slotWidthByIdRef.current.get(entry.id) ?? 0,
          ),
          overflowTriggerWidth: triggerWidth,
          slotGapPx: measuredGapPx,
        });
        setMeasurement({ key: keyForUpdate, count: primaryCount });
      } catch {
        // getComputedStyle / RO 途中の例外では全表示に倒す（操作不能を避ける）
        setMeasurement({ key: keyForUpdate, count: slots.length });
      }
    };

    // ResizeObserver / rAF 経由で setState（effect 本体の同期 setState を避ける）
    const rafId = requestAnimationFrame(update);
    if (typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(rafId);
    }
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [
    slots,
    slotIdsKey,
    measureEnabled,
    slotsRef,
    overflowTriggerMeasureRef,
    slotGapPx,
  ]);

  useLayoutEffect(() => {
    const alive = new Set<string>(slots.map((entry) => entry.id));
    for (const id of [...slotWidthByIdRef.current.keys()]) {
      if (!alive.has(id)) slotWidthByIdRef.current.delete(id);
    }
  }, [slots]);

  return measuredPrimaryCount;
}
