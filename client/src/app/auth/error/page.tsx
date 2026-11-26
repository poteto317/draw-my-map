/**
 * ログイン失敗・拒否時の固定文言ページ。
 * Auth.js の error クエリやプロバイダ生エラーは表示しない（設計§4.1）。
 */
export const AUTH_LOGIN_ERROR_MESSAGE =
  "ログインに失敗しました。しばらくしてからもう一度お試しください。";

export default function AuthErrorPage() {
  return (
    <main>
      <h1>ログインエラー</h1>
      <p>{AUTH_LOGIN_ERROR_MESSAGE}</p>
    </main>
  );
}
