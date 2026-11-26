# シェアハウス図書館

シェアハウスの住人が貸している本の一覧と、今借りられるかどうかが分かるWebアプリ。
Cloudflare Workers ＋ D1 の無料枠だけで動きます（クレジットカード登録は不要）。

## 最初の準備（1回だけ）

### 1. GitHub

1. 公開（Public）でリポジトリを作り、コードを置く（済）
   ※ 無料プランで自動マージとブランチ保護を使うには公開が必要。住人の情報はD1にだけ入る
2. **Settings → General → Pull Requests** で「Allow auto-merge」にチェック（済）
3. **Settings → Branches（または Rules → Rulesets）** で `main` にルールを追加
   - 「Require a pull request before merging」をオン
   - 「Require status checks to pass」をオンにして、チェック名 `test` を必須にする（済）
4. [Claude GitHub App](https://github.com/apps/claude) をこのリポジトリにインストール（済）

### 2. Cloudflare（カード登録なし）

1. Cloudflareのアカウントを作る
2. **ストレージとデータベース → D1** で `sharehouse-library` という名前のデータベースを作る（済）
3. 表示された **データベースID** を `wrangler.jsonc` の `database_id` に貼り付けて、GitHubに反映する（済）
4. **Workers & Pages → 作成 → Gitリポジトリをインポート** でこのリポジトリを選ぶ
   - デプロイコマンド：`npm run deploy`
   - 「main以外のブランチのビルド」をオンにすると、PRごとにプレビューURLが届く
5. デプロイが終わると `https://sharehouse-library.<あなたのサブドメイン>.workers.dev` で開ける

## 普段の使い方（AIに頼むだけ）

Claudeアプリの Code タブでこのリポジトリを選び、「〇〇を追加して」と頼む。
→ Claude Codeが `claude/` ブランチでPRを作る → CIが通ると自動マージ → Cloudflareが本番に反映。

## 手元で動かす場合

```sh
npm ci
npm run db:migrate:local   # 初回だけ。ローカルDBにテーブルを作る
npm run dev                # http://localhost:8787
npm test                   # テスト
```
