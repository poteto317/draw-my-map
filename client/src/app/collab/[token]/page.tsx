import type { Metadata } from "next";
import { CollabEditorPage } from "@/app/collab/[token]/CollabEditorPage";

type PageProps = {
  params: Promise<{ token: string }>;
};

/** 平文 edit トークン URL を検索エンジン・Referer に載せない（L-1233 metadata） */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  referrer: "no-referrer",
};

/** edit リンク参加ルート。未ログインはログイン導線のみ（編集 UI は出さない）。 */
export default async function CollabTokenPage({ params }: PageProps) {
  const { token } = await params;
  return <CollabEditorPage token={token} />;
}
