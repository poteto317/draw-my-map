"use client";

import { signIn } from "next-auth/react";
import { useRef } from "react";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import { useShareSession } from "@/hooks/useShareSession";
import { CollabJoinShell } from "@/app/collab/[token]/CollabJoinShell";

type CollabEditorPageProps = {
  token: string;
};

/**
 * `/collab/[token]` の組み立て役。
 * 未ログインはログインのみ（MapEditor をマウントしない）。
 * token 変更は key で再マウントする。
 */
export function CollabEditorPage({ token }: CollabEditorPageProps) {
  return <CollabEditorPageInner key={token} token={token} />;
}

function CollabEditorPageInner({ token }: CollabEditorPageProps) {
  const { status, session } = useShareSession();
  const dialogMouseClickedAtRef = useRef<number | null>(null);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p data-testid="collab-session-loading">{COLLAB_MESSAGES.sessionLoading}</p>
      </main>
    );
  }

  if (session === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p>{COLLAB_MESSAGES.loginRequired}</p>
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          onClick={() => {
            void signIn("google", { redirectTo: window.location.pathname });
          }}
        >
          {COLLAB_MESSAGES.loginButton}
        </button>
      </main>
    );
  }

  return (
    <CollabJoinShell
      token={token}
      shareSession={session}
      shareSessionStatus="ready"
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
    />
  );
}
