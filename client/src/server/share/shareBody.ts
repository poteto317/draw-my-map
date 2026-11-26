/** AI 支援 API と同じ JSON 上限（既存に合わせる） */
export const SHARE_MAX_BODY_BYTES = 256 * 1024;

export type ReadShareBodyResult =
  | { kind: "ok"; text: string }
  | { kind: "too-large" }
  | { kind: "error" };

/** Content-Length 申告と実読取の両方で上限判定。超過時点で読取を打ち切る */
export async function readShareBodyWithinLimit(
  request: Request,
  maxBytes: number = SHARE_MAX_BODY_BYTES,
): Promise<ReadShareBodyResult> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    return { kind: "too-large" };
  }
  if (request.body === null) return { kind: "ok", text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "error" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "ok", text: new TextDecoder().decode(bytes) };
}

export function parseShareJson(text: string): unknown {
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
