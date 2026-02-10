"""
Evaluation service for comparing AI extraction vs human-labeled references
"""

from typing import List, Dict, Tuple
from sqlalchemy.orm import Session
import uuid
from difflib import SequenceMatcher

from src.models.database import (
    HumanReference, ExtractedField, EvaluationReport, Project, Document
)


class EvaluationService:
    """Service for evaluating AI extraction quality against human references"""

    def __init__(self, similarity_threshold: float = 0.85):
        """
        Initialize evaluation service

        Args:
            similarity_threshold: Threshold for partial matches (0.0 to 1.0)
                                 Above this = partial match, below = mismatch
        """
        self.similarity_threshold = similarity_threshold

    def calculate_similarity(self, ai_value: str, human_value: str) -> float:
        """
        Calculate similarity between AI and human values

        Args:
            ai_value: AI-extracted value
            human_value: Human-labeled reference value

        Returns:
            Similarity score between 0.0 and 1.0
        """
        if not ai_value or not human_value:
            return 0.0

        # Normalize values
        ai_norm = ai_value.strip().lower()
        human_norm = human_value.strip().lower()

        # Exact match
        if ai_norm == human_norm:
            return 1.0

        # Use SequenceMatcher for fuzzy matching
        similarity = SequenceMatcher(None, ai_norm, human_norm).ratio()
        return similarity

    def compare_field(
        self,
        ai_extraction: ExtractedField,
        human_reference: HumanReference
    ) -> Dict:
        """
        Compare a single AI extraction against human reference

        Args:
            ai_extraction: AI-extracted field
            human_reference: Human-labeled reference

        Returns:
            Dictionary with comparison results
        """
        ai_value = ai_extraction.normalized_value or ai_extraction.raw_value or ""
        human_value = human_reference.reference_value or ""

        similarity = self.calculate_similarity(ai_value, human_value)

        # Determine match type
        if similarity == 1.0:
            match_type = "EXACT_MATCH"
        elif similarity >= self.similarity_threshold:
            match_type = "PARTIAL_MATCH"
        else:
            match_type = "MISMATCH"

        return {
            "field_name": ai_extraction.field_name,
            "document_id": str(ai_extraction.document_id),
            "ai_value": ai_value,
            "human_value": human_value,
            "similarity": round(similarity, 3),
            "match_type": match_type,
            "confidence_score": ai_extraction.confidence_score,
            "extraction_id": str(ai_extraction.id),
            "reference_id": str(human_reference.id)
        }

    def evaluate_project(
        self,
        db: Session,
        project_id: uuid.UUID,
        report_name: str = None,
        evaluated_by: str = "system"
    ) -> EvaluationReport:
        """
        Evaluate all AI extractions in a project against human references

        Args:
            db: Database session
            project_id: Project UUID
            report_name: Optional name for the report
            evaluated_by: Who is running the evaluation

        Returns:
            EvaluationReport instance
        """
        # Get project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ValueError(f"Project {project_id} not found")

        # Get all human references for this project
        references = db.query(HumanReference).filter(
            HumanReference.project_id == project_id
        ).all()

        if not references:
            raise ValueError(f"No human references found for project {project_id}")

        # Get all AI extractions for this project
        extractions = db.query(ExtractedField).filter(
            ExtractedField.project_id == project_id
        ).all()

        if not extractions:
            raise ValueError(f"No AI extractions found for project {project_id}")

        # Build lookup maps
        ref_map = {}  # (document_id, field_name) -> HumanReference
        for ref in references:
            key = (str(ref.document_id), ref.field_name)
            ref_map[key] = ref

        extraction_map = {}  # (document_id, field_name) -> ExtractedField
        for ext in extractions:
            key = (str(ext.document_id), ext.field_name)
            extraction_map[key] = ext

        # Compare
        exact_matches = 0
        partial_matches = 0
        mismatches = 0
        missing_ai = 0
        missing_human = 0
        field_results = []

        # Get all unique (document_id, field_name) combinations
        all_keys = set(ref_map.keys()) | set(extraction_map.keys())

        for key in all_keys:
            doc_id, field_name = key

            if key in ref_map and key in extraction_map:
                # Both exist - compare
                result = self.compare_field(extraction_map[key], ref_map[key])
                field_results.append(result)

                if result["match_type"] == "EXACT_MATCH":
                    exact_matches += 1
                elif result["match_type"] == "PARTIAL_MATCH":
                    partial_matches += 1
                else:
                    mismatches += 1

            elif key in ref_map and key not in extraction_map:
                # Human reference exists, but AI didn't extract
                missing_ai += 1
                field_results.append({
                    "field_name": field_name,
                    "document_id": doc_id,
                    "ai_value": None,
                    "human_value": ref_map[key].reference_value,
                    "similarity": 0.0,
                    "match_type": "MISSING_AI",
                    "confidence_score": None,
                    "extraction_id": None,
                    "reference_id": str(ref_map[key].id)
                })

            elif key not in ref_map and key in extraction_map:
                # AI extracted, but no human reference
                missing_human += 1
                field_results.append({
                    "field_name": field_name,
                    "document_id": doc_id,
                    "ai_value": extraction_map[key].normalized_value or extraction_map[key].raw_value,
                    "human_value": None,
                    "similarity": None,
                    "match_type": "MISSING_HUMAN_REFERENCE",
                    "confidence_score": extraction_map[key].confidence_score,
                    "extraction_id": str(extraction_map[key].id),
                    "reference_id": None
                })

        # Calculate aggregate metrics
        total_fields = len(all_keys)
        total_comparable = exact_matches + partial_matches + mismatches

        if total_comparable > 0:
            accuracy_score = round((exact_matches / total_comparable) * 100, 2)
        else:
            accuracy_score = 0.0

        if total_fields > 0:
            coverage_score = round((len(ref_map) / total_fields) * 100, 2)
        else:
            coverage_score = 0.0

        # Create evaluation report
        if not report_name:
            report_name = f"Evaluation Report - {project.name}"

        report = EvaluationReport(
            project_id=project_id,
            report_name=report_name,
            total_fields=total_fields,
            exact_matches=exact_matches,
            partial_matches=partial_matches,
            mismatches=mismatches,
            missing_ai=missing_ai,
            missing_human=missing_human,
            accuracy_score=accuracy_score,
            coverage_score=coverage_score,
            field_level_results=field_results,
            evaluated_by=evaluated_by
        )

        db.add(report)
        db.flush()

        return report

    def get_evaluation_summary(self, report: EvaluationReport) -> Dict:
        """
        Get a human-readable summary of evaluation results

        Args:
            report: EvaluationReport instance

        Returns:
            Dictionary with summary information
        """
        total_comparable = report.exact_matches + report.partial_matches + report.mismatches

        return {
            "report_id": str(report.id),
            "report_name": report.report_name,
            "project_id": str(report.project_id),
            "summary": {
                "total_fields": report.total_fields,
                "fields_with_references": report.total_fields - report.missing_human,
                "ai_extracted_fields": report.total_fields - report.missing_ai,
                "comparable_fields": total_comparable,
            },
            "matches": {
                "exact": report.exact_matches,
                "partial": report.partial_matches,
                "mismatches": report.mismatches,
            },
            "missing": {
                "missing_ai_extraction": report.missing_ai,
                "missing_human_reference": report.missing_human,
            },
            "scores": {
                "accuracy_percentage": report.accuracy_score,
                "coverage_percentage": report.coverage_score,
            },
            "quality_assessment": self._get_quality_assessment(report.accuracy_score),
            "evaluated_by": report.evaluated_by,
            "created_at": report.created_at.isoformat() if report.created_at else None
        }

    def _get_quality_assessment(self, accuracy_score: float) -> str:
        """Get qualitative assessment based on accuracy score"""
        if accuracy_score >= 95:
            return "EXCELLENT"
        elif accuracy_score >= 85:
            return "GOOD"
        elif accuracy_score >= 70:
            return "ACCEPTABLE"
        elif accuracy_score >= 50:
            return "NEEDS_IMPROVEMENT"
        else:
            return "POOR"

    def bulk_create_references(
        self,
        db: Session,
        project_id: uuid.UUID,
        references_data: List[Dict],
        created_by: str = "user"
    ) -> List[HumanReference]:
        """
        Bulk create human references from a list

        Args:
            db: Database session
            project_id: Project UUID
            references_data: List of dicts with document_id, field_name, reference_value
            created_by: Who is creating these references

        Returns:
            List of created HumanReference instances
        """
        created_refs = []

        for ref_data in references_data:
            ref = HumanReference(
                project_id=project_id,
                document_id=uuid.UUID(ref_data["document_id"]),
                field_name=ref_data["field_name"],
                reference_value=ref_data["reference_value"],
                notes=ref_data.get("notes"),
                created_by=created_by
            )
            db.add(ref)
            created_refs.append(ref)

        db.flush()
        return created_refs


# Global instance
evaluation_service = EvaluationService()