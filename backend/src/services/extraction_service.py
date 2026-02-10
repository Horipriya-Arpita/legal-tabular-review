"""Extraction service for LLM-based field extraction"""

from openai import OpenAI
import os
import json
import re
from typing import Dict, List, Tuple
from src.models.database import ExtractedField, Document
import uuid
from dotenv import load_dotenv

load_dotenv()

# Default field template for Phase 1
DEFAULT_FIELDS = [
    {
        "field_name": "Parties",
        "field_type": "TEXT",
        "description": "All contracting parties mentioned in the agreement"
    },
    {
        "field_name": "Effective Date",
        "field_type": "DATE",
        "description": "The date when the contract becomes effective"
    },
    {
        "field_name": "Payment Terms",
        "field_type": "TEXT",
        "description": "Payment schedule, amounts, and conditions"
    },
    {
        "field_name": "Governing Law",
        "field_type": "TEXT",
        "description": "Jurisdiction whose laws govern the contract"
    },
    {
        "field_name": "Termination Clause",
        "field_type": "TEXT",
        "description": "Conditions under which the contract can be terminated"
    }
]


class ExtractionService:
    """Service for extracting fields from legal documents using LLM"""

    def __init__(self, model: str = "gpt-3.5-turbo", enable_phase2: bool = True):
        self.model = model
        self.enable_phase2 = enable_phase2  # Enable confidence scores and citations
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        self.client = OpenAI(api_key=api_key)

    def extract_field(self, document_text: str, field_definition: Dict) -> str:
        """
        Extract a single field from document text using LLM (Phase 1 - basic extraction)

        Args:
            document_text: Full text of the document
            field_definition: Dictionary with field_name, field_type, description

        Returns:
            Extracted value as string
        """
        # Limit context size to control costs (first 4000 characters)
        context = document_text[:4000]

        prompt = f"""Extract the following information from this legal document:

Field: {field_definition['field_name']}
Type: {field_definition['field_type']}
Description: {field_definition['description']}

Document text:
{context}

Instructions:
- Return only the extracted value, nothing else
- Be precise and concise
- If the field is not found in the document, return exactly "NOT_FOUND"
- Do not include explanations or additional text

Extracted value:"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a legal document analyst. Extract information accurately and concisely."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.0,
                max_tokens=200
            )

            extracted_value = response.choices[0].message.content.strip()
            return extracted_value

        except Exception as e:
            return f"EXTRACTION_ERROR: {str(e)}"

    def extract_field_with_confidence(
        self,
        document_text: str,
        field_definition: Dict,
        page_count: int = None
    ) -> Dict:
        """
        Extract a single field with confidence score and citations (Phase 2)

        Args:
            document_text: Full text of the document
            field_definition: Dictionary with field_name, field_type, description
            page_count: Number of pages in document (for citation validation)

        Returns:
            Dictionary with:
                - value: extracted value
                - confidence: 0.0-1.0 confidence score
                - citations: list of {page, text, position}
        """
        # Use more context for Phase 2 (better accuracy)
        context = document_text[:8000]

        prompt = f"""Extract the following information from this legal document and provide confidence score and citations.

Field: {field_definition['field_name']}
Type: {field_definition['field_type']}
Description: {field_definition['description']}

Document text:
{context}

Instructions:
- Extract the requested information
- Rate your confidence from 0.0 (no confidence) to 1.0 (completely certain)
- Provide the exact text snippet(s) from the document that support your answer
- Estimate the page number where you found the information (if applicable)
- Return your response as a JSON object with this structure:
{{
  "value": "the extracted value or NOT_FOUND",
  "confidence": 0.85,
  "citations": [
    {{"page": 1, "text": "exact quote from document", "notes": "optional context"}}
  ]
}}

If the field is not found, return: {{"value": "NOT_FOUND", "confidence": 1.0, "citations": []}}

JSON Response:"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a legal document analyst. Extract information accurately, assess your confidence, and cite sources. Always respond with valid JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.0,
                max_tokens=500,
                response_format={"type": "json_object"}
            )

            result_text = response.choices[0].message.content.strip()
            result = json.loads(result_text)

            # Validate and normalize the response
            return {
                "value": result.get("value", "NOT_FOUND"),
                "confidence": max(0.0, min(1.0, float(result.get("confidence", 0.5)))),
                "citations": result.get("citations", [])
            }

        except json.JSONDecodeError as e:
            # Fallback: parse manually if JSON parsing fails
            return {
                "value": "EXTRACTION_ERROR: Invalid JSON response",
                "confidence": 0.0,
                "citations": []
            }
        except Exception as e:
            return {
                "value": f"EXTRACTION_ERROR: {str(e)}",
                "confidence": 0.0,
                "citations": []
            }

    def extract_all_fields(
        self,
        document: Document,
        project_id: uuid.UUID,
        field_definitions: List[Dict] = None
    ) -> List[ExtractedField]:
        """
        Extract all fields from a document

        Args:
            document: Document model instance
            project_id: Project UUID
            field_definitions: Optional list of field definitions (uses default if None)

        Returns:
            List of ExtractedField model instances
        """
        if field_definitions is None:
            field_definitions = DEFAULT_FIELDS

        if not document.text_content or document.parse_status != "COMPLETED":
            raise ValueError(f"Document {document.id} is not ready for extraction")

        extracted_fields = []

        for field_def in field_definitions:
            print(f"Extracting field: {field_def['field_name']} from {document.filename}")

            if self.enable_phase2:
                # Phase 2: Extract with confidence and citations
                result = self.extract_field_with_confidence(
                    document.text_content,
                    field_def,
                    document.page_count
                )

                raw_value = result["value"]
                confidence_score = result["confidence"]
                citations = result["citations"]

                # Basic normalization
                normalized_value = raw_value.strip() if raw_value else ""
                if normalized_value == "NOT_FOUND":
                    normalized_value = ""

                extracted_field = ExtractedField(
                    project_id=project_id,
                    document_id=document.id,
                    field_name=field_def['field_name'],
                    raw_value=raw_value,
                    normalized_value=normalized_value,
                    extraction_method=f"{self.model}_phase2",
                    # Phase 2 fields
                    confidence_score=confidence_score,
                    citations=citations,
                    review_status="PENDING"
                )

            else:
                # Phase 1: Basic extraction (backward compatibility)
                raw_value = self.extract_field(document.text_content, field_def)

                # Basic normalization
                normalized_value = raw_value.strip() if raw_value else ""
                if normalized_value == "NOT_FOUND":
                    normalized_value = ""

                extracted_field = ExtractedField(
                    project_id=project_id,
                    document_id=document.id,
                    field_name=field_def['field_name'],
                    raw_value=raw_value,
                    normalized_value=normalized_value,
                    extraction_method=self.model
                )

            extracted_fields.append(extracted_field)

        return extracted_fields

    def validate_citation(self, citation: Dict, document_text: str, page_count: int = None) -> bool:
        """
        Validate that a citation's text actually appears in the document

        Args:
            citation: Citation dict with 'text', 'page', etc.
            document_text: Full document text
            page_count: Optional page count for validation

        Returns:
            True if citation is valid, False otherwise
        """
        if not citation or not citation.get("text"):
            return False

        # Check if citation text appears in document
        citation_text = citation.get("text", "").strip()
        if not citation_text:
            return False

        # Fuzzy match - allow for minor variations
        citation_words = citation_text.lower().split()
        if len(citation_words) > 3:
            # Check if at least 70% of citation words appear in document
            doc_lower = document_text.lower()
            matches = sum(1 for word in citation_words if word in doc_lower)
            return (matches / len(citation_words)) >= 0.7

        return citation_text.lower() in document_text.lower()

    def calculate_adjusted_confidence(
        self,
        base_confidence: float,
        citations: List[Dict],
        document_text: str,
        value: str
    ) -> float:
        """
        Calculate adjusted confidence based on citation quality

        Args:
            base_confidence: LLM's stated confidence (0-1)
            citations: List of citation dicts
            document_text: Full document text
            value: Extracted value

        Returns:
            Adjusted confidence score (0-1)
        """
        if value == "NOT_FOUND" or not value:
            return base_confidence

        # Start with base confidence
        adjusted = base_confidence

        # Boost if we have valid citations
        if citations and len(citations) > 0:
            valid_citations = sum(
                1 for c in citations
                if self.validate_citation(c, document_text)
            )
            citation_boost = min(0.15, valid_citations * 0.05)
            adjusted = min(1.0, adjusted + citation_boost)
        else:
            # Penalize if no citations provided for non-empty values
            adjusted = max(0.0, adjusted - 0.1)

        # Penalize very short values (likely incomplete)
        if len(value.strip()) < 3 and value != "NOT_FOUND":
            adjusted = max(0.0, adjusted - 0.2)

        return round(adjusted, 2)

    def find_text_snippet(
        self,
        document_text: str,
        search_text: str,
        context_chars: int = 100
    ) -> Dict:
        """
        Find a text snippet in document and return with context

        Args:
            document_text: Full document text
            search_text: Text to search for
            context_chars: Characters of context to include before/after

        Returns:
            Dict with 'found', 'snippet', 'position'
        """
        search_lower = search_text.lower().strip()
        doc_lower = document_text.lower()

        position = doc_lower.find(search_lower)

        if position == -1:
            return {
                "found": False,
                "snippet": None,
                "position": None
            }

        # Extract snippet with context
        start = max(0, position - context_chars)
        end = min(len(document_text), position + len(search_text) + context_chars)

        snippet = document_text[start:end]

        # Add ellipsis if truncated
        if start > 0:
            snippet = "..." + snippet
        if end < len(document_text):
            snippet = snippet + "..."

        return {
            "found": True,
            "snippet": snippet,
            "position": {
                "start": position,
                "end": position + len(search_text)
            }
        }
