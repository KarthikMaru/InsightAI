-- File path: backend/database/migrations/001_generic_datasets.sql
-- Purpose: Upgrades an EXISTING InsightAI database (already running the
-- original Superstore-only schema) to support general-purpose datasets,
-- without touching any existing data. Safe to run once against a live
-- database. New installs don't need this — database/schema.sql already
-- includes these changes.
--
-- Usage:
--   mysql -u <user> -p <database_name> < database/migrations/001_generic_datasets.sql

SET NAMES utf8mb4;

-- Existing datasets are implicitly Superstore-shaped, so default them to
-- 'sales' explicitly (new rows default to 'generic' — see below).
ALTER TABLE datasets
  ADD COLUMN dataset_type ENUM('sales', 'generic') NOT NULL DEFAULT 'generic' AFTER is_sample,
  ADD COLUMN file_type VARCHAR(20) AFTER dataset_type;

UPDATE datasets SET dataset_type = 'sales', file_type = 'csv' WHERE dataset_type = 'generic';

CREATE TABLE IF NOT EXISTS dataset_columns (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id          INT NOT NULL,
    position            INT NOT NULL,
    name                VARCHAR(255) NOT NULL,
    inferred_type       VARCHAR(30) NOT NULL,
    nullable            BOOLEAN NOT NULL DEFAULT FALSE,
    missing_count       INT NOT NULL DEFAULT 0,
    missing_percentage  DECIMAL(5,2) NOT NULL DEFAULT 0,
    unique_count        INT NOT NULL DEFAULT 0,
    sample_values       JSON,
    CONSTRAINT fk_dataset_columns_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    INDEX idx_dataset_columns_dataset_id (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dataset_rows (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id  INT NOT NULL,
    row_index   INT NOT NULL,
    data        JSON NOT NULL,
    CONSTRAINT fk_dataset_rows_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    INDEX idx_dataset_rows_dataset_id (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dataset_profiles (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id  INT NOT NULL UNIQUE,
    profile     JSON NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dataset_profiles_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
