/**
 * Collab API のクライアント／サーバー共有 DTO（services が server を import しないため domain に置く）。
 */

export type CollabSessionStartValue = {
  sessionId: string;
  ticket: string;
  wsUrl: string;
};

export type CollabSessionEndValue = {
  documentJson: string;
};

export type CollabSessionGetValue = {
  id: string;
  localMapId: string;
  sharedMapId: string | null;
  status: "creating" | "active" | "ended" | "failed";
  hasArtifact: boolean;
  createdAt: string;
  endedAt: string | null;
};

export type CollabTicketClaims = {
  sessionId: string;
  userId: string;
  exp: number;
};
