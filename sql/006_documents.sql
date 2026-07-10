-- ============================================================================
-- Flow: Statement/document storage per account
-- Migration: 006_documents.sql
--
-- Files are stored in Postgres (bytea). Statements are small (CSV/PDF, a few
-- hundred KB); uploads are capped at 4 MB in the API, which also fits within
-- the serverless request-body limit.
-- ============================================================================

CREATE TABLE documents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid        REFERENCES accounts ON DELETE SET NULL,
  file_name      text        NOT NULL,
  mime_type      text        NOT NULL,
  statement_date date,
  size_bytes     int         NOT NULL,
  content        bytea       NOT NULL,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_account ON documents (account_id, statement_date DESC);
