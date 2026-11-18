import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import {
  formatNoteMarkdownImageLabel,
  toSafeNoteMarkdownImageHref,
  toSafeNoteMarkdownLinkHref,
} from "@/domain/nodes/nodeNoteMarkdownUrl";

const EXACT_LIMIT_URL = `https://example.com/${"a".repeat(NODE_NOTE_MAX_LENGTH - "https://example.com/".length)}`;
const OVER_LIMIT_URL = `${EXACT_LIMIT_URL}a`;
const OVER_LIMIT_AFTER_ENCODE_URL = `https://example.com/${"あ".repeat(1200)}`;

describe("toSafeNoteMarkdownLinkHref", () => {
  it("https・http・mailto の URL を正規化して返す", () => {
    expect(toSafeNoteMarkdownLinkHref("https://example.com/docs?page=1#top")).toBe("https://example.com/docs?page=1#top");
    expect(toSafeNoteMarkdownLinkHref("http://example.com/path")).toBe("http://example.com/path");
    expect(toSafeNoteMarkdownLinkHref("mailto:user@example.com")).toBe("mailto:user@example.com");
  });

  it("大文字スキームとホストを小文字へ正規化し、前後の空白・改行を除去する", () => {
    expect(toSafeNoteMarkdownLinkHref("  HTTPS://EXAMPLE.COM/Docs/Intro  \n")).toBe("https://example.com/Docs/Intro");
    expect(toSafeNoteMarkdownLinkHref("\tMAILTO:User@Example.COM\t")).toBe("mailto:User@Example.COM");
  });

  it("括弧を含む URL をエンコード済み・未エンコードともに安全に保持する", () => {
    expect(toSafeNoteMarkdownLinkHref("https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)")).toBe(
      "https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)",
    );
    expect(toSafeNoteMarkdownLinkHref("https://ja.wikipedia.org/wiki/Markdown_(記法)")).toBe(
      "https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)",
    );
  });

  it.each<[string, string]>([
    ["空文字", ""],
    ["空白のみ", "   \n\t  "],
    ["javascript スキーム", "javascript:alert(1)"],
    ["大文字 JavaScript スキーム", "JavaScript:alert(1)"],
    ["data スキーム", "data:text/html,<script>alert(1)</script>"],
    ["vbscript スキーム", "vbscript:msgbox(1)"],
    ["file スキーム", "file:///etc/passwd"],
    ["blob スキーム", "blob:https://example.com/1234"],
    ["ルート相対パス", "/docs/intro"],
    ["カレント相対パス", "./intro.md"],
    ["フラグメントのみ", "#section-1"],
    ["スキーム無し", "example.com/docs"],
    ["ユーザー名つき URL", "https://user@example.com/path"],
    ["パスワードのみ資格情報つき URL", "https://:pass@example.com/"],
    ["資格情報つき https URL", "https://user:pass@example.com/path"],
    ["資格情報つき http URL", "http://admin:secret@example.com/path"],
    ["タブ入り javascript スキーム", "java\tscript:alert(1)"],
    ["NUL 制御文字を含む URL", "https://example.com/\u0000path"],
    ["DEL 制御文字 U+007F を含む URL", "https://example.com/\u007fpath"],
    ["C1 制御文字 U+0085 を含む URL", "https://example.com/\u0085path"],
    ["C1 制御文字境界 U+009F を含む URL", "https://example.com/\u009fpath"],
    ["中間の改行を含む URL", "https://example.com/a\nb"],
  ])("%s（%j）は null を返す", (_label, rawUrl) => {
    expect(toSafeNoteMarkdownLinkHref(rawUrl)).toBeNull();
  });

  it("長さ上限ちょうど（10,000 文字）は許可し、10,001 文字は null を返す", () => {
    expect(EXACT_LIMIT_URL).toHaveLength(NODE_NOTE_MAX_LENGTH);
    expect(toSafeNoteMarkdownLinkHref(EXACT_LIMIT_URL)).toBe(EXACT_LIMIT_URL);
    expect(toSafeNoteMarkdownLinkHref(`  ${EXACT_LIMIT_URL}\n`)).toBe(EXACT_LIMIT_URL);
    expect(toSafeNoteMarkdownLinkHref(OVER_LIMIT_URL)).toBeNull();
  });

  it("入力が 10,000 文字以内でもエンコード後が 10,000 文字ちょうどなら許可し、10,001 文字になると null を返す（L-836）", () => {
    const prefix = "https://example.com/";
    const encodedPrefixLength = `${prefix}%E3%81%82`.length;
    const exactAfterEncodeInput = `${prefix}あ${"a".repeat(NODE_NOTE_MAX_LENGTH - encodedPrefixLength)}`;
    const overByOneAfterEncodeInput = `${exactAfterEncodeInput}a`;

    expect(exactAfterEncodeInput.length).toBeLessThan(NODE_NOTE_MAX_LENGTH);
    const result = toSafeNoteMarkdownLinkHref(exactAfterEncodeInput);
    expect(result).toHaveLength(NODE_NOTE_MAX_LENGTH);
    expect(toSafeNoteMarkdownLinkHref(overByOneAfterEncodeInput)).toBeNull();
    expect(OVER_LIMIT_AFTER_ENCODE_URL.length).toBeLessThanOrEqual(NODE_NOTE_MAX_LENGTH);
    expect(toSafeNoteMarkdownLinkHref(OVER_LIMIT_AFTER_ENCODE_URL)).toBeNull();
  });
});

describe("toSafeNoteMarkdownImageHref", () => {
  it("https・http の画像 URL を正規化して返す", () => {
    expect(toSafeNoteMarkdownImageHref("  HTTPS://CDN.EXAMPLE.COM/images/diagram.png  ")).toBe(
      "https://cdn.example.com/images/diagram.png",
    );
    expect(toSafeNoteMarkdownImageHref("http://example.com/photo.jpg")).toBe("http://example.com/photo.jpg");
  });

  it.each<[string, string]>([
    ["mailto スキーム", "mailto:user@example.com"],
    ["javascript スキーム", "javascript:alert(1)"],
    ["data URL", "data:image/png;base64,iVBORw0KGgo="],
    ["資格情報つき URL", "https://user:pass@example.com/image.png"],
    ["ルート相対パス", "/images/sample.png"],
    ["カレント相対パス", "./sample.png"],
    ["制御文字を含む URL", "https://example.com/img\u0007.png"],
  ])("%s（%j）は null を返す", (_label, rawUrl) => {
    expect(toSafeNoteMarkdownImageHref(rawUrl)).toBeNull();
  });

  it("長さ上限超過およびエンコード後の長さ上限超過で null を返す", () => {
    expect(toSafeNoteMarkdownImageHref(EXACT_LIMIT_URL)).toBe(EXACT_LIMIT_URL);
    expect(toSafeNoteMarkdownImageHref(OVER_LIMIT_URL)).toBeNull();
    expect(toSafeNoteMarkdownImageHref(OVER_LIMIT_AFTER_ENCODE_URL)).toBeNull();
  });
});

describe("formatNoteMarkdownImageLabel", () => {
  it("alt がある場合は前後の空白を除去して [画像: alt] 形式で返す", () => {
    expect(formatNoteMarkdownImageLabel("構成図")).toBe("[画像: 構成図]");
    expect(formatNoteMarkdownImageLabel("  構成図  \n")).toBe("[画像: 構成図]");
  });

  it.each<[string, string | undefined]>([
    ["空文字", ""],
    ["空白のみ", "   \t\n  "],
    ["undefined", undefined],
  ])("%s のときはフォールバック文字列を返す", (_label, alt) => {
    expect(formatNoteMarkdownImageLabel(alt)).toBe("[画像]");
  });
});
