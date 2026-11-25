/** @jest-environment node */
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..", "..", "..");
const ALLOWED_DIR = path.join(SRC, "server", "aiAssist");
// 静的 import・動的 import・require・副作用 import を拾う
const SDK_IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](@anthropic-ai\/sdk|openai)(\/[^"']*)?["']/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("AI の SDK の import の境界", () => {
  it.each(["anthropicTextGenerator.ts", "openaiTextGenerator.ts"])("陽性対照: 許可ディレクトリの %s の import は正規表現に一致する", (name) => {
    expect(SDK_IMPORT.test(fs.readFileSync(path.join(ALLOWED_DIR, name), "utf8"))).toBe(true);
  });

  it.each([
    "import x from \"openai\";",
    "import \"@anthropic-ai/sdk\";",
    "const m = await import(\"openai/resources\");",
    "const m = require('@anthropic-ai/sdk');",
  ])("正規表現は import の書き方 %s を拾う", (source) => {
    expect(SDK_IMPORT.test(source)).toBe(true);
  });

  it("@anthropic-ai/sdk と openai は server/aiAssist の外から import しない（ブラウザのバンドルへ入れない）", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.startsWith(`${ALLOWED_DIR}${path.sep}`))
      .filter((file) => SDK_IMPORT.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
