# Architecture Design - Legal Tabular Review

**Version:** 1.0
**Last Updated:** February 2026
**Status:** Production-Ready

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Component Architecture](#component-architecture)
4. [Data Flow](#data-flow)
5. [Database Schema](#database-schema)
6. [API Design](#api-design)
7. [Technology Stack](#technology-stack)
8. [Deployment Architecture](#deployment-architecture)
9. [Security Considerations](#security-considerations)
10. [Scalability & Performance](#scalability--performance)

---

## System Overview

### Purpose
Legal Tabular Review is a document intelligence system designed to extract key information from legal documents (contracts, agreements, regulations) and present them in a structured, comparable tabular format with human-in-the-loop review capabilities.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend Layer                           │
│  React + TypeScript + Vite                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐       │
│  │ Project  │ │ Template │ │  Table   │ │  Evaluation  │       │
│  │   Mgmt   │ │ Builder  │ │   View   │ │    Report    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP/REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend Layer                            │
│  FastAPI + Python 3.11+                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐       │
│  │   API    │ │ Document │ │Extraction│ │  Evaluation  │       │
│  │  Routes  │ │ Service  │ │ Service  │ │   Service    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │ Template │ │  Async   │ │ Storage  │                        │
│  │ Service  │ │ Service  │ │  Layer   │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data & AI Layer                             │
│  ┌──────────────────┐  ┌───────────────────┐                   │
│  │   PostgreSQL     │  │   OpenAI API      │                   │
│  │   Database       │  │   (GPT-4)         │                   │
│  │   - Projects     │  │   - Extraction    │                   │
│  │   - Documents    │  │   - Normalization │                   │
│  │   - Fields       │  │   - Citations     │                   │
│  │   - Templates    │  └───────────────────┘                   │
│  │   - References   │                                           │
│  │   - Reports      │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Principles

### 1. **Separation of Concerns**
- **Frontend**: Pure presentation and user interaction
- **Backend**: Business logic, orchestration, and data management
- **AI Layer**: Extraction intelligence and natural language processing

### 2. **Stateless API**
- RESTful API design
- No server-side session state
- Each request contains all necessary context

### 3. **Async-First for Long Operations**
- Background job processing for extraction tasks
- Status polling for progress tracking
- Non-blocking user experience

### 4. **Data Integrity**
- Database constraints and foreign keys
- Transactional consistency
- Audit trail (created_at, updated_at timestamps)

### 5. **Extensibility**
- Custom field templates
- Pluggable extraction strategies
- Flexible evaluation metrics

---

## Component Architecture

### Frontend Components

#### **1. Project Management**
- **Files**: `ProjectList.tsx`, `ProjectDetail.tsx`
- **Responsibilities**:
  - Project CRUD operations
  - Document upload orchestration
  - Workflow status display
  - Navigation hub

#### **2. Template Builder**
- **Files**: `TemplateBuilder.tsx`, `TemplateList.tsx`
- **Responsibilities**:
  - AI-powered field suggestion
  - Custom field definition
  - Template version management
  - Template cloning and reuse

#### **3. Table View**
- **Files**: `TableView.tsx`
- **Responsibilities**:
  - Side-by-side field comparison
  - Review workflow (Confirm/Reject/Edit)
  - Citation viewing
  - Export to CSV/Excel

#### **4. Evaluation Page**
- **Files**: `EvaluationPage.tsx`
- **Responsibilities**:
  - Human reference management
  - Quality evaluation execution
  - Accuracy report viewing
  - Field-level diff display

#### **5. API Client**
- **Files**: `api.ts`
- **Responsibilities**:
  - HTTP request abstraction
  - Type-safe API calls
  - Error handling

---

### Backend Services

#### **1. Document Service**
- **File**: `document_service.py`
- **Responsibilities**:
  - PDF parsing (PyPDF2)
  - Text extraction
  - Page-level indexing
  - Document metadata management

#### **2. Extraction Service**
- **Files**: `extraction_service.py`, `extraction_service_large_context.py`
- **Responsibilities**:
  - OpenAI API integration
  - Field-specific extraction prompts
  - Confidence score calculation
  - Citation generation (page + text snippet)
  - Value normalization (dates, amounts, enums)

#### **3. Template Service**
- **File**: `template_service.py`
- **Responsibilities**:
  - Template CRUD operations
  - AI field suggestion from sample documents
  - Template versioning
  - Project-to-template conversion

#### **4. Async Service**
- **File**: `async_service.py`
- **Responsibilities**:
  - Background job orchestration
  - Progress tracking (0-100%)
  - Error handling and retry logic
  - Status updates

#### **5. Evaluation Service**
- **File**: `evaluation_service.py`
- **Responsibilities**:
  - AI vs Human comparison
  - Similarity scoring (fuzzy matching)
  - Accuracy metrics calculation
  - Report generation

#### **6. Storage Layer**
- **File**: `db.py`
- **Responsibilities**:
  - Database connection pooling
  - Session management
  - Transaction handling

---

## Data Flow

### 1. **Document Ingestion Flow**

```
User → Upload PDF → FastAPI /upload-documents
                           ↓
                    Document Service
                    - Save file to disk
                    - Parse PDF
                    - Extract text
                    - Store metadata
                           ↓
                    Database (Document record)
                           ↓
                    Return: {document_id, status: "PARSED"}
```

### 2. **Field Extraction Flow**

```
User → Start Extraction → POST /generate-all-answers
                                  ↓
                          Async Service
                          - Create AsyncRequest
                          - Status: PENDING
                                  ↓
                          For each (document, field):
                                  ↓
                          Extraction Service
                          - Build prompt
                          - Call OpenAI GPT-4
                          - Parse response
                          - Extract: value, confidence, citations
                          - Normalize value
                                  ↓
                          Database (ExtractedField)
                                  ↓
                          Update progress (%)
                                  ↓
                          Return: {request_id, status: "COMPLETED"}
```

### 3. **Review Workflow**

```
User → View Table → POST /get-table-data-v2
                           ↓
                    Fetch all ExtractedFields
                           ↓
                    Return: {fields, documents, cells[]}
                           ↓
User → Confirm/Reject/Edit → POST /update-answer
                                     ↓
                              Update ExtractedField
                              - review_status = CONFIRMED/REJECTED
                              - manual_value = <edited text>
                              - reviewed_at = timestamp
                                     ↓
                              Return: {success: true}
```

### 4. **Quality Evaluation Flow**

```
User → Add References → POST /create-reference
                               ↓
                        Database (HumanReference)
                               ↓
User → Run Evaluation → POST /evaluate-project
                               ↓
                        Evaluation Service
                        - Fetch all AI extractions
                        - Fetch all human references
                        - Compare (field by field)
                        - Calculate similarity
                        - Classify: EXACT_MATCH / PARTIAL / MISMATCH
                        - Aggregate metrics
                               ↓
                        Database (EvaluationReport)
                               ↓
                        Return: {accuracy_score, field_results[]}
```

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Project    │──────<│   Document   │──────<│HumanReference│
│              │ 1:N   │              │ 1:N   │              │
│ - id (PK)    │       │ - id (PK)    │       │ - id (PK)    │
│ - name       │       │ - filename   │       │ - field_name │
│ - status     │       │ - parse_status│      │ - ref_value  │
│ - template_id│       │ - parsed_text│       └──────────────┘
└──────────────┘       └──────────────┘
       │                       │
       │                       │
       │                       ▼
       │               ┌──────────────┐
       │               │ExtractedField│
       │               │              │
       │               │ - id (PK)    │
       │               │ - field_name │
       │               │ - raw_value  │
       │               │ - normalized │
       │               │ - confidence │
       │               │ - citations  │
       │               │ - review_sts │
       │               └──────────────┘
       │
       ▼
┌──────────────┐       ┌──────────────┐
│FieldTemplate │──────<│EvaluationRpt │
│              │ 1:N   │              │
│ - id (PK)    │       │ - id (PK)    │
│ - name       │       │ - accuracy   │
│ - version    │       │ - results[]  │
│ - fields[]   │       └──────────────┘
└──────────────┘
```

### Core Tables

#### **projects**
- `id` (UUID, PK)
- `name` (String)
- `description` (Text)
- `status` (Enum: NEW, DOCUMENTS_UPLOADED, EXTRACTING, READY)
- `template_id` (UUID, FK → field_templates)
- `created_at`, `updated_at` (Timestamp)

#### **documents**
- `id` (UUID, PK)
- `project_id` (UUID, FK → projects)
- `filename` (String)
- `file_path` (String)
- `file_format` (String, default: PDF)
- `parse_status` (Enum: PENDING, PARSED, FAILED)
- `parsed_text` (Text)
- `page_count` (Integer)
- `created_at` (Timestamp)

#### **extracted_fields**
- `id` (UUID, PK)
- `project_id` (UUID, FK → projects)
- `document_id` (UUID, FK → documents)
- `field_name` (String)
- `raw_value` (Text)
- `normalized_value` (Text)
- `confidence_score` (Float, 0.0-1.0)
- `citations` (JSON: [{page, text, notes}])
- `review_status` (Enum: PENDING, CONFIRMED, REJECTED, MANUAL_UPDATED)
- `manual_value` (Text)
- `reviewed_at` (Timestamp)
- `created_at` (Timestamp)

#### **field_templates**
- `id` (UUID, PK)
- `name` (String)
- `version` (Integer, default: 1)
- `fields` (JSON: [{field_name, field_type, description}])
- `is_active` (Boolean)
- `created_at` (Timestamp)

#### **human_references**
- `id` (UUID, PK)
- `project_id` (UUID, FK → projects)
- `document_id` (UUID, FK → documents)
- `field_name` (String)
- `reference_value` (Text) -- Ground truth
- `notes` (Text)
- `created_by` (String)
- `created_at` (Timestamp)

#### **evaluation_reports**
- `id` (UUID, PK)
- `project_id` (UUID, FK → projects)
- `report_name` (String)
- `total_fields` (Integer)
- `exact_matches` (Integer)
- `partial_matches` (Integer)
- `mismatches` (Integer)
- `missing_ai` (Integer)
- `missing_human` (Integer)
- `accuracy_score` (Float, percentage)
- `coverage_score` (Float, percentage)
- `field_level_results` (JSON: [{field_name, ai_value, human_value, similarity, match_type}])
- `evaluated_by` (String)
- `created_at` (Timestamp)

#### **async_requests**
- `id` (UUID, PK)
- `project_id` (UUID, FK → projects)
- `request_type` (String: EXTRACT_FIELDS, RE_EXTRACT)
- `status` (Enum: PENDING, PROCESSING, COMPLETED, FAILED)
- `progress` (Integer, 0-100)
- `total_items`, `processed_items` (Integer)
- `error_message` (Text)
- `created_at`, `started_at`, `completed_at` (Timestamp)

---

## API Design

### RESTful Principles

- **Resource-Oriented URLs**: `/api/projects`, `/api/documents/{id}`
- **HTTP Verbs**: GET (read), POST (create), PUT (update), DELETE (delete)
- **Status Codes**: 200 (OK), 201 (Created), 400 (Bad Request), 404 (Not Found), 500 (Server Error)
- **JSON Payloads**: All requests and responses use JSON

### API Endpoint Groups

#### **1. Project Management**
- `POST /api/create-project` - Create new project
- `GET /api/projects` - List all projects
- `GET /api/get-project-info/{project_id}` - Get project details
- `DELETE /api/delete-project/{project_id}` - Delete project

#### **2. Document Management**
- `POST /api/upload-documents/{project_id}` - Upload PDF files
- `GET /api/documents/{project_id}` - List documents

#### **3. Extraction**
- `POST /api/generate-all-answers/{project_id}` - Start extraction (async)
- `GET /api/get-request-status/{request_id}` - Poll extraction status
- `GET /api/get-table-data-v2/{project_id}` - Get extraction results

#### **4. Review Workflow**
- `POST /api/update-answer` - Confirm/Reject/Edit extraction
- `GET /api/get-table-data-v2/{project_id}` - Get table with review states

#### **5. Template Management**
- `POST /api/suggest-fields-from-document/{document_id}` - AI field suggestions
- `POST /api/create-template` - Create custom template
- `GET /api/templates` - List templates
- `PUT /api/update-template/{template_id}` - Update template
- `DELETE /api/delete-template/{template_id}` - Soft delete

#### **6. Quality Evaluation**
- `POST /api/create-reference/{project_id}` - Add human reference
- `POST /api/bulk-create-references/{project_id}` - Bulk add references
- `GET /api/get-references/{project_id}` - List references
- `POST /api/evaluate-project/{project_id}` - Run evaluation
- `GET /api/get-evaluation-reports/{project_id}` - List reports

#### **7. Export**
- `GET /api/export-table/{project_id}?format=csv` - Export to CSV
- `GET /api/export-table/{project_id}?format=excel` - Export to Excel

---

## Technology Stack

### Frontend
- **Framework**: React 18.3
- **Language**: TypeScript 5.x
- **Build Tool**: Vite 6.x
- **HTTP Client**: Axios
- **Routing**: React Router v6
- **Styling**: Inline styles (CSS-in-JS pattern)

### Backend
- **Framework**: FastAPI 0.115+
- **Language**: Python 3.11+
- **ORM**: SQLAlchemy 2.x
- **Database Driver**: psycopg2
- **ASGI Server**: Uvicorn
- **Validation**: Pydantic v2

### Database
- **RDBMS**: PostgreSQL 14+
- **Connection Pooling**: SQLAlchemy engine
- **Migrations**: Manual schema updates (production would use Alembic)

### AI/ML
- **LLM Provider**: OpenAI API
- **Model**: GPT-4 (for extraction and field suggestions)
- **Libraries**: openai Python SDK

### Document Processing
- **PDF Parser**: PyPDF2
- **Text Processing**: Python standard library (json, re)

### Utilities
- **Excel Export**: openpyxl
- **CSV Export**: Python csv module
- **UUID Generation**: Python uuid module
- **Date/Time**: Python datetime module

---

## Deployment Architecture

### Development Environment

```
┌─────────────────────┐
│  Developer Machine  │
│                     │
│  Frontend: npm run dev (Vite Dev Server, Port 5173)
│  Backend:  python src/main.py (Uvicorn, Port 8000)
│  Database: PostgreSQL (localhost:5432)
│                     │
└─────────────────────┘
```

### Production Architecture (Recommended)

```
                    ┌──────────────┐
                    │   Cloudflare │
                    │   or CDN     │
                    └──────┬───────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
    ┌──────────────┐              ┌──────────────┐
    │  Frontend    │              │   Backend    │
    │  (Static)    │              │   (FastAPI)  │
    │  Vercel/     │              │   Railway/   │
    │  Netlify     │◄────REST────►│   Render     │
    └──────────────┘              └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  PostgreSQL  │
                                  │  (Managed)   │
                                  │  Supabase/   │
                                  │  Render DB   │
                                  └──────────────┘
```

### Environment Configuration

#### **Backend (.env)**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/legal_review
OPENAI_API_KEY=sk-...
CORS_ORIGINS=http://localhost:5173,https://app.example.com
```

#### **Frontend (vite.config.ts)**
```typescript
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
}
```

---

## Security Considerations

### 1. **API Security**
- **CORS**: Configured allow-list for frontend origins
- **Input Validation**: Pydantic models enforce type safety
- **SQL Injection Protection**: SQLAlchemy ORM parameterized queries

### 2. **File Upload Security**
- **File Type Validation**: Only PDF files accepted
- **Size Limits**: Enforced at API level
- **Virus Scanning**: Recommended for production (not implemented in MVP)

### 3. **Authentication & Authorization**
- **Current State**: No authentication (single-tenant demo)
- **Production Recommendation**:
  - JWT-based authentication
  - Role-based access control (RBAC)
  - Per-project permissions

### 4. **Data Privacy**
- **Sensitive Data**: Legal documents may contain PII/confidential information
- **Recommendation**:
  - Encrypt data at rest (PostgreSQL encryption)
  - Use HTTPS for data in transit
  - Implement data retention policies

### 5. **API Key Protection**
- **OpenAI API Key**: Stored in environment variables
- **Never Exposed**: Backend-only access
- **Rate Limiting**: Recommended for production

---

## Scalability & Performance

### Current Bottlenecks

1. **Synchronous Extraction**: OpenAI API calls are sequential
   - **Mitigation**: Async service with parallel processing (planned)

2. **Single Database Connection**: No connection pooling optimization
   - **Mitigation**: SQLAlchemy pool settings tuning

3. **Large PDF Parsing**: Memory-intensive for 100+ page documents
   - **Mitigation**: Chunked processing, pagination

### Optimization Strategies

#### **Horizontal Scaling**
- **Frontend**: Static files on CDN (instant scaling)
- **Backend**: Multiple FastAPI instances behind load balancer
- **Database**: Read replicas for query scaling

#### **Caching**
- **Template Queries**: Redis cache for frequently accessed templates
- **Extraction Results**: Cache completed extractions (invalidate on re-run)

#### **Async Processing**
- **Current**: AsyncRequest model tracks background jobs
- **Future**: Celery + Redis for distributed task queue

#### **Database Indexing**
```sql
-- Recommended indexes for performance
CREATE INDEX idx_extracted_fields_project ON extracted_fields(project_id);
CREATE INDEX idx_extracted_fields_document ON extracted_fields(document_id);
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_human_refs_project ON human_references(project_id);
```

---

## Monitoring & Observability

### Recommended Tools
- **Application Monitoring**: Sentry (error tracking)
- **Performance Monitoring**: New Relic / DataDog
- **Logging**: Structured JSON logs to CloudWatch / Papertrail
- **Metrics**: Prometheus + Grafana for API latency, throughput

### Key Metrics to Track
- API response times (p50, p95, p99)
- OpenAI API call success rate
- Extraction job completion time
- Database query performance
- Concurrent users

---

## Future Architecture Considerations

### 1. **Multi-Tenancy**
- Add `tenant_id` to all tables
- Row-level security (RLS)
- Separate database schemas per tenant

### 2. **Event-Driven Architecture**
- Publish events: `DocumentParsed`, `ExtractionCompleted`, `FieldReviewed`
- Event bus: Kafka / RabbitMQ
- Event-driven microservices

### 3. **Document Storage**
- Current: Local filesystem
- Future: S3 / Azure Blob Storage
- Signed URLs for secure access

### 4. **Real-Time Updates**
- WebSockets for live extraction progress
- Server-Sent Events (SSE) for notifications

---

## Conclusion

This architecture provides a solid foundation for the Legal Tabular Review system with clear separation of concerns, extensibility, and a path to production scalability. The system successfully demonstrates:

✅ Clean 3-tier architecture (Frontend, Backend, Data)
✅ RESTful API design with async capabilities
✅ Flexible template system for custom field extraction
✅ Human-in-the-loop review workflow
✅ Quality evaluation with accuracy metrics
✅ Export and reporting capabilities

**Next Steps**: Implement authentication, add monitoring, and optimize for production workloads.