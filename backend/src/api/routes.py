"""API routes for Legal Tabular Review system"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import List, Dict, Optional
from pydantic import BaseModel, Field
import uuid
import os
from pathlib import Path
from sqlalchemy.orm import Session

from src.storage.db import get_db, get_db_dependency
from src.models.database import Project, Document, ExtractedField, AsyncRequest, FieldTemplate
from src.services.document_service import DocumentService
from src.services.extraction_service import ExtractionService
from src.services.extraction_service_large_context import LargeContextExtractionService
from src.services.extraction_service_optimized import OptimizedExtractionService
from src.services.async_service import async_job_service
from src.services.template_service import template_service
from datetime import datetime

router = APIRouter()

# Initialize services
document_service = DocumentService()
extraction_service = ExtractionService()  # Legacy service for backward compatibility
large_context_service = LargeContextExtractionService(provider="openai", model="gpt-4o")
optimized_service = OptimizedExtractionService(cheap_model="gpt-3.5-turbo")


# Request/Response Models
class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""
    template_id: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    status: str
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    created_at: str = None
    updated_at: str = None


class DocumentResponse(BaseModel):
    id: str
    filename: str
    parse_status: str
    file_format: str = None
    page_count: int = None


class TableCellResponse(BaseModel):
    field_name: str
    document_id: str
    display_value: str


class TableDataResponse(BaseModel):
    fields: List[str]
    documents: List[DocumentResponse]
    cells: List[TableCellResponse]


# Phase 2 Models

class TableCellResponseV2(BaseModel):
    """Phase 2 table cell with confidence, citations, and review status"""
    field_name: str
    document_id: str
    display_value: str
    confidence_score: Optional[float] = None
    citations: List[Dict] = Field(default_factory=list)
    review_status: str = "PENDING"
    manual_value: Optional[str] = None
    extraction_id: Optional[str] = None


class TableDataResponseV2(BaseModel):
    """Phase 2 table data"""
    fields: List[str]
    documents: List[DocumentResponse]
    cells: List[TableCellResponseV2]


class UpdateAnswerRequest(BaseModel):
    """Request to update an extracted field (confirm, reject, or edit)"""
    extraction_id: str
    action: str  # "CONFIRM", "REJECT", "EDIT"
    manual_value: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_by: str = "user"


class AsyncRequestResponse(BaseModel):
    """Async request status"""
    id: str
    project_id: str
    request_type: str
    status: str
    progress: int
    total_items: Optional[int] = None
    processed_items: Optional[int] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


# Phase 3 Models

class SuggestedField(BaseModel):
    """AI-suggested field definition"""
    field_name: str
    field_type: str  # TEXT, DATE, NUMBER, ENUM, BOOLEAN
    description: str
    example_value: Optional[str] = None
    page_hint: Optional[str] = None
    page_start: Optional[int] = None
    page_end: Optional[int] = None
    page_confidence: Optional[float] = None


class SuggestFieldsResponse(BaseModel):
    """Response with AI-suggested fields"""
    document_id: str
    document_name: str
    suggested_fields: List[SuggestedField]
    field_count: int


class CreateTemplateRequest(BaseModel):
    """Request to create a new template"""
    name: str
    fields: List[Dict]
    version: int = 1


class TemplateResponse(BaseModel):
    """Template information"""
    id: str
    name: str
    version: int
    fields: List[Dict]
    is_active: bool
    created_at: Optional[str] = None
    field_count: int


class UpdateTemplateRequest(BaseModel):
    """Request to update a template"""
    name: Optional[str] = None
    fields: Optional[List[Dict]] = None
    is_active: Optional[bool] = None


# Endpoints

@router.post("/create-project", response_model=ProjectResponse)
def create_project(request: CreateProjectRequest):
    """Create a new review project"""
    with get_db() as db:
        # Validate template if provided
        template_name = None
        if request.template_id:
            try:
                template_uuid = uuid.UUID(request.template_id)
                template = db.query(FieldTemplate).filter(FieldTemplate.id == template_uuid).first()
                if not template:
                    raise HTTPException(status_code=404, detail="Template not found")
                if not template.is_active:
                    raise HTTPException(status_code=400, detail="Template is not active")
                template_name = template.name
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid template ID format")

        project = Project(
            name=request.name,
            description=request.description,
            status="CREATED",
            template_id=uuid.UUID(request.template_id) if request.template_id else None
        )
        db.add(project)
        db.flush()

        return ProjectResponse(
            id=str(project.id),
            name=project.name,
            description=project.description or "",
            status=project.status,
            template_id=request.template_id,
            template_name=template_name,
            created_at=project.created_at.isoformat() if project.created_at else None,
            updated_at=project.updated_at.isoformat() if project.updated_at else None
        )


@router.get("/projects")
def list_projects():
    """List all projects"""
    with get_db() as db:
        projects = db.query(Project).order_by(Project.created_at.desc()).all()
        return [
            {
                "id": str(p.id),
                "name": p.name,
                "description": p.description,
                "status": p.status,
                "created_at": p.created_at.isoformat() if p.created_at else None
            }
            for p in projects
        ]


@router.get("/get-project-info/{project_id}", response_model=ProjectResponse)
def get_project_info(project_id: str):
    """Get project information"""
    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        template_name = None
        if project.template_id:
            template = db.query(FieldTemplate).filter(FieldTemplate.id == project.template_id).first()
            if template:
                template_name = template.name

        return ProjectResponse(
            id=str(project.id),
            name=project.name,
            description=project.description or "",
            status=project.status,
            template_id=str(project.template_id) if project.template_id else None,
            template_name=template_name,
            created_at=project.created_at.isoformat() if project.created_at else None,
            updated_at=project.updated_at.isoformat() if project.updated_at else None
        )


@router.delete("/delete-project/{project_id}")
def delete_project(project_id: str):
    """Delete a project and all associated data (documents, extracted fields, async requests)"""
    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        # Get the project
        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        project_name = project.name

        # Get all documents to delete their files from disk
        documents = db.query(Document).filter(Document.project_id == proj_uuid).all()

        # Delete physical files from disk
        deleted_files = 0
        failed_files = []
        for doc in documents:
            if doc.file_path:
                try:
                    file_path = Path(doc.file_path)
                    if file_path.exists():
                        os.remove(file_path)
                        deleted_files += 1
                except Exception as e:
                    failed_files.append(f"{doc.filename}: {str(e)}")

        # Delete the project (cascade will handle documents, extracted_fields, async_requests)
        db.delete(project)
        db.flush()

        response = {
            "success": True,
            "message": f"Project '{project_name}' and all associated data deleted successfully",
            "project_id": project_id,
            "deleted_files": deleted_files
        }

        if failed_files:
            response["file_deletion_warnings"] = failed_files

        return response


@router.post("/upload-documents/{project_id}")
def upload_documents(
    project_id: str,
    files: List[UploadFile] = File(...)
):
    """Upload documents to a project"""
    with get_db() as db:
        # Verify project exists
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        uploaded_docs = []

        for file in files:
            # Read file data
            file_data = file.file.read()

            # Save and parse document
            try:
                document = document_service.save_document(
                    file_data=file_data,
                    filename=file.filename,
                    project_id=project.id
                )

                db.add(document)
                db.flush()

                uploaded_docs.append({
                    "id": str(document.id),
                    "filename": document.filename,
                    "parse_status": document.parse_status,
                    "page_count": document.page_count
                })

            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to upload {file.filename}: {str(e)}")

        # Update project status
        project.status = "DOCUMENTS_UPLOADED"
        db.flush()

        return {
            "project_id": project_id,
            "uploaded_documents": uploaded_docs,
            "total_uploaded": len(uploaded_docs)
        }


@router.post("/extract-fields/{project_id}")
def extract_fields(project_id: str):
    """Extract fields from all documents in a project"""
    with get_db() as db:
        # Get project
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get successfully parsed documents
        documents = db.query(Document).filter(
            Document.project_id == project.id,
            Document.parse_status == "COMPLETED"
        ).all()

        if not documents:
            raise HTTPException(
                status_code=400,
                detail="No successfully parsed documents found. Please upload valid PDF files."
            )

        extraction_count = 0
        failed_extractions = []

        # Get field definitions from template if available
        field_definitions = None
        has_page_hints = False

        if project.template_id:
            template = db.query(FieldTemplate).filter(FieldTemplate.id == project.template_id).first()
            if template and template.is_active:
                field_definitions = template.fields
                # Check if template has page hints (page_start, page_end)
                if field_definitions and len(field_definitions) > 0:
                    has_page_hints = all('page_start' in f for f in field_definitions)
                    if has_page_hints:
                        print(f"✓ Using optimized extraction with page hints from template '{template.name}'")
                    else:
                        print(f"⚠ Template '{template.name}' lacks page hints, using full context extraction")

        # Extract fields from each document
        for document in documents:
            try:
                if has_page_hints and field_definitions:
                    # OPTIMIZED: Use page-targeted extraction (cheap!)
                    extracted_fields = optimized_service.extract_all_fields_optimized(
                        document=document,
                        project_id=project.id,
                        field_definitions_with_pages=field_definitions
                    )
                else:
                    # FALLBACK: Use full context extraction (expensive but thorough)
                    extracted_fields = large_context_service.extract_all_fields(
                        document=document,
                        project_id=project.id,
                        field_definitions=field_definitions
                    )

                for field in extracted_fields:
                    db.add(field)
                    extraction_count += 1

            except Exception as e:
                failed_extractions.append({
                    "document": document.filename,
                    "error": str(e)
                })

        # Update project status
        if extraction_count > 0:
            project.status = "READY"
        else:
            project.status = "EXTRACTION_FAILED"

        db.flush()

        result = {
            "project_id": project_id,
            "documents_processed": len(documents),
            "fields_extracted": extraction_count,
            "status": project.status
        }

        if failed_extractions:
            result["failures"] = failed_extractions

        return result


@router.get("/get-table-data/{project_id}", response_model=TableDataResponse)
def get_table_data(project_id: str):
    """Get table data for display"""
    with get_db() as db:
        # Get project
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get documents
        documents = db.query(Document).filter(
            Document.project_id == project.id
        ).order_by(Document.upload_date).all()

        if not documents:
            raise HTTPException(status_code=404, detail="No documents found in this project")

        # Get extracted fields
        extracted_fields = db.query(ExtractedField).filter(
            ExtractedField.project_id == project.id
        ).all()

        if not extracted_fields:
            raise HTTPException(
                status_code=404,
                detail="No extracted fields found. Please run field extraction first."
            )

        # Get unique field names from template or defaults
        field_names = []
        if project.template_id:
            template = db.query(FieldTemplate).filter(FieldTemplate.id == project.template_id).first()
            if template:
                field_names = [f['field_name'] for f in template.fields]

        if not field_names:
            from src.services.extraction_service import DEFAULT_FIELDS
            field_names = [f['field_name'] for f in DEFAULT_FIELDS]

        # Build response
        doc_responses = [
            DocumentResponse(
                id=str(doc.id),
                filename=doc.filename,
                parse_status=doc.parse_status,
                file_format=doc.file_format,
                page_count=doc.page_count
            )
            for doc in documents
        ]

        cells = [
            TableCellResponse(
                field_name=ef.field_name,
                document_id=str(ef.document_id),
                display_value=ef.normalized_value or ef.raw_value or "NOT_FOUND"
            )
            for ef in extracted_fields
        ]

        return TableDataResponse(
            fields=field_names,
            documents=doc_responses,
            cells=cells
        )


@router.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "legal-tabular-review", "phase": "3"}


# ============================================================================
# Phase 2 Endpoints
# ============================================================================

@router.post("/generate-all-answers/{project_id}", response_model=AsyncRequestResponse)
def generate_all_answers(project_id: str):
    """
    Start async extraction for all documents in a project (Phase 2/3)
    Returns immediately with async request ID for status tracking
    Uses template fields if project has a template assigned
    """
    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Check if documents exist
        doc_count = db.query(Document).filter(
            Document.project_id == proj_uuid,
            Document.parse_status == "COMPLETED"
        ).count()

        if doc_count == 0:
            raise HTTPException(
                status_code=400,
                detail="No documents ready for extraction"
            )

        # Get field definitions from template if assigned, otherwise use default
        field_definitions = None
        if project.template_id:
            template = db.query(FieldTemplate).filter(FieldTemplate.id == project.template_id).first()
            if template and template.is_active:
                field_definitions = template.fields
                print(f"Using template '{template.name}' with {len(field_definitions)} fields")

        # Start async extraction
        async_request = async_job_service.start_extraction_async(
            db,
            proj_uuid,
            field_definitions=field_definitions  # Will use default if None
        )

        # Update project status
        project.status = "EXTRACTING"
        db.flush()

        return AsyncRequestResponse(
            id=str(async_request.id),
            project_id=str(async_request.project_id),
            request_type=async_request.request_type,
            status=async_request.status,
            progress=async_request.progress,
            total_items=async_request.total_items,
            processed_items=async_request.processed_items,
            created_at=async_request.created_at.isoformat() if async_request.created_at else None
        )


@router.get("/get-request-status/{request_id}", response_model=AsyncRequestResponse)
def get_request_status(request_id: str):
    """Get status of an async extraction request"""
    with get_db() as db:
        try:
            req_uuid = uuid.UUID(request_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid request ID format")

        async_request = async_job_service.get_request_status(db, req_uuid)
        if not async_request:
            raise HTTPException(status_code=404, detail="Request not found")

        return AsyncRequestResponse(
            id=str(async_request.id),
            project_id=str(async_request.project_id),
            request_type=async_request.request_type,
            status=async_request.status,
            progress=async_request.progress,
            total_items=async_request.total_items,
            processed_items=async_request.processed_items,
            error_message=async_request.error_message,
            created_at=async_request.created_at.isoformat() if async_request.created_at else None,
            started_at=async_request.started_at.isoformat() if async_request.started_at else None,
            completed_at=async_request.completed_at.isoformat() if async_request.completed_at else None
        )


@router.post("/update-answer")
def update_answer(request: UpdateAnswerRequest):
    """
    Update an extracted field (Phase 2 review workflow)
    Actions: CONFIRM, REJECT, EDIT
    """
    with get_db() as db:
        try:
            extraction_uuid = uuid.UUID(request.extraction_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid extraction ID format")

        # Get the extracted field
        extracted_field = db.query(ExtractedField).filter(
            ExtractedField.id == extraction_uuid
        ).first()

        if not extracted_field:
            raise HTTPException(status_code=404, detail="Extracted field not found")

        # Update based on action
        if request.action == "CONFIRM":
            extracted_field.review_status = "CONFIRMED"
        elif request.action == "REJECT":
            extracted_field.review_status = "REJECTED"
        elif request.action == "EDIT":
            if not request.manual_value:
                raise HTTPException(status_code=400, detail="manual_value required for EDIT action")
            extracted_field.review_status = "MANUAL_UPDATED"
            extracted_field.manual_value = request.manual_value
        else:
            raise HTTPException(status_code=400, detail="Invalid action. Must be CONFIRM, REJECT, or EDIT")

        # Update audit fields
        extracted_field.reviewed_by = request.reviewed_by
        extracted_field.reviewed_at = datetime.utcnow()
        if request.review_notes:
            extracted_field.review_notes = request.review_notes

        db.flush()

        return {
            "success": True,
            "extraction_id": request.extraction_id,
            "action": request.action,
            "review_status": extracted_field.review_status
        }


@router.get("/get-table-data-v2/{project_id}", response_model=TableDataResponseV2)
def get_table_data_v2(project_id: str):
    """
    Get table data with Phase 2 features (confidence, citations, review status)
    """
    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get documents
        documents = db.query(Document).filter(
            Document.project_id == project.id
        ).order_by(Document.upload_date).all()

        if not documents:
            raise HTTPException(status_code=404, detail="No documents found")

        # Get extracted fields
        extracted_fields = db.query(ExtractedField).filter(
            ExtractedField.project_id == project.id
        ).all()

        if not extracted_fields:
            raise HTTPException(
                status_code=404,
                detail="No extracted fields found. Please run extraction first."
            )

        # Get field names from template or defaults
        field_names = []
        if project.template_id:
            template = db.query(FieldTemplate).filter(FieldTemplate.id == project.template_id).first()
            if template:
                field_names = [f['field_name'] for f in template.fields]

        if not field_names:
            from src.services.extraction_service import DEFAULT_FIELDS
            field_names = [f['field_name'] for f in DEFAULT_FIELDS]

        # Build response
        doc_responses = [
            DocumentResponse(
                id=str(doc.id),
                filename=doc.filename,
                parse_status=doc.parse_status,
                file_format=doc.file_format,
                page_count=doc.page_count
            )
            for doc in documents
        ]

        cells = [
            TableCellResponseV2(
                field_name=ef.field_name,
                document_id=str(ef.document_id),
                display_value=(
                    ef.manual_value if ef.manual_value
                    else ef.normalized_value or ef.raw_value or "NOT_FOUND"
                ),
                confidence_score=ef.confidence_score,
                citations=ef.citations or [],
                review_status=ef.review_status or "PENDING",
                manual_value=ef.manual_value,
                extraction_id=str(ef.id)
            )
            for ef in extracted_fields
        ]

        return TableDataResponseV2(
            fields=field_names,
            documents=doc_responses,
            cells=cells
        )


# ============================================================================
# Phase 3 Endpoints
# ============================================================================

@router.post("/suggest-fields-from-document/{document_id}", response_model=SuggestFieldsResponse)
def suggest_fields_from_document(document_id: str, force: bool = False, max_pages: int = 10):
    """
    Analyze a document and suggest fields using AI (Phase 3)

    💰 COST OPTIMIZED: Analyzes first 10 pages with GPT-4o (~$0.15 per call)

    Upload a sample document first, then call this endpoint.
    Suggested fields will include PAGE HINTS for cost-optimized extraction.

    Args:
        document_id: Document UUID
        force: Set to true to bypass template reuse check
        max_pages: Maximum pages to analyze (default: 10 for cost optimization)
    """
    with get_db() as db:
        try:
            doc_uuid = uuid.UUID(document_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document ID format")

        # Get the document
        document = db.query(Document).filter(Document.id == doc_uuid).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        if not document.text_content or document.parse_status != "COMPLETED":
            raise HTTPException(
                status_code=400,
                detail="Document must be successfully parsed first"
            )

        # Check if similar templates already exist (encourage reuse)
        if not force:
            existing_templates = db.query(FieldTemplate).filter(
                FieldTemplate.is_active == True
            ).all()

            if len(existing_templates) > 0:
                print(f"⚠️ Found {len(existing_templates)} existing templates. Consider reusing them!")
                print(f"   To create a new template anyway, set force=true")
                # Don't block, just warn

        # Use AI to suggest fields from first N pages with PAGE HINTS (cost-optimized)
        estimated_cost = (max_pages / document.page_count) * 0.33 if document.page_count else 0.15
        print(f"\n💰 COST OPTIMIZED: Analyzing first {max_pages} pages with GPT-4o (~${estimated_cost:.2f})")
        print(f"📄 Document: {document.filename}")
        print(f"📊 Size: {len(document.text_content):,} chars, {document.page_count} pages")
        print(f"⏳ This may take 10-30 seconds...\n")

        suggested_fields = large_context_service.suggest_fields_from_full_document(
            document.text_content,
            document.filename,
            page_count=document.page_count,
            max_pages=max_pages
        )

        return SuggestFieldsResponse(
            document_id=str(document.id),
            document_name=document.filename,
            suggested_fields=[
                SuggestedField(**field) for field in suggested_fields
            ],
            field_count=len(suggested_fields)
        )


@router.post("/create-template", response_model=TemplateResponse)
def create_template(request: CreateTemplateRequest):
    """Create a new field template (Phase 3)"""
    with get_db() as db:
        template = template_service.create_template(
            db,
            name=request.name,
            fields=request.fields,
            version=request.version
        )

        return TemplateResponse(
            id=str(template.id),
            name=template.name,
            version=template.version,
            fields=template.fields,
            is_active=template.is_active,
            created_at=template.created_at.isoformat() if template.created_at else None,
            field_count=len(template.fields)
        )


@router.get("/templates", response_model=List[TemplateResponse])
def list_templates(active_only: bool = True):
    """List all field templates (Phase 3)"""
    with get_db() as db:
        templates = template_service.list_templates(db, active_only=active_only)

        return [
            TemplateResponse(
                id=str(t.id),
                name=t.name,
                version=t.version,
                fields=t.fields,
                is_active=t.is_active,
                created_at=t.created_at.isoformat() if t.created_at else None,
                field_count=len(t.fields) if t.fields else 0
            )
            for t in templates
        ]


@router.get("/template/{template_id}", response_model=TemplateResponse)
def get_template(template_id: str):
    """Get a specific template (Phase 3)"""
    with get_db() as db:
        try:
            temp_uuid = uuid.UUID(template_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid template ID format")

        template = template_service.get_template(db, temp_uuid)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        return TemplateResponse(
            id=str(template.id),
            name=template.name,
            version=template.version,
            fields=template.fields,
            is_active=template.is_active,
            created_at=template.created_at.isoformat() if template.created_at else None,
            field_count=len(template.fields) if template.fields else 0
        )


@router.put("/update-template/{template_id}", response_model=TemplateResponse)
def update_template(template_id: str, request: UpdateTemplateRequest):
    """Update an existing template (Phase 3)"""
    with get_db() as db:
        try:
            temp_uuid = uuid.UUID(template_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid template ID format")

        template = template_service.update_template(
            db,
            temp_uuid,
            name=request.name,
            fields=request.fields,
            is_active=request.is_active
        )

        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        return TemplateResponse(
            id=str(template.id),
            name=template.name,
            version=template.version,
            fields=template.fields,
            is_active=template.is_active,
            created_at=template.created_at.isoformat() if template.created_at else None,
            field_count=len(template.fields) if template.fields else 0
        )


@router.delete("/delete-template/{template_id}")
def delete_template(template_id: str, permanent: bool = False):
    """Delete a template (Phase 3)"""
    with get_db() as db:
        try:
            temp_uuid = uuid.UUID(template_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid template ID format")

        success = template_service.delete_template(
            db,
            temp_uuid,
            soft_delete=not permanent
        )

        if not success:
            raise HTTPException(status_code=404, detail="Template not found")

        return {
            "success": True,
            "message": "Template deleted" if permanent else "Template deactivated"
        }


@router.post("/clone-template/{template_id}", response_model=TemplateResponse)
def clone_template(template_id: str, new_name: str):
    """Clone an existing template with a new name (Phase 3)"""
    with get_db() as db:
        try:
            temp_uuid = uuid.UUID(template_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid template ID format")

        template = template_service.clone_template(db, temp_uuid, new_name)

        if not template:
            raise HTTPException(status_code=404, detail="Source template not found")

        return TemplateResponse(
            id=str(template.id),
            name=template.name,
            version=template.version,
            fields=template.fields,
            is_active=template.is_active,
            created_at=template.created_at.isoformat() if template.created_at else None,
            field_count=len(template.fields) if template.fields else 0
        )


@router.post("/create-template-from-project/{project_id}", response_model=TemplateResponse)
def create_template_from_project(project_id: str, template_name: str):
    """
    Create a template from an existing project's extracted fields (Phase 3)
    Useful for saving a project's field structure for reuse
    """
    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get unique field names from extracted fields
        extracted_fields = db.query(ExtractedField).filter(
            ExtractedField.project_id == proj_uuid
        ).all()

        if not extracted_fields:
            raise HTTPException(
                status_code=400,
                detail="No extracted fields found in project. Run extraction first."
            )

        # Get unique field definitions
        seen_fields = set()
        field_definitions = []

        for ef in extracted_fields:
            if ef.field_name not in seen_fields:
                seen_fields.add(ef.field_name)
                # Create a basic field definition from the extracted field
                field_definitions.append({
                    "field_name": ef.field_name,
                    "field_type": "TEXT",  # Default to TEXT, user can edit later
                    "description": f"Field extracted from {project.name}"
                })

        if not field_definitions:
            raise HTTPException(
                status_code=400,
                detail="No fields found to create template"
            )

        # Create template
        template = template_service.create_template(
            db,
            name=template_name,
            fields=field_definitions,
            version=1
        )

        return TemplateResponse(
            id=str(template.id),
            name=template.name,
            version=template.version,
            fields=template.fields,
            is_active=template.is_active,
            created_at=template.created_at.isoformat() if template.created_at else None,
            field_count=len(template.fields)
        )


# ============================================================================
# Export Endpoints
# ============================================================================

@router.get("/export-table/{project_id}")
def export_table(project_id: str, format: str = "csv"):
    """
    Export table data to CSV or Excel format

    Args:
        project_id: Project UUID
        format: Export format - "csv" or "excel"

    Returns:
        File download response with appropriate content type
    """
    import pandas as pd
    from fastapi.responses import StreamingResponse
    import io

    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get documents
        documents = db.query(Document).filter(
            Document.project_id == project.id
        ).order_by(Document.upload_date).all()

        if not documents:
            raise HTTPException(status_code=404, detail="No documents found in this project")

        # Get extracted fields
        extracted_fields = db.query(ExtractedField).filter(
            ExtractedField.project_id == project.id
        ).all()

        if not extracted_fields:
            raise HTTPException(
                status_code=404,
                detail="No extracted fields found. Please run field extraction first."
            )

        # Get unique field names from template or defaults
        field_names = []
        if project.template_id:
            template = db.query(FieldTemplate).filter(FieldTemplate.id == project.template_id).first()
            if template:
                field_names = [f['field_name'] for f in template.fields]

        if not field_names:
            from src.services.extraction_service import DEFAULT_FIELDS
            field_names = [f['field_name'] for f in DEFAULT_FIELDS]

        # Build data structure for export
        # Create a dictionary to store data
        data = {'Field': field_names}

        # Add a column for each document
        for doc in documents:
            doc_column = []
            for field_name in field_names:
                # Find the extracted field for this document and field
                extracted = next(
                    (ef for ef in extracted_fields
                     if ef.field_name == field_name and str(ef.document_id) == str(doc.id)),
                    None
                )

                if extracted:
                    # Prefer manual_value if available, otherwise use normalized or raw value
                    value = extracted.manual_value or extracted.normalized_value or extracted.raw_value or "NOT_FOUND"

                    # Add metadata if requested
                    if format == "excel":
                        # For Excel, we can add confidence and review status
                        confidence = f" ({int(extracted.confidence_score * 100)}%)" if extracted.confidence_score else ""
                        review = f" [{extracted.review_status}]" if extracted.review_status != "PENDING" else ""
                        value = f"{value}{confidence}{review}"

                    doc_column.append(value)
                else:
                    doc_column.append("N/A")

            data[doc.filename] = doc_column

        # Create DataFrame
        df = pd.DataFrame(data)

        # Generate file
        if format.lower() == "csv":
            # Generate CSV
            output = io.StringIO()
            df.to_csv(output, index=False)
            output.seek(0)

            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={project.name.replace(' ', '_')}_extraction.csv"
                }
            )

        elif format.lower() == "excel":
            # Generate Excel
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Extracted Fields')

                # Get the worksheet to apply formatting
                worksheet = writer.sheets['Extracted Fields']

                # Auto-adjust column widths
                for column in worksheet.columns:
                    max_length = 0
                    column_letter = column[0].column_letter
                    for cell in column:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except:
                            pass
                    adjusted_width = min(max_length + 2, 50)  # Cap at 50
                    worksheet.column_dimensions[column_letter].width = adjusted_width

            output.seek(0)

            return StreamingResponse(
                output,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename={project.name.replace(' ', '_')}_extraction.xlsx"
                }
            )

        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid format. Use 'csv' or 'excel'"
            )


# ============================================================================
# Quality Evaluation Endpoints
# ============================================================================

class CreateReferenceRequest(BaseModel):
    """Request to create a human reference"""
    document_id: str
    field_name: str
    reference_value: str
    notes: Optional[str] = None


class BulkCreateReferencesRequest(BaseModel):
    """Request to bulk create human references"""
    references: List[Dict]  # List of {document_id, field_name, reference_value, notes}


class ReferenceResponse(BaseModel):
    """Human reference response"""
    id: str
    project_id: str
    document_id: str
    field_name: str
    reference_value: str
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None


class EvaluationReportResponse(BaseModel):
    """Evaluation report response"""
    id: str
    project_id: str
    report_name: str
    total_fields: int
    exact_matches: int
    partial_matches: int
    mismatches: int
    missing_ai: int
    missing_human: int
    accuracy_score: float
    coverage_score: float
    field_level_results: List[Dict]
    evaluated_by: Optional[str] = None
    created_at: Optional[str] = None


@router.post("/create-reference/{project_id}", response_model=ReferenceResponse)
def create_reference(project_id: str, request: CreateReferenceRequest, created_by: str = "user"):
    """
    Create a single human reference for quality evaluation

    This establishes "ground truth" for a specific field in a specific document.
    Later, you can compare AI extractions against these references.
    """
    from src.models.database import HumanReference

    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
            doc_uuid = uuid.UUID(request.document_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID format")

        # Verify project and document exist
        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        document = db.query(Document).filter(Document.id == doc_uuid).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Create reference
        reference = HumanReference(
            project_id=proj_uuid,
            document_id=doc_uuid,
            field_name=request.field_name,
            reference_value=request.reference_value,
            notes=request.notes,
            created_by=created_by
        )

        db.add(reference)
        db.flush()

        return ReferenceResponse(
            id=str(reference.id),
            project_id=str(reference.project_id),
            document_id=str(reference.document_id),
            field_name=reference.field_name,
            reference_value=reference.reference_value,
            notes=reference.notes,
            created_by=reference.created_by,
            created_at=reference.created_at.isoformat() if reference.created_at else None
        )


@router.post("/bulk-create-references/{project_id}")
def bulk_create_references(project_id: str, request: BulkCreateReferencesRequest, created_by: str = "user"):
    """
    Bulk create human references from a list

    Use this to quickly set up ground truth data for evaluation.
    """
    from src.services.evaluation_service import evaluation_service

    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        # Verify project exists
        project = db.query(Project).filter(Project.id == proj_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        try:
            references = evaluation_service.bulk_create_references(
                db,
                proj_uuid,
                request.references,
                created_by=created_by
            )

            return {
                "success": True,
                "project_id": project_id,
                "references_created": len(references),
                "message": f"Created {len(references)} human references"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create references: {str(e)}")


@router.get("/get-references/{project_id}", response_model=List[ReferenceResponse])
def get_references(project_id: str):
    """Get all human references for a project"""
    from src.models.database import HumanReference

    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        references = db.query(HumanReference).filter(
            HumanReference.project_id == proj_uuid
        ).all()

        return [
            ReferenceResponse(
                id=str(ref.id),
                project_id=str(ref.project_id),
                document_id=str(ref.document_id),
                field_name=ref.field_name,
                reference_value=ref.reference_value,
                notes=ref.notes,
                created_by=ref.created_by,
                created_at=ref.created_at.isoformat() if ref.created_at else None
            )
            for ref in references
        ]


@router.delete("/delete-reference/{reference_id}")
def delete_reference(reference_id: str):
    """Delete a human reference"""
    from src.models.database import HumanReference

    with get_db() as db:
        try:
            ref_uuid = uuid.UUID(reference_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid reference ID format")

        reference = db.query(HumanReference).filter(HumanReference.id == ref_uuid).first()
        if not reference:
            raise HTTPException(status_code=404, detail="Reference not found")

        db.delete(reference)
        db.flush()

        return {
            "success": True,
            "message": "Reference deleted successfully"
        }


@router.post("/evaluate-project/{project_id}", response_model=EvaluationReportResponse)
def evaluate_project(project_id: str, report_name: Optional[str] = None, evaluated_by: str = "user"):
    """
    Run quality evaluation: compare AI extractions vs human references

    This compares all AI-extracted fields against human-labeled ground truth
    and generates accuracy metrics.

    Prerequisites:
    - AI extractions must be completed
    - Human references must be created for at least some fields
    """
    from src.services.evaluation_service import evaluation_service
    from src.models.database import EvaluationReport

    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        try:
            report = evaluation_service.evaluate_project(
                db,
                proj_uuid,
                report_name=report_name,
                evaluated_by=evaluated_by
            )

            return EvaluationReportResponse(
                id=str(report.id),
                project_id=str(report.project_id),
                report_name=report.report_name,
                total_fields=report.total_fields,
                exact_matches=report.exact_matches,
                partial_matches=report.partial_matches,
                mismatches=report.mismatches,
                missing_ai=report.missing_ai,
                missing_human=report.missing_human,
                accuracy_score=report.accuracy_score,
                coverage_score=report.coverage_score,
                field_level_results=report.field_level_results,
                evaluated_by=report.evaluated_by,
                created_at=report.created_at.isoformat() if report.created_at else None
            )

        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


@router.get("/get-evaluation-reports/{project_id}", response_model=List[EvaluationReportResponse])
def get_evaluation_reports(project_id: str):
    """Get all evaluation reports for a project"""
    from src.models.database import EvaluationReport

    with get_db() as db:
        try:
            proj_uuid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

        reports = db.query(EvaluationReport).filter(
            EvaluationReport.project_id == proj_uuid
        ).order_by(EvaluationReport.created_at.desc()).all()

        return [
            EvaluationReportResponse(
                id=str(report.id),
                project_id=str(report.project_id),
                report_name=report.report_name,
                total_fields=report.total_fields,
                exact_matches=report.exact_matches,
                partial_matches=report.partial_matches,
                mismatches=report.mismatches,
                missing_ai=report.missing_ai,
                missing_human=report.missing_human,
                accuracy_score=report.accuracy_score,
                coverage_score=report.coverage_score,
                field_level_results=report.field_level_results,
                evaluated_by=report.evaluated_by,
                created_at=report.created_at.isoformat() if report.created_at else None
            )
            for report in reports
        ]


@router.get("/get-evaluation-report/{report_id}", response_model=EvaluationReportResponse)
def get_evaluation_report(report_id: str):
    """Get a specific evaluation report with full details"""
    from src.models.database import EvaluationReport

    with get_db() as db:
        try:
            rep_uuid = uuid.UUID(report_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid report ID format")

        report = db.query(EvaluationReport).filter(EvaluationReport.id == rep_uuid).first()
        if not report:
            raise HTTPException(status_code=404, detail="Evaluation report not found")

        return EvaluationReportResponse(
            id=str(report.id),
            project_id=str(report.project_id),
            report_name=report.report_name,
            total_fields=report.total_fields,
            exact_matches=report.exact_matches,
            partial_matches=report.partial_matches,
            mismatches=report.mismatches,
            missing_ai=report.missing_ai,
            missing_human=report.missing_human,
            accuracy_score=report.accuracy_score,
            coverage_score=report.coverage_score,
            field_level_results=report.field_level_results,
            evaluated_by=report.evaluated_by,
            created_at=report.created_at.isoformat() if report.created_at else None
        )
