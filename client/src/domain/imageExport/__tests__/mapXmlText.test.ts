import {
  escapeMapXmlText,
  normalizeMapXmlText,
} from "@/domain/imageExport/mapXmlText";

it("XML禁止文字だけを置換し構造文字は保持する", () => {
  expect(normalizeMapXmlText(`A\u0000<script>&"'B`))
    .toBe(`A\uFFFD<script>&"'B`);
});

it("XML禁止文字を置換し構造文字をエスケープする", () => {
  expect(escapeMapXmlText(`A\u0000<script>&"'B`))
    .toBe("A\uFFFD&lt;script&gt;&amp;&quot;&apos;B");
});

it("XML 1.0で許可される空白とUnicodeを保持する", () => {
  expect(escapeMapXmlText("\t\n\r日本語😀\u{10FFFF}"))
    .toBe("\t\n\r日本語😀\u{10FFFF}");
});
