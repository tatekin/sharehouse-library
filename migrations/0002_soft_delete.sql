-- 本の削除は「削除済み」の印を付けるだけにする（貸出記録を残すため、行は消さない）
ALTER TABLE books ADD COLUMN deleted_at TEXT;
