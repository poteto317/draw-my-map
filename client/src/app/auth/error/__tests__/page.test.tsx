import { render, screen } from "@testing-library/react";
import AuthErrorPage, { AUTH_LOGIN_ERROR_MESSAGE } from "@/app/auth/error/page";

describe("AuthErrorPage", () => {
  it("固定日本語文言だけを出し、プロバイダ生エラーを出さない", () => {
    render(<AuthErrorPage />);
    expect(screen.getByRole("heading", { name: "ログインエラー" })).toBeInTheDocument();
    expect(screen.getByText(AUTH_LOGIN_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(/Configuration|AccessDenied|OAuth|token/i)).not.toBeInTheDocument();
  });
});
