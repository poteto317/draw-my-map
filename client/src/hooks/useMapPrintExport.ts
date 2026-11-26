"use client";

import { useEffect, useRef, useState } from "react";
import {
  EMPTY_MAP_PRINT_MESSAGE,
  MAP_PRINT_FAILURE_MESSAGES,
} from "@/domain/printExport/mapPrintMessages";
import { startMapPrint } from "@/services/printExport/printMapSvg";
import type { MapPrintResult, MapPrintSession, MapPrintSettings } from "@/types/mapPrintExport";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

type UseMapPrintExportOptions = {
  nodes: readonly Node[];
  mapName: string;
  enabled: boolean;
  disabledReason?: string;
  startPrint?: typeof startMapPrint;
};

export type MapPrintState = "idle" | "preparing" | "printing";

type ActivePrint = {
  state: Exclude<MapPrintState, "idle">;
  session?: MapPrintSession;
};

export function useMapPrintExport({
  nodes,
  mapName,
  enabled,
  disabledReason,
  startPrint = startMapPrint,
}: UseMapPrintExportOptions) {
  const [state, setState] = useState<MapPrintState>("idle");
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const activeRef = useRef<ActivePrint | null>(null);

  useEffect(() => () => {
    const active = activeRef.current;
    activeRef.current = null;
    active?.session?.cancel();
  }, []);

  function start(settings: MapPrintSettings) {
    if (activeRef.current !== null) return;
    if (!enabled) {
      setNotice({ kind: "warning", message: disabledReason ?? "この書き出し対象では使えません。" });
      return;
    }
    if (nodes.length === 0) {
      setNotice({ kind: "warning", message: EMPTY_MAP_PRINT_MESSAGE });
      return;
    }

    const active: ActivePrint = { state: "preparing" };
    activeRef.current = active;
    setState("preparing");
    setNotice(null);

    function complete(result: MapPrintResult) {
      if (activeRef.current !== active) return;
      activeRef.current = null;
      setState("idle");
      if (result.status === "failed") {
        setNotice({ kind: "error", message: MAP_PRINT_FAILURE_MESSAGES[result.reason] });
      } else if (result.status === "cancelled") {
        setNotice(null);
      }
    }

    try {
      active.session = startPrint({
        // SVG出力が参照する属性はプリミティブ。ノードと配列を開始時にコピーする。
        nodes: nodes.map((node) => ({ ...node })),
        mapName,
        settings: { ...settings, margins: { ...settings.margins } },
        onPrinting() {
          if (activeRef.current !== active || active.state !== "preparing") return;
          active.state = "printing";
          setState("printing");
          setNotice({
            kind: "status",
            message: "印刷画面を開きました。PDF保存は印刷画面で選択してください。",
          });
        },
      });
      void active.session.done.then(complete);
    } catch {
      complete({ status: "failed", reason: "preparation" });
    }
  }

  function cancel() {
    const active = activeRef.current;
    if (active?.state !== "preparing") return;
    activeRef.current = null;
    active.session?.cancel();
    setState("idle");
  }

  function finish() {
    const active = activeRef.current;
    if (active?.state === "printing") active.session?.finish();
  }

  return { state, notice, start, cancel, finish, clearNotice: () => setNotice(null) };
}
