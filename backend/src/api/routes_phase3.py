"""
Phase 3 API routes - Custom Field Templates
These endpoints handle template management and AI field suggestion
"""

# Add these to the main routes.py file after Phase 2 endpoints

# ============================================================================
# Phase 3 Models
# ============================================================================

class SuggestedField(BaseModel):
    """AI-suggested field definition"""
    field_name: str
    field_type: str  # TEXT, DATE, NUMBER, ENUM, BOOLEAN
    description: str
    example_value: Optional[str] = None
    page_hint: Optional[str] = None


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


# ============================================================================
# Phase 3 Endpoints
# ============================================================================

@router.post("/suggest-fields-from-document/{document_id}", response_model=SuggestFieldsResponse)
def suggest_fields_from_document(document_id: str):
    """
    Analyze a document and suggest fields using AI (Phase 3)
    Upload a sample document first, then call this endpoint
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

        # Use AI to suggest fields
        suggested_fields = template_service.suggest_fields_from_document(
            document.text_content,
            document.filename
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


# ============================================================================
# Instructions to add to main routes.py:
# ============================================================================
"""
1. Copy all Phase 3 Models to the models section (after Phase 2 models)
2. Copy all Phase 3 Endpoints to the end of routes.py (after Phase 2 endpoints)
3. Import template_service is already added
4. Restart the backend server
"""
