/** @jest-environment node */
import { readAiAssistAllowedHosts, readAiAssistConfig } from "@/server/aiAssist/aiAssistConfig";
import { AiAssistError, aiAssistFailure } from "@/server/aiAssist/aiTextGenerator";

describe("readAiAssistConfig", () => {
  it.each<[string, Record<string, string | undefined>, ReturnType<typeof readAiAssistConfig>]>([
    ["キーが無い", {}, null],
    ["Claude のキーだけ", { ANTHROPIC_API_KEY: "a-key" }, { provider: "anthropic", apiKey: "a-key", model: "claude-opus-5-5" }],
    ["OpenAI のキーだけ", { OPENAI_API_KEY: "o-key" }, { provider: "openai", apiKey: "o-key", model: "gpt-5" }],
    ["両方あれば Claude を優先", { ANTHROPIC_API_KEY: "a-key", OPENAI_API_KEY: "o-key" }, { provider: "anthropic", apiKey: "a-key", model: "claude-opus-5-5" }],
    ["openai を明示", { AI_ASSIST_PROVIDER: "openai", ANTHROPIC_API_KEY: "a-key", OPENAI_API_KEY: "o-key" }, { provider: "openai", apiKey: "o-key", model: "gpt-5" }],
    ["明示は trim・小文字化する", { AI_ASSIST_PROVIDER: " OpenAI\n", OPENAI_API_KEY: "o-key" }, { provider: "openai", apiKey: "o-key", model: "gpt-5" }],
    ["明示した提供元のキーが無いなら黙って切り替えず無効（L-044）", { AI_ASSIST_PROVIDER: "openai", ANTHROPIC_API_KEY: "a-key" }, null],
    ["不正な提供元は無効（L-044）", { AI_ASSIST_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a-key" }, null],
    ["空白だけの提供元は未設定", { AI_ASSIST_PROVIDER: "   ", OPENAI_API_KEY: "o-key" }, { provider: "openai", apiKey: "o-key", model: "gpt-5" }],
    ["末尾改行付きのキーは trim（L-752）", { ANTHROPIC_API_KEY: "a-key\n" }, { provider: "anthropic", apiKey: "a-key", model: "claude-opus-5-5" }],
    ["空白だけのキーは未設定（L-752）", { ANTHROPIC_API_KEY: "  \n", OPENAI_API_KEY: "o-key" }, { provider: "openai", apiKey: "o-key", model: "gpt-5" }],
    ["Claude のモデルの上書きと trim", { ANTHROPIC_API_KEY: "a-key", AI_ASSIST_ANTHROPIC_MODEL: " claude-sonnet-5-5 " }, { provider: "anthropic", apiKey: "a-key", model: "claude-sonnet-5-5" }],
    ["OpenAI のモデルの上書き", { OPENAI_API_KEY: "o-key", AI_ASSIST_OPENAI_MODEL: "gpt-5-mini" }, { provider: "openai", apiKey: "o-key", model: "gpt-5-mini" }],
    ["空白だけのモデルは既定", { ANTHROPIC_API_KEY: "a-key", AI_ASSIST_ANTHROPIC_MODEL: "  " }, { provider: "anthropic", apiKey: "a-key", model: "claude-opus-5-5" }],
    ["anthropic を明示して OpenAI のキーだけなら黙って切り替えず無効（L-044）", { AI_ASSIST_PROVIDER: "anthropic", OPENAI_API_KEY: "o-key" }, null],
    ["大文字の ANTHROPIC の明示は小文字化して Claude を選ぶ", { AI_ASSIST_PROVIDER: "ANTHROPIC", ANTHROPIC_API_KEY: "a-key", OPENAI_API_KEY: "o-key" }, { provider: "anthropic", apiKey: "a-key", model: "claude-opus-5-5" }],
    ["OpenAI を選んだときは Claude のモデルの指定を無視する", { AI_ASSIST_PROVIDER: "openai", OPENAI_API_KEY: "o-key", AI_ASSIST_ANTHROPIC_MODEL: "claude-sonnet-5-5" }, { provider: "openai", apiKey: "o-key", model: "gpt-5" }],
  ])("%s", (_name, env, expected) => {
    expect(readAiAssistConfig(env)).toEqual(expected);
  });
});

describe("readAiAssistAllowedHosts", () => {
  it.each<[string, Record<string, string | undefined>, string[]]>([
    ["未設定なら既定の 3 種", {}, ["localhost", "127.0.0.1", "[::1]"]],
    ["空白だけは未設定（L-752）", { AI_ASSIST_ALLOWED_HOSTS: "  \n" }, ["localhost", "127.0.0.1", "[::1]"]],
    ["カンマ区切りで既定に足し、各項目を trim・小文字化する", { AI_ASSIST_ALLOWED_HOSTS: " 192.168.1.10 , MyMac.Local\n" }, ["localhost", "127.0.0.1", "[::1]", "192.168.1.10", "mymac.local"]],
    ["空の項目は無視する", { AI_ASSIST_ALLOWED_HOSTS: ",, mymac.local ,," }, ["localhost", "127.0.0.1", "[::1]", "mymac.local"]],
    ["ポート付きの項目はホスト名だけを使う", { AI_ASSIST_ALLOWED_HOSTS: "mymac.local:3000" }, ["localhost", "127.0.0.1", "[::1]", "mymac.local"]],
    ["IPv6 は角かっこの有無を問わず角かっこ付きにそろえる", { AI_ASSIST_ALLOWED_HOSTS: "FE80::1, [fd00::2]" }, ["localhost", "127.0.0.1", "[::1]", "[fe80::1]", "[fd00::2]"]],
    ["ホスト名として読めない項目は無視する", { AI_ASSIST_ALLOWED_HOSTS: "evil@localhost, http://x.test, a b, ok.test" }, ["localhost", "127.0.0.1", "[::1]", "ok.test"]],
  ])("%s", (_name, env, expected) => {
    expect([...readAiAssistAllowedHosts(env)]).toEqual(expected);
  });
});

describe("aiAssistFailure", () => {
  it("種類と状態コードだけをログに出し、固定の文言の AiAssistError を返す（L-017・L-029）", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const error = aiAssistFailure("anthropic", "rate-limited", 429);
      expect(error).toBeInstanceOf(AiAssistError);
      expect(error.kind).toBe("rate-limited");
      expect(error.message).toBe("AI 支援の呼び出しに失敗しました: rate-limited");
      expect(warn).toHaveBeenCalledWith("[ai-assist] provider=anthropic kind=rate-limited status=429");
    } finally {
      warn.mockRestore();
    }
  });

  it("状態コードが無いときはログに status=- を出す", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const error = aiAssistFailure("openai", "timeout");
      expect(error.kind).toBe("timeout");
      expect(warn).toHaveBeenCalledWith("[ai-assist] provider=openai kind=timeout status=-");
    } finally {
      warn.mockRestore();
    }
  });
});
