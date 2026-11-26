import {
  calculateMapPrintLayout,
  MapPrintLayoutError,
  validateMapPrintSettings,
} from "@/domain/printExport/mapPrintLayout";
import { MAX_MAP_PRINT_SVG_BYTES } from "@/domain/printExport/mapPrintSettings";
import { createMapSvgExport } from "@/services/imageExport/createMapSvgExport";
import { createMapSvgBlob } from "@/services/imageExport/mapSvgArtifact";
import { createMapPrintDocument } from "@/services/printExport/mapPrintDocument";
import type { MapPrintOptions, MapPrintResult, MapPrintSession } from "@/types/mapPrintExport";

const PREPARATION_TIMEOUT_MS = 15_000;
const PREPARATION_FAILED = { status: "failed", reason: "preparation" } as const;

let hasActiveSession = false;

function createPrintFrame(): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "1px",
    height: "1px",
    border: "0",
    pointerEvents: "none",
  });
  return frame;
}

function loadPrintFrame(frame: HTMLIFrameElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    frame.addEventListener("load", () => resolve(), { once: true, signal });
    frame.addEventListener("error", () => reject(new Error("Print iframe failed to load")), {
      once: true, signal,
    });
    frame.src = "about:blank";
    document.body.append(frame);
  });
}

async function waitUntilReady<T>(
  pending: Promise<T> | undefined,
  signal: AbortSignal,
): Promise<T | undefined> {
  let abort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
  });
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    return await Promise.race([pending, aborted]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function preparePrintImages(
  doc: Document,
  signal: AbortSignal,
  buildDocument: () => HTMLImageElement[],
): Promise<void[]> {
  const pending = new Map<EventTarget, (loaded: boolean) => void>();
  const handleImageEvent = (event: Event) => {
    if (event.target) pending.get(event.target)?.(event.type === "load");
  };

  // Capture image events before assigning sources, since load does not bubble.
  doc.addEventListener("load", handleImageEvent, { capture: true, signal });
  doc.addEventListener("error", handleImageEvent, { capture: true, signal });

  const images = buildDocument();
  return Promise.all(images.map(async (image) => {
    await new Promise<void>((resolve, reject) => {
      const complete = (loaded: boolean) => {
        pending.delete(image);
        if (loaded && image.naturalWidth > 0) resolve();
        else reject(new Error("Print image failed to load"));
      };
      pending.set(image, complete);
      if (image.complete) complete(true);
    });
    signal.throwIfAborted();
    await image.decode?.();
  }));
}

export function startMapPrint({
  nodes,
  mapName,
  settings,
  onPrinting,
}: MapPrintOptions): MapPrintSession {
  if (hasActiveSession) {
    return {
      done: Promise.resolve(PREPARATION_FAILED),
      cancel: () => {},
      finish: () => {},
    };
  }
  hasActiveSession = true;

  const controller = new AbortController();
  const { signal } = controller;
  let frame: HTMLIFrameElement | undefined;
  let imageUrl: string | undefined;
  let printReturned = false;
  let receivedAfterPrint = false;
  let resolveDone!: (result: MapPrintResult) => void;
  const done = new Promise<MapPrintResult>((resolve) => { resolveDone = resolve; });

  function settle(result: MapPrintResult) {
    if (signal.aborted) return;

    clearTimeout(timer);
    controller.abort();
    try {
      frame?.remove();
    } catch {
      // Cleanup is best-effort and must preserve the result.
    }
    try {
      if (imageUrl !== undefined) URL.revokeObjectURL(imageUrl);
    } catch {
      // Release the session even if the browser cannot revoke its URL.
    }
    frame = undefined;
    imageUrl = undefined;
    hasActiveSession = false;
    resolveDone(result);
  }

  function finish() {
    if (printReturned) settle({ status: "dialog-closed" });
  }

  const deadline = performance.now() + PREPARATION_TIMEOUT_MS;
  const timer = setTimeout(() => settle(PREPARATION_FAILED), PREPARATION_TIMEOUT_MS);
  function checkPreparation() {
    signal.throwIfAborted();
    if (performance.now() >= deadline) throw new Error("Print preparation timed out");
  }

  async function prepareAndPrint() {
    validateMapPrintSettings(settings);
    if (nodes.length === 0) throw new Error("No nodes to print");

    await waitUntilReady(document.fonts?.ready, signal);
    checkPreparation();
    const svgDoc = createMapSvgExport(nodes);
    if (!svgDoc) throw new Error("Print SVG is unavailable");
    checkPreparation();
    const layout = calculateMapPrintLayout(svgDoc.width, svgDoc.height, settings);
    const blob = createMapSvgBlob(svgDoc.svg);
    if (blob.size > MAX_MAP_PRINT_SVG_BYTES) {
      settle({ status: "failed", reason: "size-limit" });
      return;
    }

    checkPreparation();
    imageUrl = URL.createObjectURL(blob);
    frame = createPrintFrame();
    await waitUntilReady(loadPrintFrame(frame, signal), signal);
    checkPreparation();

    const frameDoc = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDoc || !frameWindow || typeof frameWindow.print !== "function") {
      throw new Error("Print iframe is unavailable");
    }

    const url = imageUrl;
    const imagesReady = preparePrintImages(frameDoc, signal, () => (
      createMapPrintDocument(frameDoc, layout, settings, url, mapName)
    ));
    await waitUntilReady(Promise.all([imagesReady, frameDoc.fonts?.ready]), signal);

    checkPreparation();
    frameWindow.focus();
    checkPreparation();

    frameWindow.addEventListener("afterprint", () => {
      receivedAfterPrint = true;
      finish();
    }, { once: true, signal });
    clearTimeout(timer);
    frameWindow.print();
    if (signal.aborted) return;

    printReturned = true;
    onPrinting();
    if (receivedAfterPrint) finish();
  }

  void prepareAndPrint().catch((error: unknown) => {
    settle(error instanceof MapPrintLayoutError
      ? { status: "failed", reason: error.reason }
      : PREPARATION_FAILED);
  });

  return {
    done,
    cancel: () => settle({ status: "cancelled" }),
    finish,
  };
}
