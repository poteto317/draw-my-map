import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
const NOTE_MARKDOWN_IMAGE_FALLBACK_LABEL = "[画像]";

// 制御文字（U+0000〜U+001F・U+007F〜U+009F）。no-control-regex 回避と nodeTag.ts との統一のためコード単位で判定する
function isControlCodeUnit(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isControlCodeUnit(value.charCodeAt(index))) return true;
  }
  return false;
}

// Markdown の URL 文字列を安全検査し、許可したスキームだけを正規化済みの href で返す（描画側はそのまま href に使う。L-018・L-834）。
// 入力と解析後の両方に上限を掛け（L-443・L-836）、http/https の資格情報つき URL は拒否する（L-032）
function normalizeSafeMarkdownUrl(rawUrl: string, allowedProtocols: ReadonlySet<string>): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed === "" || trimmed.length > NODE_NOTE_MAX_LENGTH) return null;
  if (hasControlCharacter(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!allowedProtocols.has(parsed.protocol)) return null;
  if ((parsed.protocol === "http:" || parsed.protocol === "https:") && (parsed.username !== "" || parsed.password !== "")) {
    return null;
  }
  if (parsed.href.length > NODE_NOTE_MAX_LENGTH) return null;

  return parsed.href;
}

export function toSafeNoteMarkdownLinkHref(rawUrl: string): string | null {
  return normalizeSafeMarkdownUrl(rawUrl, ALLOWED_LINK_PROTOCOLS);
}

export function toSafeNoteMarkdownImageHref(rawUrl: string): string | null {
  return normalizeSafeMarkdownUrl(rawUrl, ALLOWED_IMAGE_PROTOCOLS);
}

export function formatNoteMarkdownImageLabel(alt: string | undefined): string {
  const trimmed = alt?.trim() ?? "";
  return trimmed === "" ? NOTE_MARKDOWN_IMAGE_FALLBACK_LABEL : `[画像: ${trimmed}]`;
}
