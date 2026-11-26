import { Hono } from "hono";

type Bindings = { DB: D1Database; ASSETS: Fetcher };

type BookRow = {
  id: number;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  owner_nickname: string;
  created_at: string;
  borrower_nickname: string | null;
  borrowed_at: string | null;
};

const app = new Hono<{ Bindings: Bindings }>();

// 検索エンジンに載せない
app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
});

const clean = (v: unknown, max = 100): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length === 0 ? null : s.slice(0, max);
};

// 本の一覧（貸出中の人を含む）。貸出可の本を先に並べる
app.get("/api/books", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.*, l.borrower_nickname, l.borrowed_at
       FROM books b
       LEFT JOIN loans l ON l.book_id = b.id AND l.returned_at IS NULL
      ORDER BY (l.id IS NOT NULL), b.title`
  ).all<BookRow>();
  return c.json(
    results.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      isbn: r.isbn,
      coverUrl: r.cover_url,
      owner: r.owner_nickname,
      loan: r.borrower_nickname
        ? { borrower: r.borrower_nickname, borrowedAt: r.borrowed_at }
        : null,
    }))
  );
});

// 本を登録
app.post("/api/books", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = clean(body.title, 200);
  const owner = clean(body.owner, 30);
  if (!title || !owner) {
    return c.json({ error: "タイトルと持ち主のニックネームは必須です" }, 400);
  }
  const coverUrl = clean(body.coverUrl, 500);
  const row = await c.env.DB.prepare(
    `INSERT INTO books (title, author, isbn, cover_url, owner_nickname)
     VALUES (?, ?, ?, ?, ?) RETURNING id`
  )
    .bind(
      title,
      clean(body.author, 200),
      clean(body.isbn, 20),
      coverUrl && coverUrl.startsWith("https://") ? coverUrl : null,
      owner
    )
    .first<{ id: number }>();
  return c.json({ id: row?.id }, 201);
});

// 借りる
app.post("/api/books/:id/borrow", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const nickname = clean(body.nickname, 30);
  if (!nickname) return c.json({ error: "ニックネームを入力してください" }, 400);

  const book = await c.env.DB.prepare("SELECT id FROM books WHERE id = ?").bind(id).first();
  if (!book) return c.json({ error: "本が見つかりません" }, 404);

  try {
    await c.env.DB.prepare("INSERT INTO loans (book_id, borrower_nickname) VALUES (?, ?)")
      .bind(id, nickname)
      .run();
  } catch {
    return c.json({ error: "この本はすでに貸出中です" }, 409);
  }
  return c.json({ ok: true });
});

// 返す
app.post("/api/books/:id/return", async (c) => {
  const id = Number(c.req.param("id"));
  const res = await c.env.DB.prepare(
    "UPDATE loans SET returned_at = datetime('now') WHERE book_id = ? AND returned_at IS NULL"
  )
    .bind(id)
    .run();
  if (res.meta.changes === 0) return c.json({ error: "この本は貸出中ではありません" }, 409);
  return c.json({ ok: true });
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

export default app;
