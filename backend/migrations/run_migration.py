"""
Database migration runner for Phase 2
Run this script to apply Phase 2 schema changes to an existing database
"""

import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from src.storage.db import engine, Base
from src.models.database import Project, Document, FieldTemplate, ExtractedField, AsyncRequest


def run_migration():
    """Apply database migrations"""
    print("🔄 Starting database migrations...")

    # Get all migration files in order
    migrations_dir = Path(__file__).parent
    migration_files = sorted(migrations_dir.glob("*.sql"))

    if not migration_files:
        print("No migration files found")
        return

    for migration_file in migration_files:
        print(f"\n📄 Running migration: {migration_file.name}")

        with open(migration_file, 'r') as f:
            migration_sql = f.read()

        # Remove comment-only lines first, then split into individual statements
        lines = [line for line in migration_sql.split('\n') if not line.strip().startswith('--')]
        cleaned_sql = '\n'.join(lines)
        statements = [s.strip() for s in cleaned_sql.split(';') if s.strip()]

        try:
            with engine.connect() as conn:
                for i, statement in enumerate(statements, 1):
                    if statement:
                        print(f"  Executing statement {i}/{len(statements)}...")
                        conn.execute(text(statement))
                        conn.commit()

            print(f"✅ {migration_file.name} completed successfully!")

        except Exception as e:
            print(f"❌ Migration {migration_file.name} failed: {str(e)}")
            sys.exit(1)

    print("\n✅ All migrations completed successfully!")
    print("\nFeatures available:")
    print("  ✓ Confidence scores for extracted fields")
    print("  ✓ Citation tracking with page numbers")
    print("  ✓ Review workflow (confirm/reject/edit)")
    print("  ✓ Async job tracking table")
    print("  ✓ Template support for projects")

    return True


def create_fresh_schema():
    """Create all tables from scratch (for new installations)"""
    print("🔄 Creating fresh database schema with Phase 2 support...")

    try:
        # Create all tables
        Base.metadata.create_all(engine)
        print("✅ Database schema created successfully!")
        print("\nAll tables created:")
        print("  ✓ projects")
        print("  ✓ documents")
        print("  ✓ field_templates")
        print("  ✓ extracted_fields (with Phase 2 fields)")
        print("  ✓ async_requests")

    except Exception as e:
        print(f"❌ Schema creation failed: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Database migration tool')
    parser.add_argument('--fresh', action='store_true', help='Create fresh schema (new installation)')
    parser.add_argument('--migrate', action='store_true', help='Run migration on existing database')

    args = parser.parse_args()

    if args.fresh:
        create_fresh_schema()
    elif args.migrate:
        run_migration()
    else:
        print("Usage:")
        print("  python run_migration.py --fresh     # Create fresh schema (new installation)")
        print("  python run_migration.py --migrate   # Migrate existing Phase 1 database")
