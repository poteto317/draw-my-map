import type { Node } from "@/types/node";

export type MapPrintSettings = {
  paperSize: "a4" | "a3" | "letter";
  orientation: "portrait" | "landscape";
  margins: { top: number; right: number; bottom: number; left: number };
  pagination: "fit" | "tile";
};

export const DEFAULT_MAP_PRINT_SETTINGS: MapPrintSettings = Object.freeze({
  paperSize: "a4",
  orientation: "portrait",
  margins: Object.freeze({ top: 10, right: 10, bottom: 10, left: 10 }),
  pagination: "fit",
});

export type MapPrintPage = {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
};

export type MapPrintLayout = {
  paperWidthMm: number;
  paperHeightMm: number;
  contentWidthMm: number;
  contentHeightMm: number;
  columns: number;
  rows: number;
  pages: readonly MapPrintPage[];
};

export type MapPrintFailureReason =
  | "invalid-settings"
  | "page-limit"
  | "size-limit"
  | "preparation";

export type MapPrintResult =
  | { status: "dialog-closed" | "cancelled" }
  | { status: "failed"; reason: MapPrintFailureReason };

export type MapPrintSession = {
  done: Promise<MapPrintResult>;
  cancel: () => void;
  finish: () => void;
};

export type MapPrintOptions = {
  nodes: readonly Node[];
  mapName: string;
  settings: MapPrintSettings;
  onPrinting: () => void;
};
