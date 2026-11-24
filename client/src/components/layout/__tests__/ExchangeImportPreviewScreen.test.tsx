import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { ExchangeImportPreviewScreen } from "@/components/layout/ExchangeImportPreviewScreen";
import { buildExchangePreview } from "@/domain/exchange/exchangePreview";
import { EXCHANGE_OPML_LOSSY_NOTICE } from "@/domain/exchange/exchangeMessages";

const items = [
  { label: "親", parentIndex: null },
  { label: "子", parentIndex: 0 },
] as const;

describe("ExchangeImportPreviewScreen", () => {
  it("OPML の lossy 案内を警告として出す", () => {
    const preview = buildExchangePreview(items);
    render(
      <ExchangeImportPreviewScreen
        headingId="h"
        summaryId="s"
        warningsId="w"
        parsed={{ items: [...items], warnings: [], showOpmlLossyNotice: true }}
        preview={preview}
        parentCandidate={{ kind: "none" }}
        target="root"
        onTargetChange={() => {}}
        onSubmit={() => {}}
        onBack={() => {}}
        regionRef={createRef()}
      />,
    );
    expect(screen.getByText(`注意: ${EXCHANGE_OPML_LOSSY_NOTICE}`)).toBeInTheDocument();
  });

  it("CSV の warnings を一覧する", () => {
    const preview = buildExchangePreview(items);
    render(
      <ExchangeImportPreviewScreen
        headingId="h"
        summaryId="s"
        warningsId="w"
        parsed={{
          items: [...items],
          warnings: ['行2: 不明な importance "foo" を medium にしました'],
          showOpmlLossyNotice: false,
        }}
        preview={preview}
        parentCandidate={{ kind: "none" }}
        target="root"
        onTargetChange={() => {}}
        onSubmit={() => {}}
        onBack={() => {}}
        regionRef={createRef()}
      />,
    );
    expect(screen.getByText(/不明な importance/)).toBeInTheDocument();
  });
});