import { AI_STRUCTURE_LABEL_MAX_LENGTH } from "@/domain/aiAssist/aiAssistOutput";

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** 音声確定テキストをノードラベル用に正規化する（空なら null） */
export function normalizeVoiceTranscript(value: string): string | null {
  const label = value.replace(CONTROL, "").trim();
  if (label === "") return null;
  if (label.length > AI_STRUCTURE_LABEL_MAX_LENGTH) {
    return label.slice(0, AI_STRUCTURE_LABEL_MAX_LENGTH);
  }
  return label;
}