-- ============================================================================
-- Flow: Monthly income/expense forecasts (for annual planning)
-- Migration: 003_forecasts.sql
-- ============================================================================

CREATE TABLE forecasts (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  year                  int            NOT NULL,
  month                 int            NOT NULL,  -- 1-12
  forecast_income_usd   numeric(14, 2) NOT NULL DEFAULT 0,
  forecast_expense_usd  numeric(14, 2) NOT NULL DEFAULT 0,
  notes                 text,
  created_at            timestamptz    NOT NULL DEFAULT now(),
  updated_at            timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT uq_forecasts_year_month UNIQUE (year, month),
  CONSTRAINT ck_forecasts_month CHECK (month BETWEEN 1 AND 12)
);

CREATE INDEX idx_forecasts_year ON forecasts (year);
