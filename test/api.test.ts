import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { LIMITS } from "../src/index";

const post = (path: string, body: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const getBooks = async () => {
  const res = await SELF.fetch("https://example.com/api/books");
  return (await res.json()) as Array<{ id: number; title: string; loan: { borrower: string } | null }>;
};

// テスト用DBはテスト間で共有されるので、毎回空にしてから始める（書き込み回数の制限に影響するため）
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM loans"), env.DB.prepare("DELETE FROM books")]);
});

const send = (method: string, path: string, body?: unknown) =>
  SELF.fetch(`https://example.com${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const findBook = async (id: number) => (await getBooks()).find((b) => b.id === id);

const addBook = async (title = "星の王子さま") => {
  const res = await post("/api/books", { title, owner: "ささき" });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: number }).id;
};

describe("本の登録", () => {
  it("タイトルと持ち主があれば登録できる", async () => {
    const id = await addBook();
    const book = await findBook(id);
    expect(book?.title).toBe("星の王子さま");
    expect(book?.loan).toBeNull();
  });

  it("タイトルがないと登録できない", async () => {
    const res = await post("/api/books", { owner: "ささき" });
    expect(res.status).toBe(400);
  });
});

describe("貸し借り", () => {
  it("借りる→返すで状態が正しく戻る", async () => {
    const id = await addBook();

    expect((await post(`/api/books/${id}/borrow`, { nickname: "たろう" })).status).toBe(200);
    expect((await findBook(id))?.loan?.borrower).toBe("たろう");

    expect((await post(`/api/books/${id}/return`, {})).status).toBe(200);
    expect((await findBook(id))?.loan).toBeNull();
  });

  it("貸出中の本は他の人が借りられない", async () => {
    const id = await addBook();
    await post(`/api/books/${id}/borrow`, { nickname: "たろう" });
    const res = await post(`/api/books/${id}/borrow`, { nickname: "はなこ" });
    expect(res.status).toBe(409);
  });

  it("貸出中でない本は返せない", async () => {
    const id = await addBook();
    expect((await post(`/api/books/${id}/return`, {})).status).toBe(409);
  });

  it("ニックネームがないと借りられない", async () => {
    const id = await addBook();
    expect((await post(`/api/books/${id}/borrow`, {})).status).toBe(400);
  });

  it("返却しても貸出記録は消えない", async () => {
    const id = await addBook();
    await post(`/api/books/${id}/borrow`, { nickname: "たろう" });
    await post(`/api/books/${id}/return`, {});
    await post(`/api/books/${id}/borrow`, { nickname: "はなこ" });
    const { results } = await env.DB.prepare("SELECT * FROM loans WHERE book_id = ?").bind(id).all();
    expect(results).toHaveLength(2);
  });
});

describe("本の編集・削除", () => {
  it("タイトル・著者・持ち主を直せる", async () => {
    const id = await addBook("星の王子様");
    const res = await send("PATCH", `/api/books/${id}`, {
      title: "星の王子さま",
      author: "サン＝テグジュペリ",
      owner: "さとう",
    });
    expect(res.status).toBe(200);
    const { results } = await env.DB.prepare("SELECT * FROM books WHERE id = ?").bind(id).all();
    expect(results[0]).toMatchObject({
      title: "星の王子さま",
      author: "サン＝テグジュペリ",
      owner_nickname: "さとう",
    });
  });

  it("タイトルを空にはできない", async () => {
    const id = await addBook();
    expect((await send("PATCH", `/api/books/${id}`, { title: "", owner: "ささき" })).status).toBe(400);
  });

  it("削除すると一覧から消えるが、本と貸出記録の行は残る", async () => {
    const id = await addBook();
    await post(`/api/books/${id}/borrow`, { nickname: "たろう" });
    await post(`/api/books/${id}/return`, {});

    expect((await send("DELETE", `/api/books/${id}`)).status).toBe(200);
    expect(await findBook(id)).toBeUndefined();

    const book = await env.DB.prepare("SELECT deleted_at FROM books WHERE id = ?").bind(id).first();
    expect(book?.deleted_at).not.toBeNull();
    const { results } = await env.DB.prepare("SELECT * FROM loans WHERE book_id = ?").bind(id).all();
    expect(results).toHaveLength(1);
  });

  it("貸出中の本は削除できない", async () => {
    const id = await addBook();
    await post(`/api/books/${id}/borrow`, { nickname: "たろう" });
    expect((await send("DELETE", `/api/books/${id}`)).status).toBe(409);
    expect((await findBook(id))?.loan?.borrower).toBe("たろう");
  });

  it("削除した本は借りられず、編集もできない", async () => {
    const id = await addBook();
    await send("DELETE", `/api/books/${id}`);
    expect((await post(`/api/books/${id}/borrow`, { nickname: "たろう" })).status).toBe(404);
    expect((await send("PATCH", `/api/books/${id}`, { title: "x", owner: "y" })).status).toBe(404);
    expect((await send("DELETE", `/api/books/${id}`)).status).toBe(404);
  });
});

describe("書き込みすぎ対策", () => {
  const seedBooks = (n: number, createdAt = "datetime('now')") =>
    env.DB.batch(
      Array.from({ length: n }, () =>
        env.DB.prepare(
          `INSERT INTO books (title, owner_nickname, created_at) VALUES ('ダミー', '制限テスト', ${createdAt})`
        )
      )
    );

  it("1分間に登録しすぎると429になる", async () => {
    await seedBooks(LIMITS.booksPerMinute);
    const res = await post("/api/books", { title: "あふれる本", owner: "ささき" });
    expect(res.status).toBe(429);
  });

  it("登録できる冊数には上限がある", async () => {
    await seedBooks(LIMITS.maxBooks, "datetime('now', '-1 hour')");
    const res = await post("/api/books", { title: "あふれる本", owner: "ささき" });
    expect(res.status).toBe(400);
  });

  it("1分間に借りすぎると429になる", async () => {
    const id = await addBook();
    await env.DB.batch(
      Array.from({ length: LIMITS.loansPerMinute }, () =>
        env.DB.prepare(
          "INSERT INTO loans (book_id, borrower_nickname, returned_at) VALUES (?, '制限テスト', datetime('now'))"
        ).bind(id)
      )
    );
    expect((await post(`/api/books/${id}/borrow`, { nickname: "たろう" })).status).toBe(429);
  });
});

describe("検索エンジン対策", () => {
  it("APIのレスポンスにnoindexが付く", async () => {
    const res = await SELF.fetch("https://example.com/api/books");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
