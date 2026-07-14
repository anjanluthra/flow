-- ============================================================================
-- Flow: DB-backed user management (Settings page)
-- Migration: 007_user_auth.sql
--
-- The two founding users keep their env-var passwords (AUTH_PASSWORD_ANJAN /
-- AUTH_PASSWORD_KATE); users added via Settings authenticate against
-- password_hash (bcrypt).
-- ============================================================================

ALTER TABLE users ADD COLUMN password_hash text;
ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true;
