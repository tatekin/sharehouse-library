import { applyD1Migrations, env } from "cloudflare:test";

// テストのたびにDBのテーブルを作る
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
