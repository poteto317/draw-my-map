import { createAnthropicTextGenerator } from "@/server/aiAssist/anthropicTextGenerator";
import type { AiAssistConfig, AiTextGenerator } from "@/server/aiAssist/aiTextGenerator";
import { createOpenAITextGenerator } from "@/server/aiAssist/openaiTextGenerator";

// ルートが使う。設定（aiAssistConfig.ts）は SDK を import しないので、提供元の選択の配線はここに置く
export function createAiTextGenerator(config: AiAssistConfig): AiTextGenerator {
  return config.provider === "anthropic"
    ? createAnthropicTextGenerator(config)
    : createOpenAITextGenerator(config);
}
