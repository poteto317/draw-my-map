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

export function buildIllustrationPrompt(label: string): string {
  return `A simple, clear flat-design illustration that represents the concept "${label}", centered subject, plain white background, no text, no letters`;
}
