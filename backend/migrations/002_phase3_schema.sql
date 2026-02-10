-- Phase 3 Migration: Add template support to projects
-- This migration adds template_id to projects table

-- Add template_id column to projects table
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES field_templates(id) ON DELETE SET NULL;

-- Create index for faster template lookups
CREATE INDEX IF NOT EXISTS idx_projects_template_id ON projects(template_id);

-- Comments
COMMENT ON COLUMN projects.template_id IS 'Optional reference to field template for custom field extraction';
