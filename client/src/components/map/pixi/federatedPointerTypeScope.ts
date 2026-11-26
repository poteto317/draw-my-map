let activePointerType = "mouse";

/** Pixi hitArea 判定より先に capture で更新する（usePixiApplication が配線） */
export function setFederatedPointerTypeForHitTest(pointerType: string) {
  activePointerType = pointerType;
}

export function getFederatedPointerTypeForHitTest(): string {
  return activePointerType;
}

export function resetFederatedPointerTypeForHitTest() {
  activePointerType = "mouse";
}