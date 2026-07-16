-- ============================================================================
-- Flow: record import metadata on stored statements
-- Migration: 012_document_import_meta.sql
--
-- When a statement is imported it's also archived here, tagged with the format
-- (column signature) and row counts — so the Statements page is a single home
-- for both the files and the per-bank import history.
-- ============================================================================

ALTER TABLE documents ADD COLUMN format_signature text;
ALTER TABLE documents ADD COLUMN imported_count int;
ALTER TABLE documents ADD COLUMN data_rows int;
ALTER TABLE documents ADD COLUMN source text NOT NULL DEFAULT 'upload'; -- 'upload' | 'import'
