-- ============================================================================
-- Flow: learned account fingerprints for import auto-detection
-- Migration: 011_account_import_hints.sql
--
-- When you manually tell the importer which account a statement is for, it
-- stores a fingerprint (the statement's column layout and any id-like token in
-- the filename) so the same bank's exports auto-detect next time.
-- ============================================================================

CREATE TABLE account_import_hints (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES accounts ON DELETE CASCADE,
  hint_type   text        NOT NULL,   -- 'header_signature' | 'filename_token'
  hint_value  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_account_import_hints UNIQUE (hint_type, hint_value)
);
