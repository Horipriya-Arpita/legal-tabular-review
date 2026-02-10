"""Extraction service using large context models (Claude/GPT-4) for full document analysis"""

import anthropic
from openai import OpenAI
import os
import json
from typing import Dict, List, Optional
from src.models.database import ExtractedField, Document
import uuid
from dotenv import load_dotenv

load_dotenv()


class LargeContextExtractionService:
    """
    Service for extracting fields from entire documents using large context models

    Supports:
    - Claude 3.5 Sonnet (200K tokens - handles ~200 pages)
    - GPT-4o (128K tokens - handles ~150 pages)

    Best for documents under 200 pages where you want to analyze the full content
    in a single API call for maximum accuracy.
    """

    def __init__(
        self,
        provider: str = "claude",  # "claude" or "openai"
        model: Optional[str] = None
    ):
        """
        Initialize large context extraction service

        Args:
            provider: "claude" or "openai"
            model: Specific model (auto-selected if None)
        """
        self.provider = provider.lower()

        if self.provider == "claude":
            self.model = model or "claude-3-5-sonnet-20241022"
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
            self.client = anthropic.Anthropic(api_key=api_key)
            self.max_tokens = 200000  # 200K context

        elif self.provider == "openai":
            self.model = model or "gpt-4o"  # GPT-4o has 128K context
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY environment variable is not set")
            self.client = OpenAI(api_key=api_key)
            self.max_tokens = 128000  # 128K context

        else:
            raise ValueError(f"Unsupported provider: {provider}. Use 'claude' or 'openai'")

    def estimate_token_count(self, text: str) -> int:
        """Rough estimate: 1 token ≈ 4 characters"""
        return len(text) // 4

    def extract_all_fields_claude(
        self,
        document_text: str,
        field_definitions: List[Dict]
    ) -> Dict[str, Dict]:
        """
        Extract all fields in one call using Claude's large context

        Args:
            document_text: Full document text
            field_definitions: List of fields to extract

        Returns:
            Dictionary mapping field names to extraction results
        """
        # Format field definitions
        fields_json = json.dumps(field_definitions, indent=2)

        prompt = f"""Analyze this complete legal document and extract ALL requested fields.

FIELDS TO EXTRACT:
{fields_json}

COMPLETE DOCUMENT TEXT:
{document_text}

INSTRUCTIONS:
1. Read the ENTIRE document carefully
2. For each field, search through ALL pages to find the information
3. Extract the value and provide:
   - The exact value
   - Confidence score (0.0-1.0)
   - Page/location hint where you found it
   - Exact quote from document as citation

4. Return a JSON object with this structure:
{{
  "field_name_1": {{
    "value": "extracted value or NOT_FOUND",
    "confidence": 0.95,
    "location": "Found on page 3, in section X",
    "citation": "exact quote from the document"
  }},
  "field_name_2": {{ ... }},
  ...
}}

IMPORTANT:
- Search the ENTIRE document, not just the beginning
- If a field appears multiple times, use the most relevant occurrence
- Be thorough - check all pages before marking as NOT_FOUND
- Provide exact citations to verify your findings

Return only valid JSON."""

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.0
            )

            # Parse response
            result_text = response.content[0].text.strip()

            # Extract JSON from response (handle markdown code blocks)
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()

            results = json.loads(result_text)

            return results

        except json.JSONDecodeError as e:
            print(f"JSON decode error: {str(e)}")
            print(f"Response was: {result_text[:500]}")
            return {}
        except Exception as e:
            print(f"Error extracting fields: {str(e)}")
            return {}

    def extract_all_fields_openai(
        self,
        document_text: str,
        field_definitions: List[Dict]
    ) -> Dict[str, Dict]:
        """
        Extract all fields using OpenAI GPT-4o

        Args:
            document_text: Full document text
            field_definitions: List of fields to extract

        Returns:
            Dictionary mapping field names to extraction results
        """
        fields_json = json.dumps(field_definitions, indent=2)

        prompt = f"""Analyze this complete legal document and extract ALL requested fields.

Fields to extract:
{fields_json}

Complete document:
{document_text}

For each field, search the ENTIRE document and return JSON:
{{
  "field_name": {{
    "value": "extracted value or NOT_FOUND",
    "confidence": 0.95,
    "location": "page/section hint",
    "citation": "exact quote"
  }}
}}

Search thoroughly through all pages. Return only valid JSON."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a legal document analyst. Analyze the complete document thoroughly and extract all requested fields accurately. Always respond with valid JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.0,
                max_tokens=4096,
                response_format={"type": "json_object"}
            )

            result_text = response.choices[0].message.content.strip()
            results = json.loads(result_text)

            return results

        except Exception as e:
            print(f"Error extracting fields: {str(e)}")
            return {}

    def extract_all_fields(
        self,
        document: Document,
        project_id: uuid.UUID,
        field_definitions: List[Dict] = None
    ) -> List[ExtractedField]:
        """
        Extract all fields from full document using large context model

        Args:
            document: Document model instance
            project_id: Project UUID
            field_definitions: List of fields to extract (uses default if None)

        Returns:
            List of ExtractedField instances
        """
        if not document.text_content or document.parse_status != "COMPLETED":
            raise ValueError(f"Document {document.id} is not ready for extraction")

        # Validate document has sufficient content
        if len(document.text_content.strip()) < 100:
            raise ValueError(f"Document {document.filename} has insufficient text content (less than 100 characters)")

        # Use default fields if none provided
        if field_definitions is None:
            from src.services.extraction_service import DEFAULT_FIELDS
            field_definitions = DEFAULT_FIELDS

        # Estimate tokens
        estimated_tokens = self.estimate_token_count(document.text_content)

        print(f"\n{'='*60}")
        print(f"Extracting from: {document.filename}")
        print(f"Provider: {self.provider.upper()}")
        print(f"Model: {self.model}")
        print(f"Document: {len(document.text_content):,} characters")
        print(f"Estimated tokens: {estimated_tokens:,} / {self.max_tokens:,}")
        print(f"Fields: {len(field_definitions)}")
        print(f"{'='*60}\n")

        # Check if document fits in context
        if estimated_tokens > self.max_tokens * 0.9:  # 90% threshold
            print(f"⚠️  Warning: Document may exceed context limit!")
            print(f"   Consider using chunking or a larger context model")

        # Extract all fields in one call
        if self.provider == "claude":
            results = self.extract_all_fields_claude(
                document.text_content,
                field_definitions
            )
        else:
            results = self.extract_all_fields_openai(
                document.text_content,
                field_definitions
            )

        # Convert to ExtractedField instances
        extracted_fields = []

        for field_def in field_definitions:
            field_name = field_def['field_name']
            result = results.get(field_name, {})

            raw_value = result.get("value", "NOT_FOUND")
            confidence = float(result.get("confidence", 0.0))
            location = result.get("location", "")
            citation_text = result.get("citation", "")

            # Normalize value
            normalized_value = raw_value.strip() if raw_value else ""
            if normalized_value == "NOT_FOUND":
                normalized_value = ""

            # Format citations
            citations = []
            if citation_text:
                citations.append({
                    "text": citation_text,
                    "location": location,
                    "source": "full_document_analysis"
                })

            extracted_field = ExtractedField(
                project_id=project_id,
                document_id=document.id,
                field_name=field_name,
                raw_value=raw_value,
                normalized_value=normalized_value,
                extraction_method=f"{self.model}_full_context",
                confidence_score=confidence,
                citations=citations,
                review_status="PENDING"
            )

            extracted_fields.append(extracted_field)

            # Log result
            status = "✓" if normalized_value else "✗"
            print(f"{status} {field_name}: {normalized_value[:60]}... (conf: {confidence:.2f})")

        print(f"\n{'='*60}")
        print(f"Extraction complete: {len([f for f in extracted_fields if f.normalized_value])} / {len(field_definitions)} fields found")
        print(f"{'='*60}\n")

        return extracted_fields

    def suggest_fields_from_full_document(
        self,
        document_text: str,
        document_name: str = "document",
        page_count: int = None,
        max_pages: int = 10
    ) -> List[Dict]:
        """
        Analyze document to suggest fields WITH PAGE HINTS (cost-optimized)

        Args:
            document_text: Full document text
            document_name: Document name
            page_count: Total number of pages in document
            max_pages: Maximum number of pages to analyze (default: 10 for cost savings)

        Returns:
            List of suggested field definitions with page_start, page_end hints
        """
        # Limit to first N pages for cost optimization
        if page_count and max_pages and max_pages < page_count:
            # Estimate text to analyze based on page ratio
            chars_per_page = len(document_text) / page_count
            estimated_chars = int(chars_per_page * max_pages)
            document_text = document_text[:estimated_chars]
            print(f"📄 Limiting analysis to first {max_pages} pages (of {page_count} total) for cost optimization")
            pages_analyzed = max_pages
        else:
            pages_analyzed = page_count or "all"

        estimated_tokens = self.estimate_token_count(document_text)
        print(f"Analyzing {pages_analyzed} pages ({estimated_tokens:,} tokens) for field suggestions with page hints...")

        # Different prompt format for OpenAI (requires object) vs Claude (can use array)
        if self.provider == "openai":
            json_format_instruction = """Return this EXACT JSON format:
{
  "fields": [
    {
      "field_name": "Contract Value",
      "field_type": "NUMBER",
      "description": "Total monetary value of the contract",
      "example_value": "$500,000",
      "page_start": 1,
      "page_end": 1,
      "page_confidence": 0.95
    },
    {
      "field_name": "Termination Clause",
      "field_type": "TEXT",
      "description": "Conditions for contract termination",
      "example_value": "Either party may terminate with 30 days notice...",
      "page_start": 8,
      "page_end": 9,
      "page_confidence": 0.90
    }
  ]
}

Return ONLY valid JSON object with a "fields" array."""
        else:
            json_format_instruction = """Return this EXACT JSON format:
[
  {
    "field_name": "Contract Value",
    "field_type": "NUMBER",
    "description": "Total monetary value of the contract",
    "example_value": "$500,000",
    "page_start": 1,
    "page_end": 1,
    "page_confidence": 0.95
  },
  {
    "field_name": "Termination Clause",
    "field_type": "TEXT",
    "description": "Conditions for contract termination",
    "example_value": "Either party may terminate with 30 days notice...",
    "page_start": 8,
    "page_end": 9,
    "page_confidence": 0.90
  }
]

Return ONLY valid JSON array with page information."""

        # Update prompt based on whether we're analyzing partial or full document
        if pages_analyzed != page_count and page_count:
            doc_scope = f"""Document: {document_name}
Total Pages: {page_count}
Analyzing: First {max_pages} pages (cost-optimized analysis)

DOCUMENT TEXT (First {max_pages} pages):
{document_text}

NOTE: You are seeing only the first {max_pages} pages of a {page_count}-page document. Focus on fields that typically appear in the beginning of such documents."""
        else:
            doc_scope = f"""Document: {document_name}
Total Pages: {page_count if page_count else "Unknown"}

COMPLETE DOCUMENT TEXT:
{document_text}"""

        prompt = f"""Analyze this legal document and identify ALL important fields with PRECISE PAGE LOCATIONS.

{doc_scope}

CRITICAL TASK:
1. Read through the provided document text carefully
2. Identify 10-20 key fields/data points that would be useful for reviewing this type of document
3. For EACH field, carefully determine which PAGE(S) it appears on
4. {json_format_instruction}

Focus on:
- Key business terms (parties, dates, amounts, payment terms)
- Important clauses (termination, liability, confidentiality, warranties)
- Obligations and rights
- Delivery dates, milestones, deadlines
- Governing law, jurisdiction
- Signatures and execution details

IMPORTANT:
- page_start/page_end are CRITICAL for cost optimization
- Be as accurate as possible with page numbers
- page_confidence: 0.0-1.0 (how sure you are about the page location)
- If field spans multiple pages, set page_start to first and page_end to last
- field_type should be one of: TEXT, DATE, NUMBER, ENUM, BOOLEAN"""

        try:
            if self.provider == "claude":
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3
                )
                result_text = response.content[0].text.strip()
            else:
                # OpenAI requires json_object mode to return a dict, not an array
                # Update the system message to match this requirement
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": "You are a legal document analyst. Return a JSON object with a 'fields' array containing the suggested fields."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.3,
                    max_tokens=4096,
                    response_format={"type": "json_object"}
                )
                result_text = response.choices[0].message.content.strip()

            # Extract JSON
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0].strip()
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0].strip()

            # Debug: Print first 500 chars of response
            print(f"\n[DEBUG] AI Response (first 500 chars):\n{result_text[:500]}\n")

            result = json.loads(result_text)

            # Handle different formats
            if isinstance(result, dict):
                if "fields" in result:
                    fields = result["fields"]
                    print(f"[DEBUG] Found 'fields' key in response dict with {len(fields)} items")
                else:
                    # Try to find any array
                    print(f"[DEBUG] No 'fields' key found. Dict keys: {list(result.keys())}")
                    for key, value in result.items():
                        if isinstance(value, list):
                            fields = value
                            print(f"[DEBUG] Found array in key '{key}' with {len(value)} items")
                            break
                    else:
                        fields = []
                        print(f"[DEBUG] No arrays found in response dict")
            elif isinstance(result, list):
                fields = result
                print(f"[DEBUG] Response is already a list with {len(fields)} items")
            else:
                fields = []
                print(f"[DEBUG] Unexpected result type: {type(result)}")

            print(f"✓ Suggested {len(fields)} fields from complete document")

            # If no fields found, print more debug info
            if len(fields) == 0:
                print(f"\n⚠️  WARNING: No fields extracted!")
                print(f"[DEBUG] Full response:\n{result_text[:1000]}\n")

            return fields

        except json.JSONDecodeError as e:
            print(f"❌ JSON decode error: {str(e)}")
            print(f"[DEBUG] Response was:\n{result_text[:1000]}\n")
            return []
        except Exception as e:
            print(f"❌ Error suggesting fields: {str(e)}")
            import traceback
            print(f"[DEBUG] Traceback:\n{traceback.format_exc()}")
            return []


# Factory function
def get_extraction_service(document_length: int) -> LargeContextExtractionService:
    """
    Get appropriate extraction service based on document size

    Args:
        document_length: Character count of document

    Returns:
        Configured extraction service
    """
    estimated_tokens = document_length // 4

    if estimated_tokens <= 120000:  # ~150 pages
        # Use GPT-4o (cheaper, sufficient context)
        print("Using GPT-4o (128K context)")
        return LargeContextExtractionService(provider="openai", model="gpt-4o")
    else:
        # Use Claude 3.5 Sonnet (larger context)
        print("Using Claude 3.5 Sonnet (200K context)")
        return LargeContextExtractionService(provider="claude")
