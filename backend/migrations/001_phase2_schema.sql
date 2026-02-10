-- Phase 2 Database Migration
-- Adds confidence scoring, citations, and review workflow fields
-- Run this migration on existing Phase 1 databases

-- Add Phase 2 columns to extracted_fields table
ALTER TABLE extracted_fields
    ADD COLUMN IF NOT EXISTS confidence_score FLOAT,
    ADD COLUMN IF NOT EXISTS citations JSONB,
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS manual_value TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Create async_requests table for tracking background jobs
CREATE TABLE IF NOT EXISTS async_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    request_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    progress INTEGER DEFAULT 0,
    total_items INTEGER,
    processed_items INTEGER DEFAULT 0,
    error_message TEXT,
    result JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_extracted_fields_review_status ON extracted_fields(review_status);
CREATE INDEX IF NOT EXISTS idx_extracted_fields_confidence ON extracted_fields(confidence_score);
CREATE INDEX IF NOT EXISTS idx_async_requests_project_id ON async_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_async_requests_status ON async_requests(status);

-- Set default review_status for existing records
UPDATE extracted_fields
SET review_status = 'PENDING'
WHERE review_status IS NULL;

-- Migration complete
-- Phase 2 schema is now ready!
