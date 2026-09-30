-- File path: backend/database/migrations/002_dataset_editing.sql
-- Purpose: Upgrades a database that already has migration 001 applied
-- (or was created from an earlier schema.sql) to support the mutable
-- Dataset Editor: adds `source_type` (how a dataset was created —
-- uploaded/manual/ai_generated/sample) and `updated_at` (bumped on every
-- edit) to the `datasets` table. Safe to run once against a live
-- database; does not touch dataset_columns/dataset_rows/dataset_profiles,
-- which already support arbitrary mutation with no schema change needed.
--
-- Usage:
--   mysql -u <user> -p <database_name> < database/migrations/002_dataset_editing.sql

SET NAMES utf8mb4;

ALTER TABLE datasets
  ADD COLUMN source_type ENUM('uploaded', 'manual', 'ai_generated', 'sample') NOT NULL DEFAULT 'uploaded' AFTER file_type,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER uploaded_at;

-- Backfill: existing sample datasets should read as source_type='sample'
-- rather than the 'uploaded' default (uploaded/manual datasets already
-- created can't be distinguished retroactively and correctly stay 'uploaded').
UPDATE datasets SET source_type = 'sample' WHERE is_sample = TRUE;
