-- 本
CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  cover_url TEXT,
  owner_nickname TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 貸出記録（returned_at が NULL のものが貸出中）
CREATE TABLE loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  borrower_nickname TEXT NOT NULL,
  borrowed_at TEXT NOT NULL DEFAULT (datetime('now')),
  returned_at TEXT
);

-- 1冊の本が同時に2人に貸し出されないようにする
CREATE UNIQUE INDEX loans_one_active_per_book ON loans(book_id) WHERE returned_at IS NULL;
