"""
Health check endpoints.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from engine.api.dependencies import check_readiness


router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str = "1.0.0"


class ReadinessResponse(BaseModel):
    """Readiness check response with component status."""
    ready: bool
    tesseract: bool
    gemini: dict


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Liveness check endpoint.

    Returns immediately to indicate the server is running.
    Does not check external dependencies.
    """
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check():
    """
    Readiness check endpoint.

    Verifies that all required dependencies are available:
    - Tesseract OCR is installed
    - Gemini API key is configured
    """
    status = check_readiness()
    return ReadinessResponse(
        ready=status.ready,
        tesseract=status.tesseract_available,
        gemini={
            "available": status.gemini_available,
            "error": status.gemini_error,
        },
    )
