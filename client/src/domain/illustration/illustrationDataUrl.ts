import { MAX_ILLUSTRATION_DATA_URL_LENGTH } from "@/config/illustration";

// アプリが保存するのは JPEG だけ（createIllustrationThumbnail）。svg は除く（スクリプトを含みうる）。属性や XML に入れても壊れない文字だけを許す
const ILLUSTRATION_DATA_URL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export function isIllustrationDataUrl(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= MAX_ILLUSTRATION_DATA_URL_LENGTH
    && ILLUSTRATION_DATA_URL_PATTERN.test(value);
}
