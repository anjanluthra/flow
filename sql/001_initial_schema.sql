-- ============================================================================
-- Flow: Personal Finance App — Initial Schema
-- Migration: 001_initial_schema.sql
-- Compatible with plain PostgreSQL / Neon (Vercel Postgres)
-- ============================================================================

-- ============================================================================
-- 1. CUSTOM TYPES (ENUMS)
-- ============================================================================

CREATE TYPE account_type AS ENUM (
  'checking',
  'savings',
  'credit',
  'investment',
  'pension',
  'other'
);

CREATE TYPE holder_type AS ENUM (
  'anjan',
  'kate',
  'joint'
);

CREATE TYPE category_type AS ENUM (
  'income',
  'expense'
);

CREATE TYPE transaction_type AS ENUM (
  'income',
  'expense',
  'transfer'
);

CREATE TYPE asset_class_type AS ENUM (
  'cash',
  'equities',
  'private_equity',
  'private_debt',
  'crypto',
  'car',
  'debt'
);

CREATE TYPE liquidity_tier_type AS ENUM (
  't1_instant',
  't2_days',
  't2_5_locked',
  't3_locked_years'
);


-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- 2a. users
-- --------------------------------------------------------------------------
CREATE TABLE users (
  id         serial      PRIMARY KEY,
  email      text        NOT NULL UNIQUE,
  full_name  text,
  role       text        NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2b. accounts
-- --------------------------------------------------------------------------
CREATE TABLE accounts (
  id              uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text               NOT NULL,
  institution     text,
  country         text,
  currency        text               NOT NULL DEFAULT 'USD',
  type            account_type       NOT NULL,
  holder          holder_type        NOT NULL,
  is_active       boolean            NOT NULL DEFAULT true,
  asset_class     asset_class_type   NOT NULL DEFAULT 'cash',
  liquidity_tier  liquidity_tier_type NOT NULL DEFAULT 't1_instant',
  created_at      timestamptz        NOT NULL DEFAULT now(),
  updated_at      timestamptz        NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2c. categories
-- --------------------------------------------------------------------------
CREATE TABLE categories (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text          NOT NULL UNIQUE,
  type       category_type NOT NULL,
  icon_name  text,
  color_hex  text,
  sort_order int,
  is_active  boolean       NOT NULL DEFAULT true
);

-- --------------------------------------------------------------------------
-- 2d. transactions
-- --------------------------------------------------------------------------
CREATE TABLE transactions (
  id                   uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  date                 date             NOT NULL,
  description          text             NOT NULL,
  amount_local         numeric(14, 2)   NOT NULL,
  currency             text             NOT NULL,
  amount_usd           numeric(14, 2),
  category_id          uuid             REFERENCES categories ON DELETE SET NULL,
  account_id           uuid             REFERENCES accounts   ON DELETE SET NULL,
  type                 transaction_type NOT NULL,
  is_internal_transfer boolean          NOT NULL DEFAULT false,
  is_business_expense  boolean          NOT NULL DEFAULT false,
  is_reimbursed        boolean          NOT NULL DEFAULT false,
  notes                text,
  created_by           int              REFERENCES users ON DELETE SET NULL,
  created_at           timestamptz      NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2e. merchant_mappings
-- --------------------------------------------------------------------------
CREATE TABLE merchant_mappings (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_pattern text           NOT NULL,
  category_id      uuid           NOT NULL REFERENCES categories ON DELETE CASCADE,
  confidence       numeric(3, 2)  NOT NULL DEFAULT 0.80,
  times_used       int            NOT NULL DEFAULT 0,
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2f. balance_snapshots
-- --------------------------------------------------------------------------
CREATE TABLE balance_snapshots (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid           NOT NULL REFERENCES accounts ON DELETE CASCADE,
  balance_local   numeric(14, 2) NOT NULL,
  balance_usd     numeric(14, 2),
  snapshot_date   date           NOT NULL,
  notes           text,
  yield_percent   numeric(5, 2),
  annual_cashflow numeric(14, 2),
  created_at      timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT uq_balance_snapshots_account_date
    UNIQUE (account_id, snapshot_date)
);

-- --------------------------------------------------------------------------
-- 2g. net_worth_snapshots
-- --------------------------------------------------------------------------
CREATE TABLE net_worth_snapshots (
  id                 uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date      date           NOT NULL,
  total_net_worth_usd numeric(14, 2) NOT NULL,
  data               jsonb,
  notes              text,
  created_at         timestamptz    NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2h. fx_rates
-- --------------------------------------------------------------------------
CREATE TABLE fx_rates (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency   text           NOT NULL,
  to_currency     text           NOT NULL,
  rate            numeric(10, 6) NOT NULL,
  effective_date  date           NOT NULL,
  created_at      timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT uq_fx_rates_pair_date
    UNIQUE (from_currency, to_currency, effective_date)
);


-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX idx_transactions_date
  ON transactions (date);

CREATE INDEX idx_transactions_account_id
  ON transactions (account_id);

CREATE INDEX idx_transactions_category_id
  ON transactions (category_id);

CREATE INDEX idx_balance_snapshots_account_date
  ON balance_snapshots (account_id, snapshot_date);

CREATE INDEX idx_fx_rates_pair_date
  ON fx_rates (from_currency, to_currency, effective_date);


-- ============================================================================
-- 4. SEED DATA — USERS
-- ============================================================================

INSERT INTO users (email, full_name, role) VALUES
  ('admin@joinindexed.com', 'Anjan', 'admin'),
  ('kate@joinindexed.com',  'Kate',  'user');


-- ============================================================================
-- 5. SEED DATA — EXPENSE CATEGORIES (17)
-- ============================================================================

INSERT INTO categories (name, type, icon_name, color_hex, sort_order) VALUES
  ('Dining & Coffee',        'expense', 'coffee',        '#F97316', 1),
  ('Groceries',              'expense', 'shopping-cart',  '#84CC16', 2),
  ('Health & Wellness',      'expense', 'heart-pulse',   '#EC4899', 3),
  ('Personal Care',          'expense', 'scissors',      '#A855F7', 4),
  ('Car',                    'expense', 'car',           '#6366F1', 5),
  ('Taxis & Rideshare',      'expense', 'map-pin',       '#8B5CF6', 6),
  ('Household',              'expense', 'home',          '#14B8A6', 7),
  ('Bills & Utilities',      'expense', 'file-text',     '#64748B', 8),
  ('Entertainment',          'expense', 'film',          '#EF4444', 9),
  ('Shopping',               'expense', 'shopping-bag',  '#3B82F6', 10),
  ('Subscriptions',          'expense', 'repeat',        '#06B6D4', 11),
  ('Professional Services',  'expense', 'briefcase',     '#78716C', 12),
  ('Travel & Holidays',      'expense', 'plane',         '#F59E0B', 13),
  ('Gifts',                  'expense', 'gift',          '#D946EF', 14),
  ('Cash',                   'expense', 'banknote',      '#71717A', 15),
  ('Bank Fees',              'expense', 'landmark',      '#94A3B8', 16),
  ('Business Expenses',      'expense', 'building-2',    '#1E293B', 17);


-- ============================================================================
-- 6. SEED DATA — INCOME CATEGORIES (8)
-- ============================================================================

INSERT INTO categories (name, type, icon_name, color_hex, sort_order) VALUES
  ('Salary',            'income', 'wallet',       '#10B981', 1),
  ('Bank Interest',     'income', 'percent',      '#059669', 2),
  ('Dividends',         'income', 'trending-up',  '#0D9488', 3),
  ('Cashback',          'income', 'arrow-down-left', '#0891B2', 4),
  ('Refunds',           'income', 'undo-2',       '#2563EB', 5),
  ('Reimbursements',    'income', 'receipt',       '#7C3AED', 6),
  ('Gifts Received',    'income', 'gift',          '#DB2777', 7),
  ('Inheritance',       'income', 'landmark',      '#4338CA', 8);


-- ============================================================================
-- 7. SEED DATA — BANK ACCOUNTS (12)
-- ============================================================================

INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier) VALUES
  ('FAB Current Account',        'FAB',                   'AE', 'AED', 'checking',   'joint',  'cash',     't1_instant'),
  ('FAB iSavings',               'FAB',                   'AE', 'AED', 'savings',    'joint',  'cash',     't2_days'),
  ('Wio Personal (Anjan)',       'Wio',                   'AE', 'AED', 'checking',   'anjan',  'cash',     't1_instant'),
  ('Wio Personal (Kate)',        'Wio',                   'AE', 'AED', 'checking',   'kate',   'cash',     't1_instant'),
  ('Barclaycard Credit Card',    'Barclays',              'GB', 'GBP', 'credit',     'anjan',  'debt',     't1_instant'),
  ('Monzo Joint',                'Monzo',                 'GB', 'GBP', 'checking',   'joint',  'cash',     't1_instant'),
  ('Revolut',                    'Revolut',               'GB', 'GBP', 'checking',   'anjan',  'cash',     't1_instant'),
  ('Santander/NS&I',             'Santander',             'GB', 'GBP', 'savings',    'anjan',  'cash',     't2_days'),
  ('HSBC Jersey',                'HSBC',                  'JE', 'USD', 'savings',    'joint',  'cash',     't2_days'),
  ('IBKR',                       'Interactive Brokers',   'US', 'USD', 'investment', 'joint',  'equities', 't2_days'),
  ('Hargreaves S&P Pension',     'Hargreaves Lansdown',   'GB', 'GBP', 'pension',    'anjan',  'equities', 't3_locked_years'),
  ('Hargreaves Schroder Pension','Hargreaves Lansdown',   'GB', 'GBP', 'pension',    'anjan',  'equities', 't3_locked_years');


-- ============================================================================
-- 8. SEED DATA — FX RATES
-- ============================================================================

INSERT INTO fx_rates (from_currency, to_currency, rate, effective_date) VALUES
  ('GBP', 'USD', 1.323100, CURRENT_DATE),
  ('AED', 'USD', 0.272294, CURRENT_DATE),
  ('USD', 'USD', 1.000000, CURRENT_DATE);
