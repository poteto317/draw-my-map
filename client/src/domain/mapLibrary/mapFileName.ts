export type MapFileExtension = "json" | "png" | "svg" | "md" | "txt";

const FALLBACK_FILE_NAME_BASE = "draw-my-map";
const FORBIDDEN_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// ファイル名に使えない文字や名前を避けた、拡張子を除くファイル名の本体を返す。
export function toSafeFileNameBase(name: string): string {
  const base = name
    .replace(FORBIDDEN_FILE_NAME_CHARACTERS, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "");

  if (base === "") {
    return FALLBACK_FILE_NAME_BASE;
  }

  return WINDOWS_RESERVED_NAMES.test(base) ? `_${base}` : base;
}

export function formatMapFileTimestamp(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}-${time}`;
}

export function createMapFileName(
  mapName: string,
  extension: MapFileExtension,
  now: Date,
): string {
  return `${toSafeFileNameBase(mapName)}-${formatMapFileTimestamp(now)}.${extension}`;
}
