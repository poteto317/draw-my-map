import type { NodeSearchMatch } from "@/domain/search/nodeLabelSearch";

export type NodeSearchListItem = NodeSearchMatch & {
  hidden: boolean;
};
