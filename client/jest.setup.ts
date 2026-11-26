import "@testing-library/jest-dom";

// page / MapEditor 組み立てで SessionProvider 無しでも落ちないようにする（個別テストで上書き可）
jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
