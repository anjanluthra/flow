-- ============================================================================
-- Flow: capital events (asset sales, inheritance, gifts)
-- Migration: 013_capital_events.sql
--
-- A capital event bundles a one-off's proceeds AND its associated costs (e.g. a
-- house sale + its broker/conveyancing fees). Transactions in an event are
-- non-operating: they're pulled out of the operating P&L together, so the
-- operating income/expense figures reflect recurring income vs spending, while
-- the total-cash-flow figure still includes everything.
-- (Applied at runtime by ensureCapitalEvents() in src/lib/db.ts; this file is
-- the canonical record.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  kind       text        NOT NULL DEFAULT 'asset_sale', -- asset_sale | inheritance | gift | other
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES capital_events ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_event ON transactions (event_id);
