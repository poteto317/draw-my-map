import {
  createMapVisibilityAnimator,
  type MapVisibilityTarget,
} from "@/components/map/pixi/mapVisibilityAnimator";

type Scheduler = ReturnType<typeof createScheduler>;

function createScheduler() {
  let now = 0;
  let nextFrameId = 1;
  const callbacks = new Map<number, (time: number) => void>();
  return {
    now: () => now,
    setNow: (value: number) => { now = value; },
    requestFrame: jest.fn((callback: (time: number) => void) => {
      const id = nextFrameId++;
      callbacks.set(id, callback);
      return id;
    }),
    cancelFrame: jest.fn((id: number) => callbacks.delete(id)),
    runFrame: (id: number) => {
      const callback = callbacks.get(id);
      callbacks.delete(id);
      callback?.(now);
    },
    callbackFor: (id: number) => callbacks.get(id),
    frameId: () => [...callbacks.keys()][0],
  };
}

function createTarget(key: string) {
  const calls: string[] = [];
  const target: MapVisibilityTarget = {
    key,
    setOpacity: jest.fn((value: number) => calls.push(`opacity:${value}`)),
    setInteractive: jest.fn((enabled: boolean) => calls.push(`interactive:${enabled}`)),
    setRendered: jest.fn((rendered: boolean) => calls.push(`rendered:${rendered}`)),
  };
  return { target, calls };
}

function createAnimator(scheduler: Scheduler, targets: readonly MapVisibilityTarget[], reducedMotion = false) {
  const animator = createMapVisibilityAnimator({
    now: scheduler.now,
    requestFrame: scheduler.requestFrame,
    cancelFrame: scheduler.cancelFrame,
    reducedMotion: () => reducedMotion,
  });
  animator.replaceTargets(targets);
  return animator;
}

describe("createMapVisibilityAnimator", () => {
  it("hideは最初のframeより前にinteractionを無効化し、完了時にrenderを外す", () => {
    const scheduler = createScheduler();
    const { target, calls } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);
    animator.setVisibleKeys(new Set([target.key]));
    scheduler.setNow(160);
    scheduler.runFrame(scheduler.frameId());
    calls.length = 0;

    animator.setVisibleKeys(new Set());

    expect(calls[0]).toBe("interactive:false");
    scheduler.setNow(240);
    scheduler.runFrame(scheduler.frameId());
    expect(target.setOpacity).toHaveBeenLastCalledWith(0.125);
    scheduler.setNow(320);
    scheduler.runFrame(scheduler.frameId());
    expect(target.setRendered).toHaveBeenLastCalledWith(false);
  });

  it("showはrenderを先に有効化し、visible targetだけinteractiveにする", () => {
    const scheduler = createScheduler();
    const first = createTarget("node:1");
    const second = createTarget("node:2");
    const animator = createAnimator(scheduler, [first.target, second.target]);

    first.calls.length = 0;
    second.calls.length = 0;
    animator.setVisibleKeys(new Set([first.target.key]));

    expect(first.calls.slice(0, 2)).toEqual(["rendered:true", "interactive:true"]);
    expect(second.calls).not.toContain("interactive:true");
  });

  it("80msで反転すると現在のopacityを新しいtweenの起点にする", () => {
    const scheduler = createScheduler();
    const { target } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);
    animator.setVisibleKeys(new Set([target.key]));
    scheduler.setNow(80);
    scheduler.runFrame(scheduler.frameId());

    animator.setVisibleKeys(new Set());

    expect(target.setOpacity).toHaveBeenLastCalledWith(0.875);
    scheduler.setNow(160);
    scheduler.runFrame(scheduler.frameId());
    expect(target.setOpacity).toHaveBeenLastCalledWith(0.109375);
  });

  it("同じvisibleKeysの再通知では進行中tweenを開始し直さない", () => {
    const scheduler = createScheduler();
    const { target } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);
    animator.setVisibleKeys(new Set([target.key]));
    scheduler.setNow(80);
    scheduler.runFrame(scheduler.frameId());

    animator.setVisibleKeys(new Set([target.key]));
    scheduler.setNow(160);
    scheduler.runFrame(scheduler.frameId());

    expect(target.setOpacity).toHaveBeenLastCalledWith(1);
    expect(target.setInteractive).toHaveBeenLastCalledWith(true);
  });

  it("予定frame前に同じvisibleKeysを終端時刻で再通知するとendpointをtargetへ適用する", () => {
    const scheduler = createScheduler();
    const { target } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);
    animator.setVisibleKeys(new Set([target.key]));
    scheduler.setNow(160);

    animator.setVisibleKeys(new Set([target.key]));

    expect(target.setOpacity).toHaveBeenLastCalledWith(1);
    expect(target.setRendered).toHaveBeenLastCalledWith(true);
    expect(target.setInteractive).toHaveBeenLastCalledWith(true);
    expect(scheduler.cancelFrame).toHaveBeenCalledWith(1);
  });

  it("tween中にreduced motionへ変化して同じ目標を再通知すると即endpointへ確定する", () => {
    const scheduler = createScheduler();
    let reducedMotion = false;
    const { target } = createTarget("node:1");
    const animator = createMapVisibilityAnimator({
      now: scheduler.now,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      reducedMotion: () => reducedMotion,
    });
    animator.replaceTargets([target]);
    animator.setVisibleKeys(new Set([target.key]));
    scheduler.setNow(80);
    scheduler.runFrame(scheduler.frameId());
    reducedMotion = true;

    animator.setVisibleKeys(new Set([target.key]));

    expect(target.setOpacity).toHaveBeenLastCalledWith(1);
    expect(target.setRendered).toHaveBeenLastCalledWith(true);
    expect(target.setInteractive).toHaveBeenLastCalledWith(true);
    expect(scheduler.cancelFrame).toHaveBeenCalledWith(2);
  });

  it("別keyの変更では無関係なtargetの進行中tweenを巻き戻さない", () => {
    const scheduler = createScheduler();
    const first = createTarget("node:1");
    const second = createTarget("node:2");
    const animator = createAnimator(scheduler, [first.target, second.target]);
    animator.setVisibleKeys(new Set([first.target.key]));
    scheduler.setNow(80);
    scheduler.runFrame(scheduler.frameId());

    animator.setVisibleKeys(new Set([first.target.key, second.target.key]));
    scheduler.setNow(160);
    scheduler.runFrame(scheduler.frameId());

    expect(first.target.setOpacity).toHaveBeenLastCalledWith(1);
  });

  it("fromとtoが同じならendpointを即時適用しframeを要求しない", () => {
    const scheduler = createScheduler();
    const { target } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);
    animator.setVisibleKeys(new Set([target.key]));
    scheduler.setNow(160);
    scheduler.runFrame(scheduler.frameId());
    scheduler.requestFrame.mockClear();

    animator.setVisibleKeys(new Set([target.key]));

    expect(target.setOpacity).toHaveBeenLastCalledWith(1);
    expect(scheduler.requestFrame).not.toHaveBeenCalled();
  });

  it("fromとtoが0のhideは即時にrenderを外しframeを要求しない", () => {
    const scheduler = createScheduler();
    const { target } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);

    animator.setVisibleKeys(new Set());

    expect(target.setRendered).toHaveBeenLastCalledWith(false);
    expect(scheduler.requestFrame).not.toHaveBeenCalled();
  });

  it("frame前のshowからhideはfromとtoが0なので予約frameをcancelして即時に隠す", () => {
    const scheduler = createScheduler();
    const { target, calls } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);
    animator.setVisibleKeys(new Set([target.key]));
    calls.length = 0;

    animator.setVisibleKeys(new Set());

    expect(calls).toEqual([
      "interactive:false",
      "opacity:0",
      "rendered:false",
      "interactive:false",
    ]);
    expect(scheduler.cancelFrame).toHaveBeenCalledWith(1);
  });

  it("reduced motionではendpointを即時適用しframeを要求しない", () => {
    const scheduler = createScheduler();
    const { target } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target], true);

    animator.setVisibleKeys(new Set([target.key]));

    expect(target.setRendered).toHaveBeenLastCalledWith(true);
    expect(target.setOpacity).toHaveBeenLastCalledWith(1);
    expect(target.setInteractive).toHaveBeenLastCalledWith(true);
    expect(scheduler.requestFrame).not.toHaveBeenCalled();
  });

  it("replaceTargetsは全targetを同じ時刻でsampleする", () => {
    let currentTime = 0;
    const now = jest.fn(() => currentTime++);
    const scheduler = createScheduler();
    const first = createTarget("edge:2");
    const second = createTarget("node:2");
    const replacements = [createTarget("edge:2"), createTarget("node:2")];
    const animator = createMapVisibilityAnimator({
      now,
      requestFrame: scheduler.requestFrame,
      cancelFrame: scheduler.cancelFrame,
      reducedMotion: () => false,
    });
    animator.replaceTargets([first.target, second.target]);
    animator.setVisibleKeys(new Set([first.target.key, second.target.key]));
    currentTime = 82;
    now.mockClear();

    animator.replaceTargets(replacements.map(({ target }) => target));

    expect(now).toHaveBeenCalledTimes(1);
    expect(replacements[0].calls.filter((call) => call.startsWith("opacity:")).at(-1))
      .toBe(replacements[1].calls.filter((call) => call.startsWith("opacity:")).at(-1));
  });

  it("replaceTargetsは同じkeyの論理opacityをreplacementへ引き継ぐ", () => {
    const scheduler = createScheduler();
    const previous = createTarget("node:1");
    const replacement = createTarget("node:1");
    const animator = createAnimator(scheduler, [previous.target]);
    animator.setVisibleKeys(new Set([previous.target.key]));
    scheduler.setNow(80);
    scheduler.runFrame(scheduler.frameId());

    animator.replaceTargets([replacement.target]);

    expect(replacement.target.setRendered).toHaveBeenLastCalledWith(true);
    expect(replacement.target.setOpacity).toHaveBeenLastCalledWith(0.875);
    expect(replacement.target.setInteractive).toHaveBeenLastCalledWith(true);
  });

  it("replaceTargetsで除かれたkeyは再追加しても古い表示stateを引き継がない", () => {
    const scheduler = createScheduler();
    const previous = createTarget("node:1");
    const replacement = createTarget("node:1");
    const animator = createAnimator(scheduler, [previous.target]);
    animator.setVisibleKeys(new Set([previous.target.key]));
    scheduler.setNow(80);
    scheduler.runFrame(scheduler.frameId());

    animator.replaceTargets([]);
    animator.setVisibleKeys(new Set([previous.target.key]));
    animator.replaceTargets([replacement.target]);

    expect(replacement.target.setOpacity).toHaveBeenLastCalledWith(0);
    expect(replacement.target.setRendered).toHaveBeenLastCalledWith(false);
    expect(replacement.target.setInteractive).toHaveBeenLastCalledWith(false);
  });

  it("disposeは予約frameをcancelし、遅延callbackを無効化する", () => {
    const scheduler = createScheduler();
    const { target, calls } = createTarget("node:1");
    const animator = createAnimator(scheduler, [target]);
    animator.setVisibleKeys(new Set([target.key]));
    const frameId = scheduler.frameId();
    const callback = scheduler.callbackFor(frameId)!;
    const opacityCalls = calls.filter((call) => call.startsWith("opacity:")).length;

    animator.dispose();
    scheduler.setNow(80);
    callback(80);

    expect(scheduler.cancelFrame).toHaveBeenCalledWith(frameId);
    expect(calls.filter((call) => call.startsWith("opacity:"))).toHaveLength(opacityCalls);
  });
});
