-- ============================================================
-- InsightAI - MySQL Schema (converted from PostgreSQL)
--
-- Notes on the conversion:
--   - No CREATE TYPE ... AS ENUM in MySQL — enums are declared inline
--     on the column itself (`role ENUM('user','admin')`).
--   - SERIAL -> INT AUTO_INCREMENT PRIMARY KEY.
--   - TIMESTAMPTZ -> DATETIME. MySQL's DATETIME has no built-in timezone
--     conversion (unlike TIMESTAMP, which converts to/from the session
--     time zone) — that matches how the app already treats these values
--     as plain "point in time, no timezone math" fields.
--   - NUMERIC(p,s) -> DECIMAL(p,s) (DECIMAL is the canonical MySQL name;
--     NUMERIC is accepted as an alias, but DECIMAL is used explicitly here).
--   - JSONB -> JSON (MySQL 5.7.8+ / 8.0+).
--   - Every table is explicitly InnoDB (required for foreign keys) with
--     utf8mb4 for full Unicode support.
--   - Requires MySQL 8.0+ (needed elsewhere in the app for CTE support
--     in the natural-language-to-SQL feature's dataset-scoping query).
-- ============================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------
CREATE TABLE users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(120)    NOT NULL,
    email           VARCHAR(160)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    role            ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- BUSINESSES  (one business profile per user)
-- ---------------------------------------------------------------
CREATE TABLE businesses (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    business_name   VARCHAR(160) NOT NULL,
    industry        VARCHAR(100),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_businesses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_businesses_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- DATASETS  (an uploaded CSV / sample dataset)
-- ---------------------------------------------------------------
CREATE TABLE datasets (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    business_id     INT NOT NULL,
    name            VARCHAR(160) NOT NULL,
    original_filename VARCHAR(255),
    is_sample       BOOLEAN NOT NULL DEFAULT FALSE,
    -- 'sales' = the upload matched the Superstore-style sales schema and
    -- is ALSO mirrored into sales_records (see ingestionService.js), so
    -- the original Dashboard/Analytics/Reports pages keep working as-is.
    -- 'generic' = any other dataset, served by the schema-agnostic
    -- dataset_columns/dataset_rows/dataset_profiles tables below.
    dataset_type    ENUM('sales', 'generic') NOT NULL DEFAULT 'generic',
    file_type       VARCHAR(20),
    -- How this dataset came to exist — orthogonal to dataset_type above.
    -- 'uploaded' = came from a CSV/JSON/Excel/XML/SQL file
    -- 'manual'   = created from scratch in the Dataset Editor ("Create Dataset")
    -- 'ai_generated' = produced by "Generate Dataset with AI"
    -- 'sample'   = the bundled example dataset(s)
    source_type     ENUM('uploaded', 'manual', 'ai_generated', 'sample') NOT NULL DEFAULT 'uploaded',
    row_count       INT DEFAULT 0,
    status          ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
    uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Bumped on every row/column/cell edit (see datasetEditController.js)
    -- so "last updated" is meaningful and edits survive refresh/restart.
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_datasets_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    INDEX idx_datasets_business_id (business_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- LOOKUP TABLES (normalized / deduped from CSV rows)
-- ---------------------------------------------------------------
CREATE TABLE categories (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(120) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    category_id INT,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    UNIQUE KEY uq_products_name_category (name, category_id),
    INDEX idx_products_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customers (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    external_customer_id    VARCHAR(100),
    name                    VARCHAR(160) NOT NULL,
    UNIQUE KEY uq_customers_external_name (external_customer_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE regions (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(120) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- SALES_RECORDS  (fact table)
-- ---------------------------------------------------------------
CREATE TABLE sales_records (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id      INT NOT NULL,
    order_id        VARCHAR(100),
    order_date      DATE NOT NULL,
    product_id      INT,
    customer_id     INT,
    region_id       INT,
    quantity        INT NOT NULL DEFAULT 0,
    sales           DECIMAL(12,2) NOT NULL DEFAULT 0,
    profit          DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount        DECIMAL(5,2) NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sales_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    CONSTRAINT fk_sales_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_region FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE SET NULL,
    INDEX idx_sales_dataset_id (dataset_id),
    INDEX idx_sales_order_date (order_date),
    INDEX idx_sales_product_id (product_id),
    INDEX idx_sales_region_id (region_id),
    INDEX idx_sales_customer_id (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- AI_QUERIES  (log of NL question -> generated SQL -> AI response)
-- ---------------------------------------------------------------
CREATE TABLE ai_queries (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    dataset_id      INT,
    question        TEXT NOT NULL,
    generated_sql   TEXT,
    result_summary  JSON,
    ai_response     TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_queries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_queries_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    INDEX idx_ai_queries_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- AI_INSIGHTS  (auto-generated insights, cached per dataset)
-- ---------------------------------------------------------------
CREATE TABLE ai_insights (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id  INT NOT NULL,
    category    VARCHAR(60) NOT NULL, -- sales | customer | regional | product
    title       VARCHAR(200) NOT NULL,
    content     TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_insights_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    INDEX idx_ai_insights_dataset_id (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- REPORTS
-- ---------------------------------------------------------------
CREATE TABLE reports (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    dataset_id  INT,
    report_type VARCHAR(60) NOT NULL, -- monthly_sales | product_performance | regional | customer
    file_path   VARCHAR(255),
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_reports_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    INDEX idx_reports_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- ACTIVITIES  (admin audit log)
-- ---------------------------------------------------------------
CREATE TABLE activities (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT,
    action      VARCHAR(120) NOT NULL,
    metadata    JSON,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_activities_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------
-- GENERIC DATASET TABLES
-- Schema-agnostic storage for ANY uploaded dataset (CSV/JSON/Excel/
-- XML/SQL, any columns). dataset_rows stores each row as a JSON
-- document rather than hardcoded columns, so no dataset "shape" is
-- assumed. Used for every upload; Superstore-shaped uploads are
-- ADDITIONALLY mirrored into sales_records above for backward
-- compatibility with the original sales-specific pages.
-- ---------------------------------------------------------------
CREATE TABLE dataset_columns (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id          INT NOT NULL,
    position            INT NOT NULL,
    name                VARCHAR(255) NOT NULL,
    inferred_type       VARCHAR(30) NOT NULL, -- integer | float | date | boolean | categorical | text | identifier
    nullable            BOOLEAN NOT NULL DEFAULT FALSE,
    missing_count       INT NOT NULL DEFAULT 0,
    missing_percentage  DECIMAL(5,2) NOT NULL DEFAULT 0,
    unique_count        INT NOT NULL DEFAULT 0,
    sample_values       JSON,
    CONSTRAINT fk_dataset_columns_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    INDEX idx_dataset_columns_dataset_id (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dataset_rows (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id  INT NOT NULL,
    row_index   INT NOT NULL,
    data        JSON NOT NULL,
    CONSTRAINT fk_dataset_rows_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    INDEX idx_dataset_rows_dataset_id (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dataset_profiles (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    dataset_id  INT NOT NULL UNIQUE,
    profile     JSON NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dataset_profiles_dataset FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
