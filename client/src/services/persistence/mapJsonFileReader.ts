import type { MapDocumentResult } from "@/types/mapDocument";

export async function readMapJsonFile(
  file: File,
): Promise<MapDocumentResult<string>> {
  try {
    return { ok: true, value: await file.text() };
  } catch {
    return {
      ok: false,
      error: "JSONファイルを読み取れませんでした。",
    };
  }
}
