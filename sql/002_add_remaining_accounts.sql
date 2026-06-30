-- ============================================================================
-- Flow: Add remaining accounts + is_corporate flag
-- Migration: 002_add_remaining_accounts.sql
-- ============================================================================

-- 1. Add is_corporate column to accounts
ALTER TABLE accounts ADD COLUMN is_corporate BOOLEAN NOT NULL DEFAULT false;

-- 2. Update existing account names to match display names
UPDATE accounts SET name = 'FAB iSavings Account' WHERE name = 'FAB iSavings';
UPDATE accounts SET name = 'IBKR S&P ISP' WHERE name = 'IBKR';
UPDATE accounts SET name = 'Monzo Joint (UK)' WHERE name = 'Monzo Joint';
UPDATE accounts SET name = 'Santander/NS&I (UK)' WHERE name = 'Santander/NS&I';

-- 3. Add missing accounts from the Net Worth Model spreadsheet
INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('FAB 3% FD',              'FAB',          'AE', 'AED', 'savings',    'joint',  'cash',           't2_5_locked',     false);

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('FAB Elite Card Debt',    'FAB',          'AE', 'AED', 'credit',     'joint',  'debt',           't1_instant',      false);

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('Axis FD',                'Axis Bank',    'IN', 'USD', 'savings',    'anjan',  'cash',           't2_5_locked',     false);

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('Upvolt Equity',          'Upvolt',       'GB', 'GBP', 'other',      'anjan',  'private_equity', 't3_locked_years', false);

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('UAE Car',                'N/A',          'AE', 'AED', 'other',      'anjan',  'car',            't3_locked_years', false);

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('Upvolt Debt',            'Upvolt',       'GB', 'USD', 'other',      'anjan',  'private_debt',   't3_locked_years', false);

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('Trump Meme Coin',        'Crypto',       'US', 'USD', 'investment', 'anjan',  'crypto',         't2_days',         false);

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate) VALUES
  ('Corporate Cash Balance', 'Indexed Ltd',  'GB', 'USD', 'checking',   'joint',  'cash',           't2_days',         true);

-- 4. Deactivate Barclaycard (not in current model)
UPDATE accounts SET is_active = false WHERE name = 'Barclaycard Credit Card';

-- 5. Add unique constraint on net_worth_snapshots for date (needed for upsert)
ALTER TABLE net_worth_snapshots ADD CONSTRAINT uq_net_worth_snapshots_date UNIQUE (snapshot_date);
