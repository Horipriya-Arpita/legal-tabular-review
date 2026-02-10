# Functional Design - Legal Tabular Review

**Version:** 1.0
**Last Updated:** February 2026
**Status:** Production-Ready

---

## Table of Contents

1. [Functional Overview](#functional-overview)
2. [User Roles & Personas](#user-roles--personas)
3. [Core User Flows](#core-user-flows)
4. [API Behaviors](#api-behaviors)
5. [Status Transitions](#status-transitions)
6. [Edge Cases & Error Handling](#edge-cases--error-handling)
7. [Business Rules](#business-rules)
8. [UI/UX Requirements](#uiux-requirements)

---

## Functional Overview

### System Purpose
Legal Tabular Review enables legal professionals to:
1. Upload multiple legal documents (contracts, agreements)
2. Define or select field templates for extraction
3. Automatically extract key information using AI
4. Review and correct extracted fields
5. Compare fields side-by-side across documents
6. Evaluate AI accuracy against human references
7. Export results to CSV/Excel

### Key Features

| Feature | Description | User Value |
|---------|-------------|------------|
| **Multi-Document Upload** | Batch upload PDF files | Saves time processing multiple contracts |
| **AI Field Extraction** | GPT-4 powered extraction with citations | Automates manual data entry |
| **Custom Templates** | User-defined field schemas | Adapts to different contract types |
| **Review Workflow** | Confirm/Reject/Edit with audit trail | Ensures data quality and accountability |
| **Side-by-Side Comparison** | Tabular view of all documents | Quickly spot differences across contracts |
| **Quality Evaluation** | Compare AI vs human ground truth | Measures and improves AI accuracy |
| **Export** | CSV/Excel with metadata | Integrates with downstream systems |

---

## User Roles & Personas

### Primary User: Legal Analyst
**Name**: Sarah Chen
**Role**: Contract Analyst at a mid-sized law firm
**Goals**:
- Extract key terms from 20+ contracts per week
- Compare terms across client agreements
- Ensure accuracy of extracted data
- Generate reports for management

**Pain Points**:
- Manual data entry is time-consuming and error-prone
- Difficult to compare terms across many documents
- No visibility into extraction accuracy

**How This System Helps**:
- AI automation reduces 3 hours of manual work to 15 minutes
- Side-by-side table view for instant comparison
- Quality metrics show 95%+ accuracy

### Secondary User: Operations Manager
**Name**: David Park
**Role**: Legal Operations Manager
**Goals**:
- Monitor team productivity
- Ensure data quality standards
- Track AI performance over time

**How This System Helps**:
- Evaluation reports show accuracy metrics
- Audit trail tracks all manual edits
- Export capabilities for reporting

---

## Core User Flows

### Flow 1: Create Project and Extract Fields (Happy Path)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User lands on home page                                  │
│    → Clicks "Create New Project" button                     │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User fills in project details                            │
│    - Project Name: "Q4 2025 Vendor Contracts"               │
│    - Description: "Analysis of 15 vendor agreements"        │
│    - Template: [Optional] Select existing or use default    │
│    → Clicks "Create Project"                                │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. System creates project, navigates to Project Detail      │
│    Status: NEW → DOCUMENTS_UPLOADED (after upload)          │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User uploads documents                                    │
│    - Selects multiple PDF files (up to 20 files)            │
│    - Clicks "Upload Documents"                              │
│    → System parses each PDF (1-2 seconds per file)          │
│    → Extracts text and page count                           │
│    Status: DOCUMENTS_UPLOADED                               │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. User starts field extraction                              │
│    - Reviews field template (5 default fields shown)        │
│    - Clicks "Start Extraction"                              │
│    → System creates AsyncRequest (status: PENDING)          │
│    → For each (document, field): AI extraction runs         │
│    → Progress: 0% → 20% → 40% → ... → 100%                 │
│    Status: EXTRACTING → READY (when complete)              │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. User views extraction table                               │
│    - Clicks "View Extraction Table"                         │
│    → System displays tabular view:                          │
│      Rows = Fields, Columns = Documents                     │
│    → Each cell shows: extracted value, confidence score,    │
│      citations (page numbers + text snippets)               │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. User reviews and edits fields                            │
│    - Clicks "Confirm" on correct extractions                │
│    - Clicks "Reject" on incorrect extractions               │
│    - Clicks "Edit" to manually correct values               │
│    → System updates review_status and stores edits          │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. User exports results                                      │
│    - Clicks "Export to Excel"                               │
│    → System generates XLSX with:                            │
│      - Main sheet: Field x Document matrix                  │
│      - Metadata: Confidence, Citations, Review Status       │
│    → Browser downloads file                                 │
└─────────────────────────────────────────────────────────────┘
```

**Outcome**: User has extracted, reviewed, and exported key fields from 15+ documents in under 30 minutes.

---

### Flow 2: Create Custom Template from AI Suggestions

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User navigates to "Templates" → "Template Builder"       │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User uploads a sample document                            │
│    - Selects a representative contract PDF                  │
│    - Clicks "Upload & Continue"                             │
│    → System parses PDF and stores temporarily               │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. User triggers AI field suggestion                         │
│    - Clicks "Start AI Analysis"                             │
│    → System sends document text to GPT-4 with prompt:       │
│      "Analyze this legal document and suggest 8-12 key      │
│       fields to extract with descriptions and examples"     │
│    → AI returns structured JSON: field suggestions          │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User reviews AI suggestions                               │
│    → System displays suggested fields with checkboxes:      │
│      ☑ Parties (TEXT): "Names of contracting entities"     │
│      ☑ Effective Date (DATE): "When contract begins"       │
│      ☑ Payment Terms (TEXT): "Payment schedule details"    │
│      ☑ Termination Clause (TEXT): "Contract end conditions"│
│    → User unchecks unwanted fields                          │
│    → User clicks "Add Custom Field" to add more             │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. User saves template                                       │
│    - Enters template name: "Vendor Agreement Template"      │
│    - Clicks "Save Template"                                 │
│    → System stores FieldTemplate with version=1             │
│    → Navigates to template list                             │
└─────────────────────────────────────────────────────────────┘
```

**Outcome**: User has a reusable custom template for future projects, created in 5 minutes instead of 30 minutes of manual definition.

---

### Flow 3: Quality Evaluation (AI vs Human)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User navigates to Project → "Quality Evaluation"         │
│    → System displays extraction table with "Add Reference"  │
│      buttons on each cell                                   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. User adds human references (ground truth)                 │
│    Option A: Click "Add Reference" on individual cells       │
│      → Modal shows:                                         │
│         - AI Extracted Value                                │
│         - Original PDF Text (citations)                     │
│         - Input box: "Enter CORRECT value"                  │
│      → User types correct value, clicks "Save"              │
│                                                             │
│    Option B: Click "Auto-Confirm All" (demo mode)           │
│      → System treats all AI values as ground truth          │
│                                                             │
│    → System stores HumanReference records                   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. User runs evaluation                                      │
│    - Clicks "Run Evaluation" button                         │
│    - Enters report name: "Q4 Evaluation Report"            │
│    → System compares AI extractions vs human references:    │
│      For each field:                                        │
│        - Calculate similarity (0.0 to 1.0)                  │
│        - Classify: EXACT_MATCH (1.0)                       │
│                    PARTIAL_MATCH (≥0.85)                   │
│                    MISMATCH (<0.85)                        │
│                    MISSING_AI (no extraction)              │
│                    MISSING_HUMAN_REFERENCE (no ground truth)│
│    → Aggregate: accuracy_score = exact_matches / comparable │
│    → Store EvaluationReport                                 │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. User views evaluation results                             │
│    → System displays:                                       │
│      - Accuracy Score: 87.5%                                │
│      - Exact Matches: 35 fields                             │
│      - Partial Matches: 5 fields                            │
│      - Mismatches: 3 fields                                 │
│      - Field-level table showing AI vs Human comparison     │
│    → User can click on mismatches to see details            │
└─────────────────────────────────────────────────────────────┘
```

**Outcome**: User understands AI performance and can identify areas for improvement or additional training data needs.

---

## API Behaviors

### API Behavior 1: Project Creation

**Endpoint**: `POST /api/create-project`

**Request**:
```json
{
  "name": "Q4 Vendor Contracts",
  "description": "Analysis of vendor agreements",
  "template_id": "uuid-or-null"
}
```

**Success Response** (201 Created):
```json
{
  "id": "proj_12345",
  "name": "Q4 Vendor Contracts",
  "description": "Analysis of vendor agreements",
  "status": "NEW",
  "template_id": null,
  "created_at": "2026-02-09T10:00:00Z"
}
```

**Error Responses**:
- 400 Bad Request: Missing required fields
- 404 Not Found: Invalid template_id reference

**Side Effects**:
- Creates Project record in database
- Sets status = "NEW"
- Generates UUID for project_id

---

### API Behavior 2: Document Upload

**Endpoint**: `POST /api/upload-documents/{project_id}`

**Request**: FormData with files
```
files: [contract1.pdf, contract2.pdf, ...]
```

**Success Response** (200 OK):
```json
{
  "project_id": "proj_12345",
  "total_uploaded": 3,
  "uploaded_documents": [
    {
      "id": "doc_001",
      "filename": "contract1.pdf",
      "parse_status": "PARSED",
      "page_count": 15
    },
    ...
  ],
  "failed_uploads": []
}
```

**Error Responses**:
- 400 Bad Request: No files provided
- 413 Payload Too Large: File exceeds size limit
- 415 Unsupported Media Type: Non-PDF file

**Side Effects**:
- Saves PDF files to disk (/uploads/{project_id}/)
- Parses each PDF with PyPDF2
- Creates Document records with parsed_text
- Updates Project.status → "DOCUMENTS_UPLOADED" (if successful)

**Edge Cases**:
- Corrupted PDF → parse_status = "FAILED", error logged
- Duplicate filename → Appends timestamp to avoid collision

---

### API Behavior 3: Field Extraction (Async)

**Endpoint**: `POST /api/generate-all-answers/{project_id}`

**Request**: No body (uses project's template)

**Success Response** (202 Accepted):
```json
{
  "id": "req_abc123",
  "project_id": "proj_12345",
  "request_type": "EXTRACT_FIELDS",
  "status": "PENDING",
  "progress": 0,
  "total_items": 75,
  "created_at": "2026-02-09T10:05:00Z"
}
```

**Status Polling**: `GET /api/get-request-status/{request_id}`

**Progress Response** (200 OK):
```json
{
  "id": "req_abc123",
  "status": "PROCESSING",
  "progress": 45,
  "total_items": 75,
  "processed_items": 34,
  "error_message": null
}
```

**Completion Response** (200 OK):
```json
{
  "id": "req_abc123",
  "status": "COMPLETED",
  "progress": 100,
  "total_items": 75,
  "processed_items": 75,
  "completed_at": "2026-02-09T10:08:00Z"
}
```

**Side Effects**:
- Creates AsyncRequest record
- For each (document, field):
  - Sends OpenAI API request
  - Parses response: value, confidence, citations, normalized
  - Creates ExtractedField record
  - Updates AsyncRequest.progress
- Updates Project.status → "READY" when complete

**Error Handling**:
- OpenAI API failure → retry 3 times with exponential backoff
- If all retries fail → status = "FAILED", error_message logged

---

### API Behavior 4: Review Action

**Endpoint**: `POST /api/update-answer`

**Request**:
```json
{
  "extraction_id": "ext_789",
  "action": "EDIT",
  "manual_value": "Corrected party names: Alice Corp and Bob Inc",
  "review_notes": "Fixed missing party name"
}
```

**Success Response** (200 OK):
```json
{
  "success": true,
  "message": "Field updated successfully",
  "extraction_id": "ext_789",
  "review_status": "MANUAL_UPDATED"
}
```

**Valid Actions**:
- "CONFIRM" → review_status = "CONFIRMED", manual_value = null
- "REJECT" → review_status = "REJECTED", manual_value = null
- "EDIT" → review_status = "MANUAL_UPDATED", manual_value = <provided text>

**Side Effects**:
- Updates ExtractedField:
  - review_status
  - manual_value (if action=EDIT)
  - reviewed_at = current timestamp

**Business Rule**: Once confirmed/rejected/edited, the AI's original raw_value is preserved for audit purposes.

---

## Status Transitions

### Project Status State Machine

```
     NEW
      │
      │ (documents uploaded)
      ▼
DOCUMENTS_UPLOADED
      │
      │ (extraction started)
      ▼
  EXTRACTING
      │
      │ (extraction completed)
      ▼
    READY
```

**Status Definitions**:
- **NEW**: Project created, no documents yet
- **DOCUMENTS_UPLOADED**: At least one PDF uploaded and parsed
- **EXTRACTING**: Async extraction job in progress
- **READY**: Extraction completed, table can be viewed

**Invalid Transitions** (prevented by system):
- NEW → EXTRACTING (must upload docs first)
- DOCUMENTS_UPLOADED → READY (must run extraction first)

---

### Document Parse Status

```
  PENDING
     │
     │ (parse started)
     ▼
   PARSED  or  FAILED
```

- **PENDING**: Uploaded but not yet processed
- **PARSED**: Successfully extracted text
- **FAILED**: Parsing error (corrupted PDF, unsupported format)

---

### Review Status Transitions

```
        PENDING
           │
           ├─────────────┬──────────────┐
           ▼             ▼              ▼
      CONFIRMED     REJECTED    MANUAL_UPDATED
```

**Rules**:
- User can change from any status to any other status (reversible)
- System preserves original AI value in raw_value column
- Manual edits stored in manual_value column

---

### Async Request Status

```
   PENDING
      │
      │ (job picked up)
      ▼
  PROCESSING
      │
      ├──────────────┐
      ▼              ▼
  COMPLETED      FAILED
```

- **PENDING**: Queued, not started
- **PROCESSING**: In progress (0-99%)
- **COMPLETED**: Finished successfully (100%)
- **FAILED**: Error occurred, check error_message

---

## Edge Cases & Error Handling

### Edge Case 1: Empty Extraction Result

**Scenario**: AI returns no value for a field (e.g., "Termination Clause not found in document").

**System Behavior**:
- Stores ExtractedField with:
  - raw_value = "" (empty string)
  - confidence_score = 0.0
  - citations = [] (empty array)
  - normalized_value = null
- UI displays: "—" or "N/A" in table cell
- User can manually enter value via "Edit" action

---

### Edge Case 2: Duplicate Document Upload

**Scenario**: User uploads the same PDF file twice.

**System Behavior**:
- Checks if filename already exists for this project
- If duplicate:
  - Appends timestamp: `contract.pdf` → `contract_20260209_100530.pdf`
  - Proceeds with upload
- Alternative: Show warning and skip duplicate (configurable)

---

### Edge Case 3: Extraction Job Interrupted

**Scenario**: Backend crashes mid-extraction (processed 30 of 75 fields).

**System Behavior**:
- AsyncRequest status remains "PROCESSING"
- On restart, system detects stale request (>10 minutes in PROCESSING state)
- Options:
  - Resume from last processed_items (recommended)
  - Mark as "FAILED" and require manual restart

**Current Implementation**: Does not auto-resume. User must restart extraction.

---

### Edge Case 4: User Deletes Project During Extraction

**Scenario**: User clicks "Delete Project" while extraction is running.

**System Behavior**:
- Database CASCADE deletes:
  - All documents
  - All extracted_fields
  - All async_requests
- Frontend shows confirmation: "This will cancel in-progress extraction. Continue?"
- If confirmed: Deletion proceeds, backend job gracefully fails

---

### Edge Case 5: OpenAI API Rate Limit Hit

**Scenario**: Too many API requests in short time.

**System Behavior**:
- OpenAI returns 429 Too Many Requests
- System implements exponential backoff:
  - Wait 1 second, retry
  - Wait 2 seconds, retry
  - Wait 4 seconds, retry
- After 3 retries: Mark field as failed, continue with remaining fields
- AsyncRequest.error_message = "Some fields failed due to rate limiting"

---

### Edge Case 6: User Creates Reference for Non-Existent Field

**Scenario**: User manually creates a human reference for a field that was never extracted.

**System Behavior**:
- HumanReference is created successfully
- During evaluation:
  - match_type = "MISSING_AI"
  - Counts towards missing_ai metric
  - Shows in field-level results with AI value = "N/A"

---

### Edge Case 7: Template Update After Extraction

**Scenario**: User updates a template (adds a new field) after extraction is complete.

**System Behavior**:
- Existing projects are NOT automatically re-extracted
- User must:
  - Navigate to project
  - Click "Re-Run Extraction" (if implemented)
  - Or: Create new project with updated template

**Future Enhancement**: "Re-extract Missing Fields" button to only extract newly added fields.

---

## Business Rules

### Rule 1: Field Template Constraints
- Minimum fields: 1
- Maximum fields: 50 (prevents performance issues)
- Field names must be unique within a template
- Field types: TEXT, DATE, NUMBER, ENUM, BOOLEAN

### Rule 2: Confidence Scoring
- Range: 0.0 to 1.0
- Thresholds:
  - ≥ 0.8: High confidence (green badge)
  - 0.5 - 0.79: Medium confidence (yellow badge)
  - < 0.5: Low confidence (red badge)

### Rule 3: Citation Format
- JSON array of objects: `[{page: int, text: string, notes: string}]`
- Each citation must include page number and text snippet
- Notes field is optional

### Rule 4: Evaluation Similarity Scoring
- Exact Match: similarity == 1.0 (100% match)
- Partial Match: similarity >= 0.85 (85%+ match)
- Mismatch: similarity < 0.85

### Rule 5: Export Behavior
- CSV format: Simple value matrix (no metadata)
- Excel format:
  - Sheet 1: Value matrix
  - Sheet 2: Confidence scores
  - Sheet 3: Citations
  - Sheet 4: Review status

### Rule 6: Project Deletion
- Soft delete recommended (not implemented in MVP)
- Hard delete: Cascade deletes all related records
- User must confirm: "Are you sure? This action cannot be undone."

---

## UI/UX Requirements

### Requirement 1: Loading States
- All async operations show loading indicator
- Extraction progress bar updates every 2 seconds
- Disable action buttons during operations

### Requirement 2: Error Messages
- User-friendly error messages (not technical stack traces)
- Examples:
  - "File upload failed. Please try again."
  - "Extraction failed for 3 fields. View details?"

### Requirement 3: Confirmation Dialogs
- Destructive actions require confirmation:
  - Delete project
  - Delete template
  - Delete reference

### Requirement 4: Accessibility
- Color-coded badges also have text labels
- Keyboard navigation supported
- ARIA labels for screen readers (future)

### Requirement 5: Mobile Responsiveness
- Table view scrolls horizontally on small screens
- Action buttons stack vertically on mobile
- Modals are full-screen on mobile

---

## Conclusion

This functional design document specifies the complete behavior of the Legal Tabular Review system, covering:

✅ End-to-end user workflows
✅ API request/response specifications
✅ Status transitions and state machines
✅ Edge case handling
✅ Business rules and constraints
✅ UI/UX requirements

This serves as the source of truth for implementation and testing.