-- ============================================================================
-- Flow: Investments tracker (cost basis, current value, returns, cash flow)
-- Migration: 005_investments.sql
-- ============================================================================

CREATE TABLE investments (
  id                  uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text             NOT NULL,
  account_id          uuid             REFERENCES accounts ON DELETE SET NULL,
  asset_class         asset_class_type NOT NULL DEFAULT 'equities',
  currency            text             NOT NULL DEFAULT 'USD',
  units               numeric(18, 6),
  cost_basis_local    numeric(14, 2)   NOT NULL DEFAULT 0,
  cost_basis_usd      numeric(14, 2)   NOT NULL DEFAULT 0,
  current_value_usd   numeric(14, 2)   NOT NULL DEFAULT 0,
  annual_cashflow_usd numeric(14, 2)   NOT NULL DEFAULT 0,
  purchase_date       date,
  notes               text,
  is_active           boolean          NOT NULL DEFAULT true,
  created_at          timestamptz      NOT NULL DEFAULT now(),
  updated_at          timestamptz      NOT NULL DEFAULT now()
);

-- Seed from the current investment positions (values from the Net Worth
-- Model; cost basis unknown — fill in via the Investing page).
INSERT INTO investments (name, account_id, asset_class, currency, current_value_usd, annual_cashflow_usd)
SELECT 'IBKR S&P ISP', id, 'equities', 'USD', 146986, 0 FROM accounts WHERE name = 'IBKR S&P ISP';

INSERT INTO investments (name, account_id, asset_class, currency, current_value_usd, annual_cashflow_usd)
SELECT 'Hargreaves S&P Pension', id, 'equities', 'GBP', 28336, 0 FROM accounts WHERE name = 'Hargreaves S&P Pension';

INSERT INTO investments (name, account_id, asset_class, currency, current_value_usd, annual_cashflow_usd)
SELECT 'Hargreaves Schroder Pension', id, 'equities', 'GBP', 51194, 0 FROM accounts WHERE name = 'Hargreaves Schroder Pension';

INSERT INTO investments (name, account_id, asset_class, currency, current_value_usd, annual_cashflow_usd)
SELECT 'Upvolt Equity', id, 'private_equity', 'GBP', 41013, 0 FROM accounts WHERE name = 'Upvolt Equity';

INSERT INTO investments (name, account_id, asset_class, currency, current_value_usd, annual_cashflow_usd)
SELECT 'Upvolt Debt', id, 'private_debt', 'USD', 50000, 5500 FROM accounts WHERE name = 'Upvolt Debt';

INSERT INTO investments (name, account_id, asset_class, currency, current_value_usd, annual_cashflow_usd)
SELECT 'Trump Meme Coin', id, 'crypto', 'USD', 500, 0 FROM accounts WHERE name = 'Trump Meme Coin';
