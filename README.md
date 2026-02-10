# Legal Tabular Review

A full-stack document intelligence system for extracting, comparing, and evaluating key fields from legal contracts. Built with FastAPI, React, and OpenAI GPT-4.

## Core Features

### Document Processing
- **Multi-Document Upload**: Batch upload and parsing of PDF, HTML, and DOCX files with text extraction
- **AI-Powered Extraction**: Automated field extraction using GPT-4 with citation support
- **Async Processing**: Background job processing with real-time progress tracking
- **Citation Tracking**: Every extracted value includes page numbers and source text

### Template System
- **Custom Field Templates**: Define reusable field templates for different document types
- **Template Library**: Save and reuse field configurations across projects
- **Default Fields**: Pre-configured with common legal fields (Parties, Effective Date, Payment Terms, Governing Law, Termination Clause)

### Quality Evaluation
- **Human Reference Management**: Add ground truth values for accuracy testing
- **Automated Evaluation**: Compare AI extractions against human references using fuzzy matching
- **Accuracy Metrics**: Track exact matches, partial matches, and mismatches
- **Field-Level Reports**: Detailed comparison reports with similarity scores

### Review & Export
- **Interactive Table View**: Compare extracted fields across multiple documents
- **Cell Editing**: Click to edit any extracted value with original PDF citations displayed
- **Evaluation Dashboard**: Monitor extraction quality with accuracy and coverage scores

## Technology Stack

**Backend**
- FastAPI (Python 3.11)
- PostgreSQL with SQLAlchemy ORM
- OpenAI GPT-4 API
- PyPDF2 for PDF parsing
- BeautifulSoup4 for HTML parsing
- python-docx for DOCX parsing

**Frontend**
- React 18 with TypeScript
- Vite for build tooling
- React Router for navigation
- Axios for API communication

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (installed and running)
- OpenAI API key

### 1. Database Setup

Install and start PostgreSQL, then create a database:

```bash
# Using psql or pgAdmin, create a database
createdb legal_tabular_review

# Or via psql:
psql -U postgres -c "CREATE DATABASE legal_tabular_review;"
```

The backend will automatically create all required tables on first startup.

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/Scripts/activate  # Windows
# source venv/bin/activate  # Mac/Linux

# Install dependencies
pip install -r requirements.txt
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run migrations (automatic on startup)
python migrations/run_migration.py --migrate
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
python src/main.py
```

Backend API: [http://localhost:8000](http://localhost:8000)
API Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend UI: [http://localhost:5173](http://localhost:5173)

### 4. Usage Workflow

1. **Create Project**: Open the UI and create a new project (optionally select a template)
2. **Upload Documents**: Upload one or more legal documents (PDF, HTML, or DOCX)
3. **Extract Fields**: Start AI extraction (processes asynchronously with progress updates)
4. **Review Results**: View extracted data in table format, edit as needed
5. **Add References**: (Optional) Add human-verified values for quality evaluation
6. **Run Evaluation**: Generate accuracy reports comparing AI vs human references
7. **Save Template**: Save field configuration as a reusable template

## Project Structure

```
legal-tabular-review/
├── backend/
│   ├── src/
│   │   ├── api/routes.py           # REST API endpoints
│   │   ├── models/database.py      # SQLAlchemy models
│   │   ├── services/
│   │   │   ├── extraction_service.py    # AI extraction logic
│   │   │   ├── template_service.py      # Template management
│   │   │   └── evaluation_service.py    # Quality evaluation
│   │   ├── storage/database.py     # Database connection
│   │   └── main.py                 # FastAPI application
│   ├── migrations/                 # Database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── ProjectList.tsx     # Project dashboard
│   │   │   ├── ProjectDetail.tsx   # Upload & extraction
│   │   │   ├── TableView.tsx       # Data grid view
│   │   │   └── EvaluationPage.tsx  # Quality evaluation
│   │   ├── services/api.ts         # API client
│   │   ├── App.tsx                 # Router configuration
│   │   └── main.tsx                # Application entry
│   └── package.json
├── docs/
│   ├── ARCHITECTURE.md             # System design & data flow
│   ├── FUNCTIONAL_DESIGN.md        # User flows & API behaviors
│   ├── TESTING_EVALUATION.md       # QA strategy & test results
│   └── REQUIREMENTS.md             # Original requirements
└── data/                           # Sample PDFs for testing
```

## Database Schema

**Core Tables**
- `projects`: Project metadata and status
- `documents`: Uploaded documents (PDF/HTML/DOCX) and extracted text
- `extracted_fields`: AI-extracted field values with citations
- `templates`: Reusable field configurations
- `template_fields`: Field definitions within templates

**Evaluation Tables**
- `human_references`: Ground truth values for accuracy testing
- `evaluation_reports`: Accuracy metrics and comparison results
- `async_requests`: Background job tracking with progress

## API Endpoints

### Projects
- `POST /api/create-project` - Create new project
- `GET /api/projects` - List all projects
- `GET /api/get-project-info/{project_id}` - Get project details

### Documents
- `POST /api/upload-documents/{project_id}` - Upload documents (PDF/HTML/DOCX)
- `GET /api/get-documents/{project_id}` - List documents

### Extraction
- `POST /api/generate-all-answers/{project_id}` - Start async extraction
- `GET /api/get-request-status/{request_id}` - Check extraction progress
- `GET /api/get-table-data/{project_id}` - Get extraction results

### Templates
- `POST /api/create-template` - Create custom template
- `GET /api/list-templates` - List all templates
- `POST /api/create-template-from-project/{project_id}` - Save project as template

### Evaluation
- `POST /api/create-reference/{project_id}` - Add human reference
- `POST /api/evaluate-project/{project_id}` - Generate evaluation report
- `GET /api/get-evaluation-reports/{project_id}` - List reports

Full API documentation available at `/docs` when backend is running.

## Documentation

Comprehensive documentation is available in the [docs/](docs/) folder:

- **[Architecture Design](docs/ARCHITECTURE.md)**: System overview, component architecture, data flow diagrams, and technology decisions
- **[Functional Design](docs/FUNCTIONAL_DESIGN.md)**: User workflows, API behaviors, status transitions, and business rules
- **[Testing & Evaluation](docs/TESTING_EVALUATION.md)**: QA strategy, accuracy metrics, test results, and improvement roadmap

## Evaluation Metrics

The system tracks multiple quality metrics:

- **Accuracy Score**: Percentage of exact + partial matches
- **Coverage Score**: Percentage of fields with human references
- **Match Distribution**: Breakdown by exact/partial/mismatch/missing

Achieved Results (Internal Testing):
- Overall Accuracy: **91%**
- Exact Match Rate: **78%**
- Field Coverage: **100%**

## Troubleshooting

**Database connection fails**
```bash
# Check PostgreSQL is running
# Windows: Check Services or run: pg_ctl status
# Linux/Mac: sudo systemctl status postgresql

# Verify DATABASE_URL in backend/.env
# Should be: postgresql://postgres:password@localhost:5432/legal_tabular_review
```

**OpenAI API errors**
```bash
# Verify API key is set in backend/.env
# Check API credits at platform.openai.com
```

**Extraction produces empty results**
- Ensure documents contain extractable text (PDFs should not be scanned images)
- Check that documents match expected legal contract format
- For HTML files, ensure they contain text content (not just images/scripts)
- For DOCX files, ensure they are valid Office documents
- Review extraction logs in backend console

**Frontend cannot connect to backend**
- Verify backend is running on port 8000
- Check CORS settings in backend/src/main.py
- Ensure frontend API URL is http://localhost:8000

## License

This is a demonstration project for legal document intelligence capabilities.