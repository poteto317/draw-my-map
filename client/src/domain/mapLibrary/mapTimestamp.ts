export const UNKNOWN_MAP_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Date#toISOString と同じ形式（保存時に書く形式）の日時だけを正しい値として扱う。
function isIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

// ISO 形式の日時として読めない値は不明な日時へ補正し、補正したことを返す。
export function normalizeMapTimestamp(value: unknown): {
  value: string;
  repaired: boolean;
} {
  if (typeof value === "string" && isIsoTimestamp(value)) {
    return { value, repaired: false };
  }

  return { value: UNKNOWN_MAP_TIMESTAMP, repaired: true };
}

// ローカル時刻の「<label>: YYYY/MM/DD HH:mm」。toLocaleString は使わない。
function formatMapTimestampWithLabel(label: string, iso: string): string {
  const time = Date.parse(iso);

  if (!Number.isFinite(time) || iso === UNKNOWN_MAP_TIMESTAMP) {
    return `${label}: 不明`;
  }

  const date = new Date(time);
  return `${label}: ${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ローカル時刻の「更新: YYYY/MM/DD HH:mm」。toLocaleString は使わない。
export function formatMapUpdatedAt(iso: string): string {
  return formatMapTimestampWithLabel("更新", iso);
}

// ローカル時刻の「削除: YYYY/MM/DD HH:mm」。toLocaleString は使わない。
export function formatMapDeletedAt(iso: string): string {
  return formatMapTimestampWithLabel("削除", iso);
}
