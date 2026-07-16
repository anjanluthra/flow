-- ============================================================================
-- Flow: seed the transfer/investment categories
-- Migration: 010_transfer_categories.sql
--
-- These carry category_type 'transfer'. When a transaction is assigned one of
-- them the app also sets transactions.type = 'transfer' (and is_internal_transfer
-- for Internal Transfer), so the P&L excludes money moving between your own
-- pockets / into investments — it's not income or spending.
-- ============================================================================

INSERT INTO categories (name, type, icon_name, color_hex, sort_order) VALUES
  ('Internal Transfer', 'transfer', 'arrow-left-right', '#64748B', 1),
  ('Investments',       'transfer', 'trending-up',      '#0D9488', 2)
ON CONFLICT (name) DO NOTHING;
