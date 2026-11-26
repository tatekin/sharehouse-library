import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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

describe("検索エンジン対策", () => {
  it("APIのレスポンスにnoindexが付く", async () => {
    const res = await SELF.fetch("https://example.com/api/books");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
