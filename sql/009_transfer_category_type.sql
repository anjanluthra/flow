-- ============================================================================
-- Flow: add a 'transfer' category type (internal transfers & investments)
-- Migration: 009_transfer_category_type.sql
--
-- Run this BEFORE 010 — Postgres won't let a newly-added enum value be used in
-- the same transaction that adds it.
-- ============================================================================

ALTER TYPE category_type ADD VALUE IF NOT EXISTS 'transfer';
