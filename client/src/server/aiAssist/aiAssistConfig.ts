import { aiAssistHostName } from "@/server/aiAssist/aiAssistRequestOrigin";
import type { AiAssistConfig, AiAssistProvider } from "@/server/aiAssist/aiTextGenerator";

export const AI_ASSIST_DEFAULT_MODELS = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
} as const;

export const AI_ASSIST_PROVIDER_LABELS: Readonly<Record<AiAssistProvider, string>> = {
  anthropic: "Anthropic（Claude API）",
  openai: "OpenAI（GPT API）",
};

// 前後の空白・改行を除き、空白だけは未設定とみなす（L-752）
function readEnv(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readProvider(
  env: Record<string, string | undefined>,
  anthropicKey: string | undefined,
  openaiKey: string | undefined,
): AiAssistProvider | null {
  const raw = readEnv(env, "AI_ASSIST_PROVIDER");
  if (raw === undefined) {
    if (anthropicKey !== undefined) return "anthropic";
    return openaiKey !== undefined ? "openai" : null;
  }
  const lower = raw.toLowerCase();
  // 不正な値は「指定なし」へ流さず無効にする（L-044）
  return lower === "anthropic" || lower === "openai" ? lower : null;
}

// AI 支援の API を受け付ける Host のホスト名（ポートは問わない）。自分の機械からの既定の 3 種に、
// AI_ASSIST_ALLOWED_HOSTS（カンマ区切り）で LAN の IP や別名を足せる。読めない項目は黙って捨てる（許可を広げない向き）
export const AI_ASSIST_DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;

export function readAiAssistAllowedHosts(env: Record<string, string | undefined>): ReadonlySet<string> {
  const hosts = new Set<string>(AI_ASSIST_DEFAULT_ALLOWED_HOSTS);
  for (const item of (readEnv(env, "AI_ASSIST_ALLOWED_HOSTS") ?? "").split(",")) {
    if (item.trim() === "") continue;
    const hostName = aiAssistHostName(item);
    if (hostName !== null) hosts.add(hostName);
  }
  return hosts;
}

// 明示した提供元のキーが無いときも、もう一方へ黙って切り替えず無効（null）にする
export function readAiAssistConfig(env: Record<string, string | undefined>): AiAssistConfig | null {
  const anthropicKey = readEnv(env, "ANTHROPIC_API_KEY");
  const openaiKey = readEnv(env, "OPENAI_API_KEY");
  const provider = readProvider(env, anthropicKey, openaiKey);
  if (provider === "anthropic") {
    if (anthropicKey === undefined) return null;
    return {
      provider,
      apiKey: anthropicKey,
      model: readEnv(env, "AI_ASSIST_ANTHROPIC_MODEL") ?? AI_ASSIST_DEFAULT_MODELS.anthropic,
    };
  }
  if (provider === "openai") {
    if (openaiKey === undefined) return null;
    return {
      provider,
      apiKey: openaiKey,
      model: readEnv(env, "AI_ASSIST_OPENAI_MODEL") ?? AI_ASSIST_DEFAULT_MODELS.openai,
    };
  }
  return null;
}
