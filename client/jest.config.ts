import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

const baseJestConfig = createJestConfig(config);

// next/jest は既定で node_modules を SWC 変換から除外するため、react-markdown / remark-gfm と
// その推移的 ESM パッケージをそのまま変換対象に通し、テストでモックせず実物を動かす（L-059・L-727）
const asyncJestConfig = async () => {
  const resolved = await baseJestConfig();
  return {
    ...resolved,
    transformIgnorePatterns: ["^.+\\.module\\.(css|sass|scss)$"],
  };
};

export default asyncJestConfig;
