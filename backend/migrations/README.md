# Database Migrations

This folder contains database migration scripts for the Legal Tabular Review system.

## Phase 2 Migration

### For Existing Phase 1 Installations

If you already have a running Phase 1 database with data, run this migration:

```bash
cd backend
python migrations/run_migration.py --migrate
```

This will:
- Add new columns to `extracted_fields` table (confidence_score, citations, review_status, etc.)
- Create the new `async_requests` table
- Create indexes for better performance
- Preserve all existing data

### For Fresh Installations

If you're setting up a new database from scratch:

```bash
cd backend
python migrations/run_migration.py --fresh
```

This will create all tables with Phase 2 fields included.

## What Changed in Phase 2

### ExtractedField Table - New Columns
- `confidence_score` (FLOAT) - AI confidence 0.0-1.0
- `citations` (JSONB) - Source references with page numbers
- `review_status` (VARCHAR) - PENDING, CONFIRMED, REJECTED, MANUAL_UPDATED, MISSING_DATA
- `manual_value` (TEXT) - User-edited value
- `reviewed_by` (VARCHAR) - Username who reviewed
- `reviewed_at` (TIMESTAMP) - Review timestamp
- `review_notes` (TEXT) - Reviewer comments

### New AsyncRequest Table
Tracks background extraction jobs:
- `id`, `project_id`, `request_type`
- `status`, `progress`, `total_items`, `processed_items`
- `error_message`, `result`
- `created_at`, `started_at`, `completed_at`

## Manual Migration (Alternative)

You can also run the SQL migration directly:

```bash
psql -h localhost -U postgres -d legal_review -f migrations/001_phase2_schema.sql
```

## Verification

After migration, verify the changes:

```sql
-- Check new columns exist
\d extracted_fields

-- Check new table exists
\d async_requests

-- Check indexes
\di
```

## Rollback

If you need to rollback (remove Phase 2 fields):

```sql
-- Drop new table
DROP TABLE IF EXISTS async_requests;

-- Remove new columns (optional - won't break Phase 1)
ALTER TABLE extracted_fields
    DROP COLUMN IF EXISTS confidence_score,
    DROP COLUMN IF EXISTS citations,
    DROP COLUMN IF EXISTS review_status,
    DROP COLUMN IF EXISTS manual_value,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS review_notes;
```

Note: Rollback will lose all Phase 2 data (confidence scores, reviews, etc.)
