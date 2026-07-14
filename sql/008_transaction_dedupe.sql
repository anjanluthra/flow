-- ============================================================================
-- Flow: Import de-duplication
-- Migration: 008_transaction_dedupe.sql
--
-- Each imported transaction gets a content hash derived from
-- (account, date, amount, description, occurrence-within-statement). A unique
-- index on it means re-importing the same statement can never double-count:
-- identical rows collide and are skipped (ON CONFLICT DO NOTHING). Genuinely
-- repeated transactions (e.g. two identical coffees on one day) survive because
-- their occurrence index differs. Existing rows keep a NULL hash — Postgres
-- allows multiple NULLs in a unique index, so they don't collide.
-- ============================================================================

ALTER TABLE transactions ADD COLUMN dedupe_hash text;

CREATE UNIQUE INDEX uq_transactions_dedupe_hash
  ON transactions (dedupe_hash)
  WHERE dedupe_hash IS NOT NULL;
