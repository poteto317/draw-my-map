/**
 * /help 本文。編集シェルから外した常時テキスト (a)(b)(c) を載せる。
 * スタイルは globals.css の `.help-page …` 祖先セレクタ（L-792）。
 */

import { LAYOUT_MODE_OPERATION_HINTS } from "@/domain/help/layoutModeOperationHints";

const CLIPBOARD_OPERATION_HINT =
  "枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）";

const COLLAPSE_PERSISTENCE_NOTE = "折りたたみは保存・画像出力に反映されません。";
const COLLAPSE_LAYOUT_NOTE = "手動配置へ戻すと元の座標に戻ります。";

export function HelpPage() {
  return (
    <main className="help-page">
      <h1 className="help-page__title">使い方</h1>

      <section className="help-page__section" aria-labelledby="help-layout-hints">
        <h2 id="help-layout-hints" className="help-page__heading">
          レイアウト操作ヒント
        </h2>
        <h3 className="help-page__subheading">手動配置</h3>
        <p className="help-page__body">{LAYOUT_MODE_OPERATION_HINTS.manual}</p>
        <h3 className="help-page__subheading">自動配置</h3>
        <p className="help-page__body">{LAYOUT_MODE_OPERATION_HINTS.auto}</p>
      </section>

      <section className="help-page__section" aria-labelledby="help-clipboard">
        <h2 id="help-clipboard" className="help-page__heading">
          コピー／貼り付け案内
        </h2>
        <p className="help-page__body">{CLIPBOARD_OPERATION_HINT}</p>
      </section>

      <section className="help-page__section" aria-labelledby="help-collapse">
        <h2 id="help-collapse" className="help-page__heading">
          折りたたみ補足
        </h2>
        <p className="help-page__body">{COLLAPSE_PERSISTENCE_NOTE}</p>
        <p className="help-page__body">{COLLAPSE_LAYOUT_NOTE}</p>
      </section>
    </main>
  );
}
