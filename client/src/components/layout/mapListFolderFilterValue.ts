import {
  isValidMapFolderId,
  type MapListFolderFilter,
} from "@/domain/mapLibrary/mapLibraryMeta";

// フォルダーの絞り込みと <select> の値の相互変換。フォルダー ID は接頭辞で「すべて」「未分類」と区別する
const FOLDER_FILTER_PREFIX = "folder:";

export function encodeFolderFilterValue(filter: MapListFolderFilter): string {
  switch (filter.kind) {
    case "all":
      return "all";
    case "unclassified":
      return "unclassified";
    case "folder":
      return `${FOLDER_FILTER_PREFIX}${filter.folderId}`;
  }
}

// 解釈できない値は「すべてのフォルダー」へ戻す
export function decodeFolderFilterValue(raw: string): MapListFolderFilter {
  if (raw === "unclassified") return { kind: "unclassified" };
  if (raw.startsWith(FOLDER_FILTER_PREFIX)) {
    const folderId = raw.slice(FOLDER_FILTER_PREFIX.length);
    if (isValidMapFolderId(folderId)) {
      return { kind: "folder", folderId };
    }
  }
  return { kind: "all" };
}
