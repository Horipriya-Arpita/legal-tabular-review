"""Database models for Legal Tabular Review system"""

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, JSON, Boolean, Integer, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
import uuid

Base = declarative_base()


class Project(Base):
    """Project model - represents a review project"""
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(50), default="CREATED")
    template_id = Column(UUID(as_uuid=True), ForeignKey("field_templates.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    extracted_fields = relationship("ExtractedField", back_populates="project", cascade="all, delete-orphan")
    template = relationship("FieldTemplate", foreign_keys=[template_id])

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class Document(Base):
    """Document model - represents uploaded legal documents"""
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_format = Column(String(10))
    file_path = Column(Text)
    upload_date = Column(DateTime, default=datetime.utcnow)
    parse_status = Column(String(50), default="PENDING")
    text_content = Column(Text)
    page_count = Column(Integer)

    # Relationships
    project = relationship("Project", back_populates="documents")
    extracted_fields = relationship("ExtractedField", back_populates="document", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "filename": self.filename,
            "file_format": self.file_format,
            "parse_status": self.parse_status,
            "upload_date": self.upload_date.isoformat() if self.upload_date else None,
            "page_count": self.page_count
        }


class FieldTemplate(Base):
    """Field template model - defines extraction fields"""
    __tablename__ = "field_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    version = Column(Integer, default=1)
    fields = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "version": self.version,
            "fields": self.fields,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class ExtractedField(Base):
    """Extracted field model - stores extraction results"""
    __tablename__ = "extracted_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    field_name = Column(String(255), nullable=False)
    raw_value = Column(Text)
    normalized_value = Column(Text)
    extraction_method = Column(String(100))
    extracted_at = Column(DateTime, default=datetime.utcnow)

    # Phase 2: Confidence and Citations
    confidence_score = Column(Float)  # 0.0 to 1.0
    citations = Column(JSON)  # [{page: 1, text: "...", position: {...}}]

    # Phase 2: Review Workflow
    review_status = Column(String(50), default="PENDING")  # PENDING, CONFIRMED, REJECTED, MANUAL_UPDATED, MISSING_DATA
    manual_value = Column(Text)  # User-edited value
    reviewed_by = Column(String(255))  # User who reviewed
    reviewed_at = Column(DateTime)  # When reviewed
    review_notes = Column(Text)  # Reviewer comments

    # Relationships
    project = relationship("Project", back_populates="extracted_fields")
    document = relationship("Document", back_populates="extracted_fields")

    def to_dict(self):
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "document_id": str(self.document_id),
            "field_name": self.field_name,
            "raw_value": self.raw_value,
            "normalized_value": self.normalized_value,
            "extraction_method": self.extraction_method,
            "extracted_at": self.extracted_at.isoformat() if self.extracted_at else None,
            # Phase 2 fields
            "confidence_score": self.confidence_score,
            "citations": self.citations,
            "review_status": self.review_status,
            "manual_value": self.manual_value,
            "reviewed_by": self.reviewed_by,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "review_notes": self.review_notes
        }


class AsyncRequest(Base):
    """Async request model - tracks background extraction jobs"""
    __tablename__ = "async_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    request_type = Column(String(100), nullable=False)  # EXTRACT_FIELDS, RE_EXTRACT, etc.
    status = Column(String(50), default="PENDING")  # PENDING, PROCESSING, COMPLETED, FAILED
    progress = Column(Integer, default=0)  # 0-100
    total_items = Column(Integer)  # Total documents/fields to process
    processed_items = Column(Integer, default=0)  # Items processed so far
    error_message = Column(Text)
    result = Column(JSON)  # Results or metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    def to_dict(self):
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "request_type": self.request_type,
            "status": self.status,
            "progress": self.progress,
            "total_items": self.total_items,
            "processed_items": self.processed_items,
            "error_message": self.error_message,
            "result": self.result,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None
        }


class HumanReference(Base):
    """Human reference model - stores human-labeled ground truth for evaluation"""
    __tablename__ = "human_references"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    field_name = Column(String(255), nullable=False)
    reference_value = Column(Text, nullable=False)  # Human-labeled correct value
    notes = Column(Text)  # Optional notes about this reference
    created_by = Column(String(255))  # Who created this reference
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project")
    document = relationship("Document")

    def to_dict(self):
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "document_id": str(self.document_id),
            "field_name": self.field_name,
            "reference_value": self.reference_value,
            "notes": self.notes,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class EvaluationReport(Base):
    """Evaluation report model - stores AI vs Human comparison results"""
    __tablename__ = "evaluation_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    report_name = Column(String(255), nullable=False)

    # Aggregate metrics
    total_fields = Column(Integer, default=0)  # Total fields evaluated
    exact_matches = Column(Integer, default=0)  # AI value exactly matches human reference
    partial_matches = Column(Integer, default=0)  # Similar but not exact
    mismatches = Column(Integer, default=0)  # AI value wrong
    missing_ai = Column(Integer, default=0)  # AI didn't extract, but human reference exists
    missing_human = Column(Integer, default=0)  # AI extracted, but no human reference

    # Overall scores
    accuracy_score = Column(Float)  # Percentage of exact matches
    coverage_score = Column(Float)  # Percentage of fields with references

    # Detailed results (JSON)
    field_level_results = Column(JSON)  # Per-field comparison details

    # Metadata
    evaluated_by = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project")

    def to_dict(self):
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "report_name": self.report_name,
            "total_fields": self.total_fields,
            "exact_matches": self.exact_matches,
            "partial_matches": self.partial_matches,
            "mismatches": self.mismatches,
            "missing_ai": self.missing_ai,
            "missing_human": self.missing_human,
            "accuracy_score": self.accuracy_score,
            "coverage_score": self.coverage_score,
            "field_level_results": self.field_level_results,
            "evaluated_by": self.evaluated_by,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
