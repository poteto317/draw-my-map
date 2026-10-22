export const DEFAULT_MAP_NAME = "無題のマップ";
export const MAX_MAP_NAME_LENGTH = 50;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export type MapNameValidation =
  { ok: true; name: string } | { ok: false; length: number; message: string };

// 制御文字を半角空白へ置き換え、前後の空白を除く。空なら既定の名前にする。
export function normalizeMapName(input: string): string {
  const normalized = input.replace(CONTROL_CHARACTERS, " ").trim();
  return normalized === "" ? DEFAULT_MAP_NAME : normalized;
}

// 長さはコードポイント数で数える（サロゲートペアを1文字とする）。
export function countMapNameLength(name: string): number {
  return Array.from(name).length;
}

export function validateMapNameInput(input: string): MapNameValidation {
  const name = normalizeMapName(input);
  const length = countMapNameLength(name);

  if (length > MAX_MAP_NAME_LENGTH) {
    return {
      ok: false,
      length,
      message: `マップ名は${MAX_MAP_NAME_LENGTH}文字以内で入力してください。（現在 ${length} 文字）`,
    };
  }

  return { ok: true, name };
}

// 保存済みの名前の読み込み用。正規化してから先頭50コードポイントへ切り詰める。
export function normalizeStoredMapName(raw: string): string {
  const truncated = Array.from(normalizeMapName(raw))
    .slice(0, MAX_MAP_NAME_LENGTH)
    .join("");
  return normalizeMapName(truncated);
}
