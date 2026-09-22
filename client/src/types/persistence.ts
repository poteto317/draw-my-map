export type PersistenceNotice = {
  kind: "status" | "warning" | "error";
  message: string;
};
