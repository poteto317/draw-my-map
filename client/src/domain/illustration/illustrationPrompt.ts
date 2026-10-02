export const ILLUSTRATION_LABEL_MAX_LENGTH = 200;

export type IllustrationLabelValidation =
  | { ok: true; label: string }
  | { ok: false; reason: "empty" | "too-long" };

export function validateIllustrationLabel(label: string): IllustrationLabelValidation {
  const trimmed = label.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > ILLUSTRATION_LABEL_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, label: trimmed };
}

// 翻訳モデルは日本語→英語に固定されているため、日本語の文字（ひらがな・カタカナ・漢字・全角形・半角カタカナ）を含むラベルだけを翻訳する
// 絵文字やアクセント付きの英字などは、翻訳せずそのまま使う
const JAPANESE_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}！-｠｡-ﾟ]/u;

export function needsTranslation(label: string): boolean {
  return JAPANESE_PATTERN.test(label.trim());
}

// プロンプトがAPIの上限（2048文字）を超えないよう、概念は500文字までにする
const ILLUSTRATION_CONCEPT_MAX_LENGTH = 500;

// concept は英語の概念（日本語のラベルではなく、翻訳後の文字列）
export function buildIllustrationPrompt(concept: string): string {
  const safeConcept = concept.trim().slice(0, ILLUSTRATION_CONCEPT_MAX_LENGTH);
  return `A simple, clear flat-design illustration of an object or scene that symbolizes the concept: ${safeConcept}. One large centered subject that fills most of the frame, plain white background, no text, no letters.`;
}
