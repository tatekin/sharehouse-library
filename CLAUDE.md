# シェアハウス図書館（本の貸し借りサイト）

シェアハウスの住人が貸している本の一覧と、「今借りられるか」を確認できるWebアプリ。
勉強・趣味で作るもので、利用者は住人2〜3人。

## 方針（決定事項）

- **費用は0円**。どのサービスにもクレジットカードを登録しない。無料枠を超えたら止まるだけの構成にする。
- **ログインなし**。ただし次の3つは最初から入れる。
  - 検索エンジンに載せない（全ページに `<meta name="robots" content="noindex">`、`robots.txt` で全拒否）
  - 借りた人の名前は本名ではなくニックネームで表示する
  - データはD1のTime Travelで戻せる前提にする（手作業でDBをいじらない）
- 困ったことが起きたら、Basic認証（パスワードはWorkersのSecretsに保存）を後付けする。

## 技術スタック

- ホスティング：Cloudflare Workers（静的アセット配信＋API）。Pagesではなく Workers を使う
- API：Hono（`src/index.ts`）。`/api/*` だけWorkerが処理し、それ以外は `public/` の静的ファイル
- フロント：`public/` のHTML・CSS・素のJavaScript（ビルド不要）
- DB：Cloudflare D1。SQLを直接書く（ORMは使わない）
- テスト：Vitest ＋ `@cloudflare/vitest-plugin`（Workersの実行環境とD1をローカルで再現）
- Node.js 24 / npm 11
- ドメイン：`*.workers.dev`（独自ドメインは取らない）
- デプロイ：Cloudflare Workers Builds（GitHub連携。mainへのマージで本番反映、PRごとにプレビューURL）
- CI：GitHub Actions（型チェック・テスト・ビルド）

## 機能

- 本の一覧（貸出可／貸出中がひと目で分かる。貸出中は借りている人のニックネームも表示）
- 「借りる」「返す」ボタン
- 本の登録（持ち主のニックネーム、タイトル、著者、表紙）
- ISBNを入力すると書籍APIからタイトル・表紙を自動取得（無料・キー不要のAPIを使う）

## DB（`migrations/0001_init.sql`）

- `books`：id, title, author, isbn, cover_url, owner_nickname, created_at
- `loans`：id, book_id, borrower_nickname, borrowed_at, returned_at（NULLなら貸出中）
- 1冊が同時に2人に貸し出されないよう、`returned_at IS NULL` の部分ユニークインデックスで守っている
- 返却しても貸出記録は消さない（履歴として残す）

## 開発フロー（AIに頼むだけで本番反映）

1. 作業は `claude/` で始まるブランチで行い、完了したらPRを作る（ドラフトにはしない）
2. GitHub Actionsで型チェック・テスト・ビルドが走る
3. CIが通ったら自動マージでmainに取り込まれる
4. Workers Buildsがmainの変更を検知して本番にデプロイする
5. CIが落ちたら原因を調べて修正をpushする

## コマンド

- `npm run dev`：ローカルで起動（初回は `npm run db:migrate:local` でテーブル作成）
- `npm run typecheck`：型チェック
- `npm test`：テスト
- `npm run deploy`：本番DBにマイグレーションを適用してからデプロイ（Workers Buildsのデプロイコマンドにも使う）
- `npm run cf-typegen`：`wrangler.jsonc` を変えたら実行して型を作り直す

## 作業ルール

- テストと型チェックが通ることを確認してからpushする
- 「貸出データが消えない」「借りる→返すで状態が正しく戻る」はテストで守る
- DBのスキーマ変更は必ずマイグレーションファイルで行い、デプロイ時に適用されるようにする
- APIキーやパスワードはコードに書かず、Secretsに保存する
- デプロイはGitHub ActionsではなくWorkers Buildsに任せる（GITHUB_TOKENによるマージでは後続ワークフローが起動しないため）

## 最初の準備（人間がブラウザで1回だけやる）

- [x] GitHubでリポジトリを作成（住人の情報を扱うので非公開）
- [x] Claude GitHub Appをリポジトリにインストール
- [ ] Cloudflareアカウント作成（カード登録なし）→ Workersとリポジトリを連携、D1データベースを作成
- [ ] リポジトリ設定で自動マージを許可し、mainにブランチ保護（CI必須）を設定
- [x] CIと自動マージ予約のワークフローを追加（`.github/workflows/`）

手順の詳細は README.md を参照。

## 次に作るもの（別リポジトリ）

全国のダイビングスポットの魚図鑑（Astroの静的サイト）。スポット×魚×季節でまとめる。
ショップのログからは魚名・日付・スポット・出典URLだけを抽出し、文章や写真は転載しない。出典としてリンクを貼る。
リポジトリは公開にする（GitHub Actionsが無制限になるため）。
