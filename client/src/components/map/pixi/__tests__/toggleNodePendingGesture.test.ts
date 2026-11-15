import type { PointerGesture, PointerSample } from "@/components/map/pixi/pointerGesture";
import { createToggleNodePendingGesture } from "@/components/map/pixi/toggleNodePendingGesture";

const pointer = (
  screenX: number,
  screenY: number,
  worldX = screenX,
  worldY = screenY,
): PointerSample => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x: screenX, y: screenY },
  world: { x: worldX, y: worldY },
});

describe("createToggleNodePendingGesture", () => {
  function createGesture(createActivatedDragGesture?: () => PointerGesture | null) {
    const onToggleNodeSelectionRef = { current: jest.fn() };
    const dragGesture = {
      move: jest.fn(),
      end: jest.fn(),
      cancel: jest.fn(),
      isActivated: () => true,
      activeNodeIds: () => [2],
    };
    const createActivatedDragGestureFn = jest.fn(
      createActivatedDragGesture ?? (() => dragGesture),
    );
    const gesture = createToggleNodePendingGesture({
      nodeId: 2,
      startSample: pointer(50, 50),
      onToggleNodeSelectionRef,
      createActivatedDragGesture: createActivatedDragGestureFn,
      dragThreshold: 4,
    });
    return {
      gesture,
      onToggleNodeSelectionRef,
      createActivatedDragGestureFn,
      dragGesture,
    };
  }

  it("未 activated の end は選択をトグルし、ドラッグ生成しない", () => {
    const { gesture, onToggleNodeSelectionRef, createActivatedDragGestureFn } = createGesture();

    gesture?.move(pointer(52, 50));
    expect(gesture?.isActivated?.()).toBe(false);
    gesture?.end(pointer(52, 50));

    expect(onToggleNodeSelectionRef.current).toHaveBeenCalledWith(2);
    expect(createActivatedDragGestureFn).not.toHaveBeenCalled();
  });

  it("しきい値超なら stage 側ファクトリでドラッグを生成し、トグルしない", () => {
    const { gesture, onToggleNodeSelectionRef, createActivatedDragGestureFn, dragGesture } =
      createGesture();

    gesture?.move(pointer(50, 60));
    expect(gesture?.isActivated?.()).toBe(true);
    expect(createActivatedDragGestureFn).toHaveBeenCalledTimes(1);
    expect(dragGesture.move).toHaveBeenCalled();

    gesture?.end(pointer(50, 80));
    expect(dragGesture.end).toHaveBeenCalled();
    expect(onToggleNodeSelectionRef.current).not.toHaveBeenCalled();
  });

  it("cancel は未 activated でもトグルしない", () => {
    const { gesture, onToggleNodeSelectionRef, createActivatedDragGestureFn } = createGesture();
    gesture?.cancel();
    expect(onToggleNodeSelectionRef.current).not.toHaveBeenCalled();
    expect(createActivatedDragGestureFn).not.toHaveBeenCalled();
  });

  it("cancel は activated 後に内側ドラッグを cancel する", () => {
    const { gesture, createActivatedDragGestureFn, dragGesture } = createGesture();
    gesture?.move(pointer(50, 60));
    expect(createActivatedDragGestureFn).toHaveBeenCalled();
    gesture?.cancel();
    expect(dragGesture.cancel).toHaveBeenCalled();
  });
});
