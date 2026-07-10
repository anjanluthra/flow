-- ============================================================================
-- Flow: make merchant_mappings upsertable by pattern (self-learning)
-- Migration: 004_merchant_mapping_unique.sql
-- ============================================================================

-- Collapse any pre-existing duplicate patterns before adding the constraint,
-- keeping the most-used row per pattern.
DELETE FROM merchant_mappings a
USING merchant_mappings b
WHERE a.merchant_pattern = b.merchant_pattern
  AND a.times_used < b.times_used;

ALTER TABLE merchant_mappings
  ADD CONSTRAINT uq_merchant_mappings_pattern UNIQUE (merchant_pattern);
