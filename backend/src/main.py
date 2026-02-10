"""Main FastAPI application for Legal Tabular Review system"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router
from src.storage.db import init_db
import os

# Create FastAPI app
app = FastAPI(
    title="Legal Tabular Review API",
    description="API for extracting and reviewing fields from legal documents",
    version="1.0.0 (Phase 1)"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default port
        "http://localhost:3000",  # Alternative React port
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api", tags=["api"])


# Startup event
@app.on_event("startup")
def startup_event():
    """Initialize application on startup"""
    print("=" * 60)
    print("Legal Tabular Review API - Phase 1")
    print("=" * 60)

    # Initialize database
    try:
        init_db()
        print("✓ Database initialized successfully")
    except Exception as e:
        print(f"✗ Database initialization failed: {e}")
        raise

    # Check OpenAI API key
    if not os.getenv("OPENAI_API_KEY"):
        print("⚠ Warning: OPENAI_API_KEY not set. Extraction will fail.")
    else:
        print("✓ OpenAI API key found")

    print("=" * 60)
    print("API Documentation: http://localhost:8000/docs")
    print("Health Check: http://localhost:8000/api/health")
    print("=" * 60)


# Root endpoint
@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Legal Tabular Review API",
        "version": "1.0.0",
        "phase": "Phase 1 - Core Infrastructure (MVP)",
        "docs": "/docs",
        "health": "/api/health"
    }


# Run with uvicorn if executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        reload_excludes=["*.pyc", "__pycache__"]
    )
