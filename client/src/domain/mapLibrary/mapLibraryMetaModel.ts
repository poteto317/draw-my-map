export const MAX_MAP_FOLDERS = 50;
export const MAX_MAP_FOLDER_NAME_LENGTH = 50;
export const MAX_MAP_FOLDER_NAME_INPUT_LENGTH = 256;
export const MAX_RECENT_MAPS = 20;
export const MAP_FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const DEFAULT_MAX_FOLDER_ID_ATTEMPTS = 10;

// 連続する空白（タブ・改行・全角空白 U+3000・NBSP・BOM を含む \s）
const WHITESPACE_RUN = /\s+/g;

// nodeTag.ts と同一の不可視書式文字集合（U+200D / U+FE0E / U+FE0F のみ例外許可）
const INVISIBLE_FORMAT = /[\p{Default_Ignorable_Code_Point}\u{FFF9}-\u{FFFB}]/u;
const IGNORED_IN_FOLDER_NAME_KEY = /[\u200d\ufe0e\ufe0f]/gu;

export type MapFolder = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MapUserMeta = {
  readonly favorite?: boolean;
  readonly lastOpenedAt?: string;
  readonly folderId?: string;
};

export type MapLibraryMetaV1 = {
  readonly version: 1;
  readonly folders: readonly MapFolder[];
  readonly mapMeta: Readonly<Record<string, MapUserMeta>>;
};

export type MapLibraryMetaStatus = "ready" | "corrupt" | "unavailable";

export type MapListTab = "all" | "favorites" | "recent";

export type MapListFolderFilter =
  | { readonly kind: "all" }
  | { readonly kind: "unclassified" }
  | { readonly kind: "folder"; readonly folderId: string };

export type MapListFilter = {
  readonly tab: MapListTab;
  readonly folderFilter: MapListFolderFilter;
};

export type MapFolderNameFailureReason = "empty" | "too-long" | "invalid";

export type MapFolderNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: MapFolderNameFailureReason };

export type MapFolderFailureReason =
  | MapFolderNameFailureReason
  | "duplicate"
  | "too-many"
  | "folder-missing"
  | "invalid-id";

export type DecodeMapLibraryMetaResult =
  | {
      readonly ok: true;
      readonly meta: MapLibraryMetaV1;
      readonly repaired: boolean;
    }
  | { readonly ok: false; readonly reason: "corrupt" };

export type AssignMapFolderResult =
  | { readonly ok: true; readonly meta: MapLibraryMetaV1 }
  | { readonly ok: false; readonly reason: "folder-missing" };

export type CreateMapFolderFailureReason =
  | MapFolderNameFailureReason
  | "duplicate"
  | "too-many"
  | "invalid-id";

export type CreateMapFolderResult =
  | {
      readonly ok: true;
      readonly meta: MapLibraryMetaV1;
      readonly folder: MapFolder;
    }
  | { readonly ok: false; readonly reason: CreateMapFolderFailureReason };

export type RenameMapFolderFailureReason =
  | MapFolderNameFailureReason
  | "duplicate"
  | "folder-missing";

export type RenameMapFolderResult =
  | {
      readonly ok: true;
      readonly meta: MapLibraryMetaV1;
      readonly folder: MapFolder;
    }
  | { readonly ok: false; readonly reason: RenameMapFolderFailureReason };

export type DeleteMapFolderResult =
  | { readonly ok: true; readonly meta: MapLibraryMetaV1 }
  | { readonly ok: false; readonly reason: "folder-missing" };

export type MergeLibraryMetaForRestoreResult = {
  readonly meta: MapLibraryMetaV1;
  readonly droppedFolderCount: number;
};

export type ValidateBackupLibraryMetaResult =
  | {
      readonly ok: true;
      readonly folders?: MapFolder[];
      readonly mapMeta?: Record<string, MapUserMeta>;
    }
  | { readonly ok: false; readonly error: string };

export type ValidateCreateMapFolderNameResult =
  | { readonly ok: true; readonly name: string }
  | {
      readonly ok: false;
      readonly reason: MapFolderNameFailureReason | "duplicate" | "too-many";
    };

export type ValidateRenameMapFolderNameResult =
  | { readonly ok: true; readonly name: string }
  | {
      readonly ok: false;
      readonly reason: MapFolderNameFailureReason | "duplicate";
    };

export function isValidMapFolderId(value: unknown): value is string {
  return typeof value === "string" && MAP_FOLDER_ID_PATTERN.test(value);
}

// 共有定数参照を避け、呼び出しごとに新しいオブジェクト・配列を返す（L-461）
export function createEmptyMapLibraryMeta(): MapLibraryMetaV1 {
  return {
    version: 1,
    folders: [],
    mapMeta: {},
  };
}

function isAllowedInvisibleCodePoint(codePoint: number): boolean {
  return codePoint === 0x200d || codePoint === 0xfe0e || codePoint === 0xfe0f;
}

function isControlCodeUnit(code: number): boolean {
  return (
    code <= 0x08 ||
    (code >= 0x0e && code <= 0x1f) ||
    (code >= 0x7f && code <= 0x9f)
  );
}

function hasForbiddenCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isControlCodeUnit(value.charCodeAt(index))) return true;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      INVISIBLE_FORMAT.test(character) &&
      !isAllowedInvisibleCodePoint(codePoint)
    ) {
      return true;
    }
  }
  return false;
}

// 重複判定鍵（U+200D/U+FE0E/U+FE0F を除く → NFKC → 連続空白まとめ・trim → 小文字化 → NFKC）
export function mapFolderNameKey(name: string): string {
  return name
    .replace(IGNORED_IN_FOLDER_NAME_KEY, "")
    .normalize("NFKC")
    .replace(WHITESPACE_RUN, " ")
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}

// フォルダー名を正規化する。先行長 256（L-443）・制御/不可視書式文字・空鍵・コードポイント数 50 上限（L-836）を検査する
export function normalizeMapFolderName(raw: string): MapFolderNameResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_MAP_FOLDER_NAME_INPUT_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  const collapsed = trimmed.replace(WHITESPACE_RUN, " ");
  if (hasForbiddenCharacter(collapsed)) return { ok: false, reason: "invalid" };
  if (mapFolderNameKey(collapsed) === "") return { ok: false, reason: "invalid" };
  if (Array.from(collapsed).length > MAX_MAP_FOLDER_NAME_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, name: collapsed };
}

export function validateCreateMapFolderName(
  folders: readonly MapFolder[],
  rawName: string,
): ValidateCreateMapFolderNameResult {
  const normalized = normalizeMapFolderName(rawName);
  if (!normalized.ok) {
    return normalized;
  }
  const key = mapFolderNameKey(normalized.name);
  if (folders.some((folder) => mapFolderNameKey(folder.name) === key)) {
    return { ok: false, reason: "duplicate" };
  }
  if (folders.length >= MAX_MAP_FOLDERS) {
    return { ok: false, reason: "too-many" };
  }
  return { ok: true, name: normalized.name };
}

export function validateRenameMapFolderName(
  folders: readonly MapFolder[],
  folderId: string,
  rawName: string,
): ValidateRenameMapFolderNameResult {
  const normalized = normalizeMapFolderName(rawName);
  if (!normalized.ok) {
    return normalized;
  }
  const key = mapFolderNameKey(normalized.name);
  if (
    folders.some(
      (folder) =>
        folder.id !== folderId && mapFolderNameKey(folder.name) === key,
    )
  ) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, name: normalized.name };
}

export function formatMapFolderFailure(reason: MapFolderFailureReason): string {
  switch (reason) {
    case "empty":
      return "フォルダー名を入力してください。";
    case "too-long":
      return `フォルダー名は ${MAX_MAP_FOLDER_NAME_LENGTH} 文字以内で入力してください。`;
    case "invalid":
      return "フォルダー名に使えない文字が含まれています。";
    case "duplicate":
      return "同じ名前のフォルダーがすでに存在します。";
    case "too-many":
      return `フォルダーは最大 ${MAX_MAP_FOLDERS} 件まで作成できます。`;
    case "folder-missing":
      return "指定されたフォルダーが見つかりません。";
    case "invalid-id":
      return "フォルダー ID が正しくありません。";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

export function pickUnusedMapFolderId(
  usedIds: ReadonlySet<string>,
  generateId: () => string,
  maxAttempts: number = DEFAULT_MAX_FOLDER_ID_ATTEMPTS,
): string | null {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateId();
    if (isValidMapFolderId(candidate) && !usedIds.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function buildMapUserMeta(fields: {
  favorite?: boolean;
  lastOpenedAt?: string;
  folderId?: string;
}): MapUserMeta | null {
  const next: {
    favorite?: boolean;
    lastOpenedAt?: string;
    folderId?: string;
  } = {};
  if (fields.favorite === true) {
    next.favorite = true;
  }
  if (fields.lastOpenedAt !== undefined) {
    next.lastOpenedAt = fields.lastOpenedAt;
  }
  if (fields.folderId !== undefined) {
    next.folderId = fields.folderId;
  }
  return Object.keys(next).length === 0 ? null : next;
}

// "__proto__" などの危険キーでもプロトタイプを書き換えずに own property として設定する
export function setOwnMapUserMeta(
  target: Record<string, MapUserMeta>,
  mapId: string,
  entry: MapUserMeta,
): void {
  Object.defineProperty(target, mapId, {
    value: entry,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function cloneMapMeta(
  source: Readonly<Record<string, MapUserMeta>>,
): Record<string, MapUserMeta> {
  const copy: Record<string, MapUserMeta> = {};
  for (const key of Object.keys(source)) {
    setOwnMapUserMeta(copy, key, source[key]);
  }
  return copy;
}

export function getMapUserMeta(
  meta: MapLibraryMetaV1,
  mapId: string,
): MapUserMeta | undefined {
  return Object.prototype.hasOwnProperty.call(meta.mapMeta, mapId)
    ? meta.mapMeta[mapId]
    : undefined;
}

export function withUpdatedMapUserMeta(
  meta: MapLibraryMetaV1,
  mapId: string,
  nextEntry: MapUserMeta | null,
): MapLibraryMetaV1 {
  const nextMapMeta: Record<string, MapUserMeta> = {};
  for (const key of Object.keys(meta.mapMeta)) {
    if (key === mapId) continue;
    setOwnMapUserMeta(nextMapMeta, key, meta.mapMeta[key]);
  }
  if (nextEntry !== null) {
    setOwnMapUserMeta(nextMapMeta, mapId, nextEntry);
  }
  return {
    ...meta,
    mapMeta: nextMapMeta,
  };
}
