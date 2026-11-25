/** @jest-environment node */
import { createAiTextGenerator } from "@/server/aiAssist/createAiTextGenerator";

const mockAnthropicGenerator = jest.fn();
const mockOpenAIGenerator = jest.fn();
jest.mock("@/server/aiAssist/anthropicTextGenerator", () => ({
  createAnthropicTextGenerator: (config: unknown) => mockAnthropicGenerator(config),
}));
jest.mock("@/server/aiAssist/openaiTextGenerator", () => ({
  createOpenAITextGenerator: (config: unknown) => mockOpenAIGenerator(config),
}));

describe("createAiTextGenerator", () => {
  it("設定の提供元のアダプタだけを作り、その戻り値をそのまま返す", () => {
    const anthropic = { provider: "anthropic", apiKey: "a", model: "m" } as const;
    const openai = { provider: "openai", apiKey: "o", model: "g" } as const;
    const anthropicSentinel = jest.fn();
    const openaiSentinel = jest.fn();
    mockAnthropicGenerator.mockReturnValue(anthropicSentinel);
    mockOpenAIGenerator.mockReturnValue(openaiSentinel);

    expect(createAiTextGenerator(anthropic)).toBe(anthropicSentinel);
    expect(createAiTextGenerator(openai)).toBe(openaiSentinel);

    expect(mockAnthropicGenerator).toHaveBeenCalledTimes(1);
    expect(mockAnthropicGenerator).toHaveBeenCalledWith(anthropic);
    expect(mockOpenAIGenerator).toHaveBeenCalledTimes(1);
    expect(mockOpenAIGenerator).toHaveBeenCalledWith(openai);
  });
});
