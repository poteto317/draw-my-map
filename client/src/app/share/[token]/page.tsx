import type { Metadata } from "next";
import { ShareViewerPage } from "@/app/share/[token]/ShareViewerPage";

type PageProps = {
  params: Promise<{ token: string }>;
};

/** 平文トークン URL を検索エンジンに載せない */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/** 閲覧専用ルート。平文トークンは UI・エラー文言に出さない。 */
export default async function ShareTokenPage({ params }: PageProps) {
  const { token } = await params;
  return <ShareViewerPage token={token} />;
}
