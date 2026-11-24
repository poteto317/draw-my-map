export const mockDownloadExchangeText = jest.fn();

jest.mock("@/services/exchange/exchangeTextDownload", () => ({
  downloadExchangeText: (text: string, mapName: string, format: string) =>
    mockDownloadExchangeText(text, mapName, format),
}));