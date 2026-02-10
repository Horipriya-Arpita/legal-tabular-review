"""
Async processing service for background extraction jobs
Simpler implementation using threading - can be upgraded to Celery later
"""

import threading
import time
from typing import Dict, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
import uuid

from src.storage.db import get_db, SessionLocal
from src.models.database import AsyncRequest, Project, Document, ExtractedField, FieldTemplate
from src.services.extraction_service import ExtractionService
from src.services.extraction_service_large_context import LargeContextExtractionService
from src.services.extraction_service_optimized import OptimizedExtractionService
from src.services.document_service import DocumentService


class AsyncJobService:
    """Service for managing async extraction jobs"""

    def __init__(self):
        self.active_jobs = {}  # job_id -> thread
        self.extraction_service = ExtractionService(enable_phase2=True)  # Legacy
        # Use GPT-4o for full document analysis (better accuracy for 200-page docs)
        self.large_context_service = LargeContextExtractionService(provider="openai", model="gpt-4o")
        # Use optimized service when page hints are available (much cheaper!)
        self.optimized_service = OptimizedExtractionService(cheap_model="gpt-3.5-turbo")
        self.document_service = DocumentService()

    def create_async_request(
        self,
        db: Session,
        project_id: uuid.UUID,
        request_type: str,
        total_items: int = 0
    ) -> AsyncRequest:
        """
        Create a new async request record

        Args:
            db: Database session
            project_id: Project UUID
            request_type: Type of request (EXTRACT_FIELDS, RE_EXTRACT, etc.)
            total_items: Total number of items to process

        Returns:
            AsyncRequest instance
        """
        async_request = AsyncRequest(
            project_id=project_id,
            request_type=request_type,
            status="PENDING",
            total_items=total_items,
            processed_items=0,
            progress=0
        )
        db.add(async_request)
        db.commit()
        db.refresh(async_request)

        return async_request

    def update_request_status(
        self,
        db: Session,
        request_id: uuid.UUID,
        status: str,
        progress: int = None,
        processed_items: int = None,
        error_message: str = None,
        result: Dict = None
    ):
        """Update async request status"""
        async_request = db.query(AsyncRequest).filter(AsyncRequest.id == request_id).first()

        if not async_request:
            return

        async_request.status = status

        if progress is not None:
            async_request.progress = progress

        if processed_items is not None:
            async_request.processed_items = processed_items

        if error_message:
            async_request.error_message = error_message

        if result:
            async_request.result = result

        if status == "PROCESSING" and not async_request.started_at:
            async_request.started_at = datetime.utcnow()

        if status in ["COMPLETED", "FAILED"]:
            async_request.completed_at = datetime.utcnow()
            async_request.progress = 100 if status == "COMPLETED" else async_request.progress

        db.commit()

    def _extract_all_documents_worker(
        self,
        request_id: str,
        project_id: str,
        field_definitions: List[Dict] = None
    ):
        """
        Worker function to extract fields from all documents in a project
        Runs in background thread
        """
        # Create new DB session for this thread
        db = SessionLocal()

        try:
            # Convert string IDs back to UUIDs
            request_uuid = uuid.UUID(request_id)
            project_uuid = uuid.UUID(project_id)

            # Update status to PROCESSING
            self.update_request_status(db, request_uuid, "PROCESSING")

            # Get all documents for this project
            documents = db.query(Document).filter(
                Document.project_id == project_uuid,
                Document.parse_status == "COMPLETED"
            ).all()

            if not documents:
                self.update_request_status(
                    db,
                    request_uuid,
                    "FAILED",
                    error_message="No documents ready for extraction"
                )
                return

            total_docs = len(documents)
            extracted_count = 0
            failed_documents = []  # Track failed extractions

            # Check if field definitions have page hints for optimization
            has_page_hints = False
            if field_definitions and len(field_definitions) > 0:
                has_page_hints = all('page_start' in f for f in field_definitions)
                if has_page_hints:
                    print(f"✓ Using optimized extraction with page hints (${0.05:.2f}-${0.08:.2f}/doc)")
                else:
                    print(f"⚠ No page hints, using full context extraction (${0.33:.2f}/doc)")

            # Extract fields from each document
            for i, document in enumerate(documents):
                try:
                    print(f"Processing document {i+1}/{total_docs}: {document.filename}")

                    if has_page_hints and field_definitions:
                        # OPTIMIZED: Use page-targeted extraction (cheap!)
                        extracted_fields = self.optimized_service.extract_all_fields_optimized(
                            document,
                            project_uuid,
                            field_definitions
                        )
                    else:
                        # FALLBACK: Use full document context (expensive)
                        extracted_fields = self.large_context_service.extract_all_fields(
                            document,
                            project_uuid,
                            field_definitions
                        )

                    # Save extracted fields to database
                    for field in extracted_fields:
                        db.add(field)

                    db.commit()
                    extracted_count += 1

                    # Update progress
                    progress = int((i + 1) / total_docs * 100)
                    self.update_request_status(
                        db,
                        request_uuid,
                        "PROCESSING",
                        progress=progress,
                        processed_items=i + 1
                    )

                except Exception as e:
                    error_msg = f"Error extracting from {document.filename}: {str(e)}"
                    print(error_msg)
                    failed_documents.append({
                        "filename": document.filename,
                        "document_id": str(document.id),
                        "error": str(e)
                    })
                    # Continue with other documents even if one fails

            # Update project status
            project = db.query(Project).filter(Project.id == project_uuid).first()
            if project:
                project.status = "READY"
                db.commit()

            # Mark request as completed (or partial if some failed)
            status = "COMPLETED" if len(failed_documents) == 0 else "COMPLETED_WITH_ERRORS"
            result = {
                "documents_processed": extracted_count,
                "total_documents": total_docs,
                "failed_count": len(failed_documents)
            }

            # Include failed document details if any
            if failed_documents:
                result["failed_documents"] = failed_documents

            self.update_request_status(
                db,
                request_uuid,
                status,
                progress=100,
                processed_items=total_docs,
                result=result
            )

            print(f"Extraction completed: {extracted_count}/{total_docs} documents")

        except Exception as e:
            print(f"Fatal error in extraction worker: {str(e)}")
            self.update_request_status(
                db,
                request_uuid,
                "FAILED",
                error_message=str(e)
            )

        finally:
            db.close()
            # Remove from active jobs
            if request_id in self.active_jobs:
                del self.active_jobs[request_id]

    def start_extraction_async(
        self,
        db: Session,
        project_id: uuid.UUID,
        field_definitions: List[Dict] = None
    ) -> AsyncRequest:
        """
        Start async extraction for all documents in a project

        Args:
            db: Database session
            project_id: Project UUID
            field_definitions: Optional field definitions

        Returns:
            AsyncRequest instance with job tracking info
        """
        # Count documents to process
        documents = db.query(Document).filter(
            Document.project_id == project_id,
            Document.parse_status == "COMPLETED"
        ).all()

        total_docs = len(documents)

        # Create async request record
        async_request = self.create_async_request(
            db,
            project_id,
            "EXTRACT_FIELDS",
            total_docs
        )

        # Start background thread
        thread = threading.Thread(
            target=self._extract_all_documents_worker,
            args=(str(async_request.id), str(project_id), field_definitions),
            daemon=True
        )
        thread.start()

        # Track active job
        self.active_jobs[str(async_request.id)] = thread

        return async_request

    def get_request_status(
        self,
        db: Session,
        request_id: uuid.UUID
    ) -> Optional[AsyncRequest]:
        """
        Get status of an async request

        Args:
            db: Database session
            request_id: Request UUID

        Returns:
            AsyncRequest instance or None
        """
        return db.query(AsyncRequest).filter(AsyncRequest.id == request_id).first()

    def get_project_requests(
        self,
        db: Session,
        project_id: uuid.UUID,
        limit: int = 10
    ) -> List[AsyncRequest]:
        """
        Get recent async requests for a project

        Args:
            db: Database session
            project_id: Project UUID
            limit: Maximum number of requests to return

        Returns:
            List of AsyncRequest instances
        """
        return db.query(AsyncRequest)\
            .filter(AsyncRequest.project_id == project_id)\
            .order_by(AsyncRequest.created_at.desc())\
            .limit(limit)\
            .all()


# Global service instance
async_job_service = AsyncJobService()
