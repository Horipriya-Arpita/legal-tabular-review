"""
Template management service for custom field templates
Includes AI-powered field suggestion from sample documents
"""

from openai import OpenAI
import os
import json
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
import uuid
from datetime import datetime

from src.models.database import FieldTemplate, Document
from dotenv import load_dotenv

load_dotenv()


class TemplateService:
    """Service for managing field templates and AI-suggested fields"""

    def __init__(self, model: str = "gpt-3.5-turbo"):
        self.model = model
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        self.client = OpenAI(api_key=api_key)

    def suggest_fields_from_document(
        self,
        document_text: str,
        document_name: str = "sample document"
    ) -> List[Dict]:
        """
        Analyze a document and suggest fields to extract using AI

        Args:
            document_text: Full text of the sample document
            document_name: Name of the document for context

        Returns:
            List of suggested field definitions with:
                - field_name: Name of the field
                - field_type: TEXT, DATE, NUMBER, ENUM, or BOOLEAN
                - description: What this field represents
                - example_value: Sample value from the document
                - page_hint: Which page(s) this appears on
        """
        # Use first 10000 characters for analysis
        context = document_text[:10000]

        prompt = f"""Analyze this legal document and identify all important fields that should be extracted for review purposes.

Document: {document_name}

Document text:
{context}

Your task:
1. Identify 8-15 key fields/clauses that appear in this document
2. For each field, determine:
   - A clear, descriptive name (e.g., "Contract Value", "Effective Date")
   - The data type (TEXT, DATE, NUMBER, ENUM, BOOLEAN)
   - A brief description of what it represents
   - An example value from the document
   - Approximate page/location

Field Types:
- TEXT: Free-form text (names, descriptions, clauses)
- DATE: Dates (effective dates, deadlines)
- NUMBER: Numeric values (amounts, percentages, durations)
- ENUM: Limited set of options (status, category)
- BOOLEAN: Yes/No or True/False values

Return as JSON array:
[
  {{
    "field_name": "Contract Value",
    "field_type": "NUMBER",
    "description": "Total monetary value of the contract",
    "example_value": "$500,000",
    "page_hint": "Found on page 1"
  }},
  ...
]

Focus on:
- Key business terms (dates, amounts, parties)
- Important clauses (termination, liability, confidentiality)
- Obligations and rights
- Conditions and requirements

JSON Response:"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert legal document analyst. Identify important fields in contracts and legal documents. Always respond with valid JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,  # Some creativity for field discovery
                max_tokens=2000,  # Allow for many fields
                response_format={"type": "json_object"}
            )

            result_text = response.choices[0].message.content.strip()
            result = json.loads(result_text)

            # Handle both direct array and wrapped response
            if isinstance(result, dict) and "fields" in result:
                fields = result["fields"]
            elif isinstance(result, list):
                fields = result
            else:
                # Try to find any array in the response
                for value in result.values():
                    if isinstance(value, list):
                        fields = value
                        break
                else:
                    fields = []

            # Validate and normalize field definitions
            validated_fields = []
            for field in fields:
                if isinstance(field, dict) and "field_name" in field:
                    validated_fields.append({
                        "field_name": field.get("field_name", "Unnamed Field"),
                        "field_type": field.get("field_type", "TEXT"),
                        "description": field.get("description", ""),
                        "example_value": field.get("example_value", ""),
                        "page_hint": field.get("page_hint", "")
                    })

            return validated_fields

        except json.JSONDecodeError as e:
            print(f"JSON decode error: {str(e)}")
            return []
        except Exception as e:
            print(f"Error suggesting fields: {str(e)}")
            return []

    def create_template(
        self,
        db: Session,
        name: str,
        fields: List[Dict],
        version: int = 1
    ) -> FieldTemplate:
        """
        Create a new field template

        Args:
            db: Database session
            name: Template name
            fields: List of field definitions
            version: Template version number

        Returns:
            Created FieldTemplate instance
        """
        template = FieldTemplate(
            name=name,
            version=version,
            fields=fields,
            is_active=True
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        return template

    def get_template(
        self,
        db: Session,
        template_id: uuid.UUID
    ) -> Optional[FieldTemplate]:
        """Get a template by ID"""
        return db.query(FieldTemplate).filter(
            FieldTemplate.id == template_id
        ).first()

    def list_templates(
        self,
        db: Session,
        active_only: bool = True
    ) -> List[FieldTemplate]:
        """
        List all templates

        Args:
            db: Database session
            active_only: Only return active templates

        Returns:
            List of FieldTemplate instances
        """
        query = db.query(FieldTemplate).order_by(
            FieldTemplate.created_at.desc()
        )

        if active_only:
            query = query.filter(FieldTemplate.is_active == True)

        return query.all()

    def update_template(
        self,
        db: Session,
        template_id: uuid.UUID,
        name: str = None,
        fields: List[Dict] = None,
        is_active: bool = None
    ) -> Optional[FieldTemplate]:
        """
        Update an existing template

        Args:
            db: Database session
            template_id: Template UUID
            name: New name (optional)
            fields: New field list (optional)
            is_active: Active status (optional)

        Returns:
            Updated FieldTemplate or None
        """
        template = self.get_template(db, template_id)
        if not template:
            return None

        if name is not None:
            template.name = name
        if fields is not None:
            template.fields = fields
        if is_active is not None:
            template.is_active = is_active

        db.commit()
        db.refresh(template)
        return template

    def delete_template(
        self,
        db: Session,
        template_id: uuid.UUID,
        soft_delete: bool = True
    ) -> bool:
        """
        Delete a template (soft delete by default)

        Args:
            db: Database session
            template_id: Template UUID
            soft_delete: If True, marks as inactive; if False, actually deletes

        Returns:
            True if successful
        """
        template = self.get_template(db, template_id)
        if not template:
            return False

        if soft_delete:
            template.is_active = False
            db.commit()
        else:
            db.delete(template)
            db.commit()

        return True

    def clone_template(
        self,
        db: Session,
        template_id: uuid.UUID,
        new_name: str
    ) -> Optional[FieldTemplate]:
        """
        Clone an existing template with a new name

        Args:
            db: Database session
            template_id: Source template UUID
            new_name: Name for the cloned template

        Returns:
            New FieldTemplate instance or None
        """
        source = self.get_template(db, template_id)
        if not source:
            return None

        return self.create_template(
            db,
            name=new_name,
            fields=source.fields.copy(),
            version=1
        )


# Global service instance
template_service = TemplateService()
