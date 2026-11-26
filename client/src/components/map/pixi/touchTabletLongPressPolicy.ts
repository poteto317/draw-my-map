import type { TouchGestureCoordinator } from "@/components/map/pixi/touchGestureCoordinator";

/** 2 本指・ピンチ中は単指の長押しコンテキストを開始しない（設計 §4.3・coordinator 契約） */
export function canStartTouchLongPressContext(
  coordinator: TouchGestureCoordinator,
  activeTouchCount: number,
): boolean {
  return activeTouchCount <= 1 && !coordinator.hasActivePinch();
}