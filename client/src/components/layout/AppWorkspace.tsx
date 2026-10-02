import type { ReactNode } from "react";

type AppWorkspaceProps = {
  canvas: ReactNode;
  sidePanel: ReactNode;
};

export function AppWorkspace({ canvas, sidePanel }: AppWorkspaceProps) {
  return (
    <main className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1">{canvas}</div>
      {sidePanel}
    </main>
  );
}
