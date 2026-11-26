const $ = (sel) => document.querySelector(sel);
const nicknameInput = $("#nickname");
const listEl = $("#books");
const messageEl = $("#message");

// ニックネームはこの端末に覚えておく
nicknameInput.value = localStorage.getItem("nickname") ?? "";
nicknameInput.addEventListener("change", () => {
  localStorage.setItem("nickname", nicknameInput.value.trim());
});

function showMessage(text, kind = "error") {
  messageEl.textContent = text;
  messageEl.className = `message ${kind === "info" ? "info" : ""}`;
  messageEl.hidden = false;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => (messageEl.hidden = true), 4000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "エラーが発生しました");
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) if (child != null) node.append(child);
  return node;
}

function formatDate(sqlDate) {
  if (!sqlDate) return "";
  const d = new Date(sqlDate.replace(" ", "T") + "Z");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderBook(book) {
  const cover = book.coverUrl
    ? el("img", { src: book.coverUrl, alt: "", loading: "lazy" })
    : el("div", { class: "noimg", "aria-hidden": "true" }, "📖");

  const status = book.loan
    ? el("span", { class: "badge busy" }, `貸出中：${book.loan.borrower}（${formatDate(book.loan.borrowedAt)}〜）`)
    : el("span", { class: "badge ok" }, "貸出できます");

  const info = el(
    "div",
    {},
    status,
    el("div", { class: "title" }, book.title),
    el("div", { class: "meta" }, [book.author, `持ち主：${book.owner}`].filter(Boolean).join(" ・ "))
  );

  const button = book.loan
    ? el("button", { onclick: () => act(book.id, "return") }, "返す")
    : el("button", { class: "primary", onclick: () => act(book.id, "borrow") }, "借りる");

  return el("li", { class: "book" }, cover, info, el("div", { class: "actions" }, button));
}

async function load() {
  try {
    const books = await api("/api/books");
    listEl.replaceChildren(...books.map(renderBook));
    $("#empty").hidden = books.length > 0;
    const available = books.filter((b) => !b.loan).length;
    $("#summary").textContent = books.length ? `${books.length}冊中 ${available}冊 貸出可` : "";
  } catch (e) {
    showMessage(e.message);
  }
}

async function act(id, action) {
  const nickname = nicknameInput.value.trim();
  if (action === "borrow" && !nickname) {
    showMessage("右上にニックネームを入力してください");
    nicknameInput.focus();
    return;
  }
  try {
    await api(`/api/books/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify({ nickname }),
    });
    showMessage(action === "borrow" ? "借りました" : "返しました", "info");
  } catch (e) {
    showMessage(e.message);
  }
  load();
}

// ISBNから書誌情報を取得（openBD → Google Books の順に試す）
async function lookupIsbn(isbn) {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (!clean) return null;
  try {
    const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${clean}`);
    const [item] = await res.json();
    if (item?.summary?.title) {
      return {
        title: item.summary.title,
        author: item.summary.author ?? "",
        coverUrl: item.summary.cover?.startsWith("https://") ? item.summary.cover : "",
      };
    }
  } catch {}
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
    const data = await res.json();
    const info = data.items?.[0]?.volumeInfo;
    if (info?.title) {
      const thumb = info.imageLinks?.thumbnail ?? "";
      return {
        title: info.title,
        author: (info.authors ?? []).join("、"),
        coverUrl: thumb.replace(/^http:\/\//, "https://"),
      };
    }
  } catch {}
  return null;
}

const form = $("#add-form");
const preview = $("#cover-preview");

$("#lookup").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  const found = await lookupIsbn(form.isbn.value);
  button.disabled = false;
  if (!found) {
    showMessage("本が見つかりませんでした。手入力してください");
    return;
  }
  form.title.value = found.title;
  form.author.value = found.author;
  form.coverUrl.value = found.coverUrl;
  preview.src = found.coverUrl;
  preview.hidden = !found.coverUrl;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    await api("/api/books", { method: "POST", body: JSON.stringify(data) });
    form.reset();
    preview.hidden = true;
    form.owner.value = nicknameInput.value.trim();
    showMessage("登録しました", "info");
    load();
  } catch (e) {
    showMessage(e.message);
  }
});

$("#add-panel").addEventListener("toggle", () => {
  if (!form.owner.value) form.owner.value = nicknameInput.value.trim();
});

load();
