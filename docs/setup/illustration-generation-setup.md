# イラスト生成を使えるようにする手順書

このアプリの「イラストを生成」機能を、実際に動かすために、あなた（利用者）が行う手順をまとめた文書です。所要時間は、初めてなら 20〜30 分程度です。

## この手順で行うこと

1. Cloudflare のアカウントを作る（無料プラン）。
2. アカウント ID と API トークンを手に入れる。
3. それらを、アプリの設定ファイル（`client/.env.local`）に書く。
4. アプリを起動して、画面からイラストを生成する。

イラスト生成には、Cloudflare Workers AI（画像生成モデル FLUX.1 schnell）を使います。無料プランには、毎日の無料枠があり、超過すると、課金ではなくエラーになります。

## 先に知っておくこと

- **画面の表示や文言は、変わることがあります。** この手順書の画面の名前（ボタンやメニューの名前）は、2026 年 10 月時点の公式ドキュメントに基づいています。見つからないときは、各手順の末尾にある公式ドキュメントのリンクを見てください。
- **API トークンは、パスワードと同じ扱いです。** 他の人に見せたり、チャットや Git のコミットに貼ったりしないでください。
- **支払い方法の登録は、不要なはずです。** 公式ドキュメントの前提条件には、Cloudflare のアカウントだけが書かれています。もし、クレジットカードの登録を求める画面が出たら、有料プランへの申し込みになっていないかを確認し、内容が分からないときは、進めずに止めてください（「6. 困ったとき」を参照）。
- **毎日の無料枠は、1 日 10,000 Neurons です。** 1 回の生成で使う量や、1 日に生成できる枚数は、公式ドキュメントに数値がなく、確認できていません。実際に使って、何枚まで生成できるかを記録しておくと、目安になります。
- **リセットの時刻は、毎日 0:00 UTC（日本時間の午前 9:00）です。**

## 準備するもの

- メールアドレス（Cloudflare のアカウント作成に使う）。
- このアプリのソースコード（`リポジトリルート`）と、ターミナル。
- ブラウザ。

---

## 1. Cloudflare のアカウントを作る

すでに Cloudflare のアカウントを持っている場合は、この手順を飛ばして、「2. アカウント ID を確認する」へ進んでください。

1. ブラウザで、Cloudflare のサインアップのページ（https://dashloudflare.com/sign-up）を開く。
2. メールアドレスとパスワードを入力して、アカウントを作る。
3. 届いた確認のメールのリンクを開いて、メールアドレスを認証する。
4. ダッシュボード（https://dash.cloudflare.com/）にログインできることを確認する。

**確認**: ダッシュボードの画面が表示される。

**注意**: 途中で、プラン（Free、Pro など）を選ぶ画面が出たら、**Free** を選んでください。有料プランに進まないでください。

---

## 2. アカウント ID を確認する

アカウント ID は、Cloudflare のアカウントを識別する文字列です。次のどちらかの方法で、コピーします。

**方法 A（Workers AI のページから）**

1. ダッシュボードで、Workers AI のページを開く（左のメニューの「AI」の中にある「Workers AI」。見つからないときは、ダッシュボードの検索で「Workers AI」を探す）。
2. 「Use REST API」の欄にある「Account ID」の値をコピーする。

**方法 B（検索から）**

1. ダッシュボードの「Account home」を開く
2. 検索（Search）を開く（`Cmd + K`、Windows は `Ctrl + K`）。
3. 「Copy account ID」と入力して、出てきた項目を選ぶと、アカウント ID がコピーされる。

コピーした値は、後の手順で使うので、メモ帳などに、一時的に貼っておきます（手順 5 で設定ファイルに書いたら、メモは消してください）。

公式ドキュメント: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/

---

## 3. API トークンを作る

1. ダッシュボードで、Workers AI のページを開く。
2. 「Create a Workers AI API Token」を選ぶ。
3. 画面に出ている内容（名前、権限）を確認する。権限には、**「Workers AI - Read」と「Workers AI - Edit」の両方**が含まれている必要があります。
4. 「Create API Token」を選ぶ。
5. 表示された API トークンの値を、「Copy API Token」でコピーする。

**重要**: トークンの値は、**この画面で 1 度しか表示されません**。画面を閉じる前に、必ずコピーしてください。コピーし損ねた場合は、トークンを作り直します。

**もし、Workers AI のページに「Create a Workers AI API Token」が見つからない場合**: 「My Profile」→「API Tokens」→「Create Token」→「Create Custom Token」で、次のように作ります。
- 権限: 「Account」→「Workers AI」→「Read」と、もう 1 行追加して「Edit」。
- アカウントのリソース: 自分のアカウントを選ぶ。
- 「Continue to summary」→「Create Token」で作成し、値をコピーする。

公式ドキュメント:
- https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/

---

## 4. （おすすめ）アプリを使う前に、API を直接試す

アプリの設定を書く前に、ターミナルから、Cloudflare の API を直接呼んで、アカウント ID とトークンが正しいことを確認します。うまくいかないときの原因を、アプリと切り分けやすくなります。

1. ターミナルを開く。
2. 次の 2 行を実行して、アカウント ID とトークンを、そのターミナルの中だけの変数に入れる。トークンは、入力しても画面に表示されません（貼り付けて Enter）。

```bash
read -r CLOUDFLARE_ACCOUNT_ID
read -rs CLOUDFLARE_API_TOKEN
```

   1 行目の後で、アカウント ID を貼り付けて Enter、2 行目の後で、トークンを貼り付けて Enter を押します。

3. 次のコマンドで、画像を 1 枚生成する。

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/black-forest-labs/flux-1-schnell" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A simple flat-design illustration of a lightbulb, white background, no text","steps":4,"seed":12345}' \
  -o response.json
```

4. 次のコマンドで、画像のファイル（`test.jpg`）を作る。

```bash
python3 -c "import json,base64; open('test.jpg','wb').write(base64.b64decode(json.load(open('response.json'))['result']['image']))"
```

5. `test.jpg` を開いて、電球のイラストが表示されれば成功。

6. 後片付け。試したファイルと変数を消す。

```bash
rm -f response.json test.jpg
unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN
```

**うまくいかないとき**: `response.json` の中身（テキスト）を開いて、`errors` の欄を見てください。
- `Authentication error` や `Invalid` を含む → トークンまたはアカウント ID が違う（手順 2・3 をやり直す）。
- `permission` を含む → トークンの権限に、「Workers AI」の Read と Edit が両方あるかを確認する。
- 無料枠やリミットに関するメッセージ → 今日の無料枠を使い切っている（翌日、日本時間の午前 9 時以降に、再度試す）。

---

## 5. アプリの設定ファイルに書く

1. ターミナルで、アプリの `client` フォルダへ移動する。

```bash
cd client
```

2. 設定ファイルの見本をコピーして、`.env.local` を作る。

```bash
cp .env.example .env.local
```

3. `.env.local` をエディタで開いて、2 つの値を書く。`=` の後ろに、値をそのまま書きます（引用符（`"`）も、前後の空白も、付けません）。

```
CLOUDFLARE_ACCOUNT_ID=（手順 2 でコピーしたアカウント ID）
CLOUDFLARE_API_TOKEN=（手順 3 でコピーしたトークン）
```

4. 保存して、エディタを閉じる。メモ帳などに一時的に貼っていたアカウント ID とトークンは、消す。

5. Git に載らないことを確認する。

```bash
cd リポジトリルート
git check-ignore client/.env.local
git status --short
```

   - 1 行目で、`client/.env.local` と表示されれば、Git に載りません（無視されています）。
   - 2 行目の一覧に、`.env.local` が出ていなければ、問題ありません。

**注意**: `.env.local` は、**絶対にコミットしない**でください。上のコマンドで、無視されていることを確認できれば、通常は、コミットされません。

---

## 6. アプリを起動して、イラストを生成する

1. 開発サーバーを起動する（すでに起動している場合は、`Ctrl + C` で止めてから、起動し直す。設定ファイルは、起動時に読まれるためです）。

```bash
cd client
npm run dev
```

2. ブラウザで、http://localhost:3000 を開く。
3. 画面の空白をダブルクリックして、ノードを追加する。
4. ノードをダブルクリックして、テキストを入力する（例: 「アイデア」「予算」）。Enter で確定する。
5. ノードをクリックして、選択する。
6. 画面の右のパネル「イラスト」に、選択したノードのテキストが表示される。「イラストを生成」ボタンを押す。
7. 「生成中…」と表示されたあと、数秒〜数十秒で、パネルにイラストが表示される（60 秒たっても返らないときは、時間切れのメッセージが出ます）。
8. （確認）ノードを右クリックして、メニューの「イラストを生成」からも、同じように生成できる。

**確認のチェックリスト**

- [ ] パネルに、選択したノードのテキストが表示される。
- [ ] ボタンを押すと、「生成中…」になり、ボタンが押せなくなる。
- [ ] イラストが、パネルに表示される。
- [ ] 別のノードを選ぶと、先ほどのイラストは、パネルから消える（イラストの保存と、ノードへの紐付けは、まだありません。次の機能で対応します）。
- [ ] ノードのテキストが空のときは、「テキストが空、または長すぎる」という案内が出る。

---

## 7. 困ったとき

画面に出たメッセージごとの、原因と対処です。

| 画面のメッセージ | 主な原因 | 対処 |
|---|---|---|
| 「イラスト生成の設定（Cloudflareの認証情報）が見つかりません」 | `.env.local` が、正しい場所にない、変数名の間違い、値が空、サーバーを再起動していない | `client/.env.local` にあるか（`client` フォルダの直下）、変数名が `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` か、値が空でないか、`npm run dev` を再起動したかを確認する。アカウント ID に、空白や記号（`/`、`?`、`#`）が入っていないかも確認する |
| 「無料の利用上限に達しました…」 | 今日の無料枠（10,000 Neurons）を使い切った、または一時的な制限 | 日本時間の午前 9 時（0:00 UTC）以降に、再度試す。一時的な制限の場合は、少し待つ |
| 「イラストの生成に失敗しました」 | トークンの権限不足、アカウント ID またはトークンの間違い、Cloudflare 側の一時的な障害、時間切れ（60 秒） | 手順 4 の方法で、API を直接試して、原因を切り分ける。手順 4 でも失敗するなら、トークンまたはアカウント ID を見直す。手順 4 が成功するなら、少し待って、アプリで再度試す |
| 「ノードのテキストが空、または長すぎる…」 | ノードのテキストが空、または 200 文字を超えている | ノードのテキストを入力する（200 文字以内） |
| 「通信に失敗しました」 | 開発サーバーが止まっている、ネットワークの問題 | ターミナルで、`npm run dev` が動いているかを確認する。ブラウザを再読み込みする |
| ボタンが押せない（グレーのまま） | ノードが選択されていない、または、他のノードを生成中 | ノードをクリックして選択する。生成中の場合は、終わるまで待つ |

**トークンを漏らしてしまったとき（チャットや Git に貼った、他の人に見せたなど）**

1. すぐに、Cloudflare のダッシュボードで、そのトークンを削除する（「My Profile」→「API Tokens」で、該当のトークンを選んで削除、または再生成する）。
2. 手順 3 で、新しいトークンを作り、`.env.local` の値を差し替える。
3. Git にコミットしてしまった場合は、その履歴にトークンが残るので、必ず、1 の削除を先に行う。

---

## 8. 使うときの注意

- **公開しない**: このアプリのイラスト生成の API には、認証も、アクセス元の確認（Origin チェック）も、レート制限もありません。認証情報を設定したまま、インターネットに公開すると、誰でも、あなたの無料枠を使えてしまいます。自分のパソコンで、自分だけが使う前提で使ってください。公開するときは、認証とアクセス元の確認を、先に追加する必要があります。
- **Free プランのままにする**: Cloudflare の Workers Paid プランにすると、無料枠を超えた分が、従量課金になります。従量課金を避けたいときは、Free プランのままにしてください。料金の情報: https://developers.cloudflare.com/workers-ai/platform/pricing/
- **無料枠の条件は、変わることがあります。** 2026 年 7 月に、一部のモデルが、有料プランの対象に移った例があります。FLUX.1 schnell が、無料プランで使えなくなった場合は、エラーが続きます。そのときは、開発者に相談してください（生成を呼び出す部分だけを、差し替えられる設計にしています）。
- **使用量の確認**: Cloudflare のダッシュボードの Workers AI のページで、使用量が確認できる場合があります。無料枠の残りが気になるときに、見てください。

---

## 参照

- Workers AI の始め方（REST API）: https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- Workers AI の料金と制限: https://developers.cloudflare.com/workers-ai/platform/pricing/
- API トークンの作成: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- アカウント ID の確認: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/
- FLUX.1 schnell の API 仕様: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- このアプリの設定の概要: `client/README.md` の「イラスト生成の設定」
